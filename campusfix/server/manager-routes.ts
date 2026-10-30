import { Router } from "express";
import { z } from "zod";
import {
  actionSchema,
  createSchema,
  settingsSchema,
  applyAction,
  ManagerError,
  type Complaint,
} from "../lib/manager/domain";
import { recommendations } from "../lib/manager/matching";
import { explainRecommendations, managerAssistant } from "../lib/manager/gemma";
import { readState, mutateState, notifyComplaint } from "./store";
import { transaction } from "./db";
import { meta, analyze, checkAi, versionSchema } from "./ai";
import { clearSession } from "./auth";
import type { SessionUser } from "../lib/portal/types";
import { validateImages } from "./validation";

export const managerRouter = Router();
managerRouter.get("/", async (_req, res) => {
  const state = await readState();
  const user = res.locals.user as SessionUser;
  state.settings = {
    ...state.settings,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
  res.json({
    ...state,
    meta: {
      ...meta(),
      aiConfigured: meta().aiEnabled && meta().aiConfigured,
      storage: "PostgreSQL · Prisma",
      assignmentEngine: !!process.env.SMART_ASSIGNMENT_URL,
    },
  });
});
managerRouter.delete("/session", async (req, res) => {
  await clearSession(req, res);
  res.json({ ok: true });
});
managerRouter.post("/complaints", async (req, res) => {
  const input = createSchema.parse(req.body);
  validateImages(input.images);
  const c = await mutateState((s) => {
    if (!s.properties.some((p) => p.id === input.propertyId))
      throw new ManagerError(400, "Unknown property.");
    const now = new Date().toISOString(),
      id = nextComplaintId(s.complaints);
    const c: Complaint = {
      ...input,
      id,
      status: "Pending",
      createdAt: now,
      updatedAt: now,
      version: 1,
      repairs: [],
      history: [
        {
          id: crypto.randomUUID(),
          at: now,
          actor: res.locals.user.name,
          action: "Reported",
          note: `Reported on behalf of ${input.reporter}.`,
        },
      ],
    };
    s.complaints.unshift(c);
    return c;
  });
  await transaction((tx) =>
    notifyComplaint(tx, c, "Complaint received", c.title),
  );
  res.status(201).json(c);
});
export function nextComplaintId(complaints: Complaint[]) {
  return `CF-${Math.max(1000, ...complaints.map((c) => Number(c.id.replace("CF-", "")) || 0)) + 1}`;
}
managerRouter.patch("/complaints/:id", async (req, res) => {
  const input = actionSchema.parse(req.body);
  const result = await mutateState((s) => {
    s.settings.name = res.locals.user.name;
    const c = applyAction(s, String(req.params.id), input);
    if (input.action === "verify" && c.technicianId) {
      const t = s.technicians.find((t) => t.id === c.technicianId);
      if (t) t.jobsCompleted++;
    }
    return c;
  });
  res.json(result);
});
managerRouter.get("/complaints/:id/recommendations", async (req, res) => {
  const s = await readState(),
    c = s.complaints.find((c) => c.id === req.params.id);
  if (!c) throw new ManagerError(404, "Complaint not found.");
  res.json(await recommendations(s, c));
});
managerRouter.post("/complaints/:id/recommendations-ai", async (req, res) => {
  const { version } = versionSchema.parse(req.body);
  const s = await readState(),
    c = s.complaints.find((c) => c.id === req.params.id);
  if (!c) throw new ManagerError(404, "Complaint not found.");
  if (c.version !== version)
    throw new ManagerError(409, "Complaint changed. Refresh and retry.");
  await checkAi(res.locals.user.id);
  res.json(await explainRecommendations(s, c, await recommendations(s, c)));
});
managerRouter.post("/complaints/:id/analyze", async (req, res) =>
  res.json(
    await analyze(
      String(req.params.id),
      versionSchema.parse(req.body).version,
      res.locals.user,
    ),
  ),
);
managerRouter.post("/assistant", async (req, res) => {
  const { question } = z
    .object({ question: z.string().trim().min(3).max(1000) })
    .parse(req.body);
  await checkAi(res.locals.user.id);
  res.json(await managerAssistant(await readState(), question));
});
managerRouter.patch("/settings", async (req, res) => {
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
    .parse(req.body);
  await mutateState(async (s, tx) => {
    if (s.revision !== input.revision)
      throw new ManagerError(409, "Workspace changed. Refresh before saving.");
    if (
      input.properties.length !== s.properties.length ||
      new Set(input.properties.map((p) => p.id)).size !== s.properties.length ||
      input.properties.some((p) => !s.properties.some((x) => x.id === p.id))
    )
      throw new ManagerError(400, "Property IDs must match this workspace.");
    // Login email changes require an identity-verification flow, not a workspace setting.
    if (input.settings.email !== res.locals.user.email)
      throw new ManagerError(
        400,
        "Contact the network operator to change your login email.",
      );
    s.settings = input.settings;
    s.properties = s.properties.map((p) => ({
      ...p,
      ...input.properties.find((x) => x.id === p.id),
    }));
    await tx.user.update({
      where: { id: res.locals.user.id },
      data: { name: input.settings.name, phone: input.settings.phone },
    });
  });
  res.json({ ok: true });
});
managerRouter.patch("/technicians/:id", async (req, res) => {
  const input = z
    .object({
      available: z.boolean().optional(),
      verified: z.boolean().optional(),
      revision: z.number().int(),
    })
    .refine((x) => x.available !== undefined || x.verified !== undefined)
    .parse(req.body);
  await mutateState(async (s, tx) => {
    if (s.revision !== input.revision)
      throw new ManagerError(409, "Workspace changed. Refresh and retry.");
    const t = s.technicians.find((t) => t.id === req.params.id);
    if (!t) throw new ManagerError(404, "Technician not found.");
    if (input.available === true && !(input.verified ?? t.verified))
      throw new ManagerError(
        400,
        "Verify this technician before making them available.",
      );
    if (
      input.verified === false &&
      s.complaints.some(
        (c) =>
          c.technicianId === t.id &&
          ["Assigned", "In progress", "Awaiting verification"].includes(
            c.status,
          ),
      )
    )
      throw new ManagerError(
        409,
        "Reassign or finish active jobs before removing verification.",
      );
    if (input.available !== undefined) t.available = input.available;
    if (input.verified !== undefined) {
      t.verified = input.verified;
      if (!t.verified) t.available = false;
      const tech = await tx.technician.findUnique({ where: { id: t.id } });
      if (tech?.userId)
        await tx.notification.create({
          data: {
            userId: tech.userId,
            title: t.verified ? "Profile verified" : "Verification withdrawn",
            message: t.verified
              ? "Your manager approved your profile. Set your availability to receive jobs."
              : "Contact your manager to review your verification.",
          },
        });
    }
  });
  res.json({ ok: true });
});
