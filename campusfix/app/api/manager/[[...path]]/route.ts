import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  actionSchema,
  createSchema,
  settingsSchema,
  applyAction,
  audit,
  ManagerError,
  Complaint,
} from "@/lib/manager/domain";
import { readState, mutateState, storageName } from "@/lib/manager/store";
import {
  authenticate,
  checkOrigin,
  createSession,
  equalSecret,
  isDemo,
  rateLimit,
} from "@/lib/manager/auth";
import {
  analyzeComplaint,
  managerAssistant,
  gemmaModel,
  explainRecommendations,
} from "@/lib/manager/gemma";
import { recommendations } from "@/lib/manager/matching";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 4_500_000)
    throw new ManagerError(
      413,
      "Upload is too large. Use up to three images under 1 MB each.",
    );
  const text = await request.text();
  if (text.length > 4_500_000)
    throw new ManagerError(413, "Request too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ManagerError(400, "Invalid JSON request.");
  }
}
async function handle(request: NextRequest, context: Context) {
  try {
    const parts = (await context.params).path || [];
    const endpoint = parts.join("/");
    if (request.method !== "GET") checkOrigin(request);
    if (endpoint === "health" && request.method === "GET")
      return json({ status: "ok", service: "CampusFix manager" });
    if (endpoint === "session" && request.method === "POST") {
      rateLimit("manager-login", 8);
      const input = z
        .object({ password: z.string().min(1).max(300) })
        .parse(await body(request));
      if (
        !process.env.MANAGER_LOGIN_PASSWORD ||
        !equalSecret(input.password, process.env.MANAGER_LOGIN_PASSWORD)
      )
        throw new ManagerError(401, "The manager password is incorrect.");
      const response = json({ ok: true });
      response.cookies.set("campusfix_manager", createSession(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 28800,
      });
      return response;
    }
    authenticate(request);
    if (endpoint === "session" && request.method === "DELETE") {
      const response = json({ ok: true });
      response.cookies.set("campusfix_manager", "", {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      return response;
    }
    if (endpoint === "" && request.method === "GET") {
      const state = await readState();
      state.complaints.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json({
        ...state,
        meta: {
          demo: isDemo(),
          storage: storageName(),
          aiConfigured: !!process.env.GEMMA_API_KEY,
          aiModel: gemmaModel(),
          assignmentEngine: !!process.env.SMART_ASSIGNMENT_URL,
        },
      });
    }
    if (endpoint === "complaints" && request.method === "POST") {
      const input = createSchema.parse(await body(request));
      const result = await mutateState((s) => {
        if (!s.properties.some((p) => p.id === input.propertyId))
          throw new ManagerError(400, "Unknown property.");
        const next =
          Math.max(
            1000,
            ...s.complaints.map((c) => Number(c.id.replace("CF-", "")) || 0),
          ) + 1;
        const now = new Date().toISOString();
        const c: Complaint = {
          ...input,
          id: `CF-${next}`,
          status: "Pending",
          createdAt: now,
          updatedAt: now,
          version: 1,
          repairs: [],
          history: [
            {
              id: crypto.randomUUID(),
              at: now,
              actor: s.settings.name,
              action: "Reported",
              note: `Reported on behalf of ${input.reporter}.`,
            },
          ],
        };
        s.complaints.unshift(c);
        return c;
      });
      return json(result, 201);
    }
    if (
      parts[0] === "complaints" &&
      parts.length === 2 &&
      request.method === "PATCH"
    ) {
      const input = actionSchema.parse(await body(request));
      return json(await mutateState((s) => applyAction(s, parts[1], input)));
    }
    if (
      parts[0] === "complaints" &&
      parts[2] === "recommendations" &&
      request.method === "GET"
    ) {
      const s = await readState();
      const c = s.complaints.find((c) => c.id === parts[1]);
      if (!c) throw new ManagerError(404, "Complaint not found.");
      return json(await recommendations(s, c));
    }
    if (
      parts[0] === "complaints" &&
      parts[2] === "recommendations-ai" &&
      request.method === "POST"
    ) {
      rateLimit("gemma", 12);
      const input = z
        .object({ version: z.number().int() })
        .parse(await body(request));
      const s = await readState(),
        c = s.complaints.find((c) => c.id === parts[1]);
      if (!c) throw new ManagerError(404, "Complaint not found.");
      if (c.version !== input.version)
        throw new ManagerError(
          409,
          "This complaint changed. Refresh before requesting recommendations.",
        );
      return json(
        await explainRecommendations(s, c, await recommendations(s, c)),
      );
    }
    if (
      parts[0] === "complaints" &&
      parts[2] === "analyze" &&
      request.method === "POST"
    ) {
      rateLimit("gemma", 12);
      const input = z
        .object({ version: z.number().int() })
        .parse(await body(request));
      const s = await readState();
      const c = s.complaints.find((c) => c.id === parts[1]);
      if (!c) throw new ManagerError(404, "Complaint not found.");
      if (c.version !== input.version)
        throw new ManagerError(
          409,
          "The complaint changed. Refresh before analysis.",
        );
      const analysis = await analyzeComplaint(c);
      const result = await mutateState((state) => {
        const current = state.complaints.find((x) => x.id === c.id)!;
        if (current.version !== input.version)
          throw new ManagerError(
            409,
            "This complaint changed while Gemma was analyzing it. Please retry.",
          );
        current.analysis = analysis;
        if (["Pending", "Reopened", "Approved"].includes(current.status)) {
          current.category = analysis.category;
          const order = ["Low", "Normal", "High", "Emergency"];
          if (order.indexOf(analysis.urgency) > order.indexOf(current.urgency))
            current.urgency = analysis.urgency;
        }
        audit(
          current,
          "Gemma",
          "AI analysis",
          `${analysis.model}: ${analysis.summary}`,
        );
        return current;
      });
      return json(result);
    }
    if (endpoint === "assistant" && request.method === "POST") {
      rateLimit("gemma", 12);
      const input = z
        .object({ question: z.string().trim().min(3).max(1000) })
        .parse(await body(request));
      return json(await managerAssistant(await readState(), input.question));
    }
    if (endpoint === "settings" && request.method === "PATCH") {
      const input = z
        .object({
          revision: z.number().int(),
          settings: settingsSchema,
          properties: z
            .array(
              z.object({
                id: z.string(),
                name: z.string().trim().min(2).max(100),
                address: z.string().trim().min(5).max(250),
                rooms: z.number().int().min(1).max(5000),
              }),
            )
            .min(1)
            .max(50),
        })
        .parse(await body(request));
      await mutateState((s) => {
        if (s.revision !== input.revision)
          throw new ManagerError(
            409,
            "Workspace data changed. Refresh settings before saving.",
          );
        if (
          input.properties.length !== s.properties.length ||
          new Set(input.properties.map((p) => p.id)).size !==
            s.properties.length ||
          input.properties.some((p) => !s.properties.some((x) => x.id === p.id))
        )
          throw new ManagerError(
            400,
            "Property IDs must match this workspace.",
          );
        s.settings = input.settings;
        s.properties = s.properties.map((p) => ({
          ...p,
          ...input.properties.find((x) => x.id === p.id),
        }));
      });
      return json({ ok: true });
    }
    if (
      parts[0] === "technicians" &&
      parts.length === 2 &&
      request.method === "PATCH"
    ) {
      const input = z
        .object({ available: z.boolean(), revision: z.number().int() })
        .parse(await body(request));
      await mutateState((s) => {
        if (s.revision !== input.revision)
          throw new ManagerError(
            409,
            "Workspace data changed. Refresh before updating availability.",
          );
        const t = s.technicians.find((t) => t.id === parts[1]);
        if (!t) throw new ManagerError(404, "Technician not found.");
        t.available = input.available;
      });
      return json({ ok: true });
    }
    throw new ManagerError(404, "Manager endpoint not found.");
  } catch (error) {
    if (error instanceof ManagerError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join("; "),
        },
        400,
      );
    return json(
      {
        error:
          "The manager service could not complete this request. Your changes have not been confirmed. Please retry.",
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
