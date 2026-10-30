import { Router } from "express";
import { z } from "zod";
import { db, transaction } from "./db";
import {
  complaintInclude,
  mapComplaint,
  mutateState,
  readState,
  saveState,
  notifyComplaint,
} from "./store";
import {
  createSchema,
  actionSchema,
  categories,
  audit,
  ManagerError,
  type Complaint,
} from "../lib/manager/domain";
import {
  meta,
  analyze,
  authorizedComplaint,
  checkAi,
  versionSchema,
} from "./ai";
import { nextComplaintId } from "./manager-routes";
import { technicianAdvice } from "../lib/manager/gemma";
import { validateImages } from "./validation";
import type { SessionUser } from "../lib/portal/types";
import { requireRoles, publicUser, rateLimit } from "./auth";

export const studentRouter = Router(),
  technicianRouter = Router(),
  sharedRouter = Router();
async function notifications(userId: string) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
studentRouter.get("/", async (_req, res) => {
  const user = res.locals.user as SessionUser;
  const [property, complaints, notices] = await Promise.all([
    db.hostel.findUniqueOrThrow({ where: { id: user.propertyId! } }),
    db.complaint.findMany({
      where: { studentId: user.id },
      include: complaintInclude,
      orderBy: { createdAt: "desc" },
    }),
    notifications(user.id),
  ]);
  res.json({
    user,
    property: {
      ...property,
      inviteCodeHash: undefined,
      rooms: property.roomCount,
    },
    complaints: complaints.map(mapComplaint),
    notifications: notices,
    meta: meta(),
  });
});
studentRouter.get("/complaints", async (_req, res) =>
  res.json(
    await db.complaint
      .findMany({
        where: { studentId: res.locals.user.id },
        include: complaintInclude,
        orderBy: { createdAt: "desc" },
      })
      .then((rows) => rows.map(mapComplaint)),
  ),
);
studentRouter.get("/complaints/:id", async (req, res) =>
  res.json(await authorizedComplaint(String(req.params.id), res.locals.user)),
);
studentRouter.get("/complaints/:id/history", async (req, res) =>
  res.json(
    (await authorizedComplaint(String(req.params.id), res.locals.user)).history,
  ),
);
studentRouter.post("/complaints", async (req, res) => {
  const user = res.locals.user as SessionUser;
  const input = createSchema.omit({ reporter: true }).strict().parse(req.body);
  if (input.propertyId !== user.propertyId)
    throw new ManagerError(
      403,
      "You can report issues only for your enrolled hostel.",
    );
  validateImages(input.images);
  await rateLimit(`report:${user.id}`, 10);
  const c = await transaction(async (tx) => {
    const s = await readState(tx),
      before = structuredClone(s),
      now = new Date().toISOString();
    const c: Complaint = {
      ...input,
      reporter: user.name,
      id: nextComplaintId(s.complaints),
      status: "Pending",
      createdAt: now,
      updatedAt: now,
      version: 1,
      repairs: [],
      history: [
        {
          id: crypto.randomUUID(),
          at: now,
          actor: user.name,
          action: "Submitted",
          note: "Maintenance issue reported by the resident.",
        },
      ],
    };
    s.complaints.unshift(c);
    s.revision++;
    await saveState(tx, s, before);
    await tx.complaint.update({
      where: { id: c.id },
      data: { studentId: user.id },
    });
    await notifyComplaint(tx, c, "Complaint received", `${c.id}: ${c.title}`);
    return c;
  });
  // Save first: a provider failure can never discard a student's complaint.
  let complaint = c,
    aiError: string | undefined;
  if (meta().aiEnabled) {
    try {
      complaint = await analyze(c.id, c.version, user);
    } catch (e) {
      aiError =
        e instanceof ManagerError
          ? e.message
          : "AI analysis failed. Your complaint is saved; retry from its details.";
    }
  } else
    aiError =
      "Gemma analysis is paused pending server configuration. Your complaint is saved and visible to the manager.";
  res.status(201).json({ complaint, aiError });
});
technicianRouter.get("/", async (_req, res) => {
  const user = res.locals.user as SessionUser;
  const [tech, complaints, hostels, notices] = await Promise.all([
    db.technician.findUniqueOrThrow({ where: { id: user.technicianId! } }),
    db.complaint.findMany({
      where: {
        OR: [
          { technicianId: user.technicianId },
          { assignments: { some: { technicianId: user.technicianId } } },
        ],
      },
      include: {
        ...complaintInclude,
        assignments: {
          where: { technicianId: user.technicianId },
          orderBy: { assignedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.hostel.findMany(),
    notifications(user.id),
  ]);
  res.json({
    user,
    technician: { ...tech, userId: undefined },
    complaints: complaints.map((c) => {
      const mapped = mapComplaint(c);
      if (c.technicianId !== user.technicianId) delete mapped.technician;
      return mapped;
    }),
    properties: hostels.map((p) => ({
      ...p,
      inviteCodeHash: undefined,
      rooms: p.roomCount,
    })),
    notifications: notices,
    meta: meta(),
  });
});
technicianRouter.get("/jobs", async (_req, res) =>
  res.json(
    await db.complaint
      .findMany({
        where: { technicianId: res.locals.user.technicianId },
        include: complaintInclude,
        orderBy: { updatedAt: "desc" },
      })
      .then((rows) => rows.map(mapComplaint)),
  ),
);
technicianRouter.get("/jobs/:id", async (req, res) =>
  res.json(await authorizedComplaint(String(req.params.id), res.locals.user)),
);
technicianRouter.get("/history", async (_req, res) =>
  res.json(
    await db.repairReport.findMany({
      where: { technicianId: res.locals.user.technicianId },
      include: { parts: true },
      orderBy: { completedAt: "desc" },
    }),
  ),
);
const reportSchema = actionSchema.shape.report
  .unwrap()
  .extend({
    workPerformed: z.string().trim().min(10).max(2000),
    images: createSchema.shape.images,
  });
const jobAction = z
  .object({
    version: z.number().int().min(1),
    action: z.enum(["accept", "decline", "start", "progress", "complete"]),
    note: z.string().trim().max(1500).default(""),
    report: reportSchema.optional(),
  })
  .strict();
technicianRouter.post("/jobs/:id/actions", async (req, res) => {
  const input = jobAction.parse(req.body),
    user = res.locals.user as SessionUser,
    id = String(req.params.id);
  if (input.report) validateImages(input.report.images);
  const result = await mutateState(async (s, tx) => {
    const c = s.complaints.find((c) => c.id === id),
      tech = s.technicians.find((t) => t.id === user.technicianId);
    if (!c || c.technicianId !== user.technicianId)
      throw new ManagerError(404, "Assigned job not found.");
    if (!tech?.verified)
      throw new ManagerError(
        403,
        "Your profile must be verified by a manager before working on jobs.",
      );
    if (c.version !== input.version)
      throw new ManagerError(
        409,
        "This job changed. Refresh before trying again.",
      );
    const assignment = await tx.assignment.findFirst({
      where: { complaintId: id, technicianId: user.technicianId },
      orderBy: { assignedAt: "desc" },
    });
    if (!assignment)
      throw new ManagerError(409, "No current assignment found.");
    const pending = c.status === "Assigned" && assignment.status === "PENDING";
    if (input.action === "accept" || input.action === "decline") {
      if (!pending)
        throw new ManagerError(
          409,
          "Only a pending assignment can be accepted or declined.",
        );
      if (input.action === "decline" && input.note.length < 5)
        throw new ManagerError(
          400,
          "Provide a reason of at least 5 characters.",
        );
      await tx.assignment.update({
        where: { id: assignment.id },
        data:
          input.action === "accept"
            ? { status: "ACCEPTED", acceptedAt: new Date() }
            : {
                status: "DECLINED",
                declineReason: input.note,
                endedAt: new Date(),
              },
      });
      if (input.action === "decline") {
        c.technicianId = undefined;
        c.status = "Approved";
      }
    } else {
      if (assignment.status !== "ACCEPTED")
        throw new ManagerError(
          409,
          "Accept the assignment before starting work.",
        );
      if (input.action === "start") {
        if (c.status !== "Assigned")
          throw new ManagerError(
            409,
            "This repair cannot be started in its current state.",
          );
        c.status = "In progress";
      } else {
        if (c.status !== "In progress")
          throw new ManagerError(
            409,
            "Start the repair before adding progress or completing it.",
          );
        if (input.action === "progress" && input.note.length < 5)
          throw new ManagerError(
            400,
            "Add a progress update of at least 5 characters.",
          );
        if (input.action === "complete") {
          if (!input.report)
            throw new ManagerError(
              400,
              "A complete repair report is required.",
            );
          c.repairs.unshift({
            ...input.report,
            id: crypto.randomUUID(),
            technicianId: user.technicianId!,
            completedAt: new Date().toISOString(),
          });
          c.status = "Awaiting verification";
        }
      }
    }
    const labels = {
      accept: "Assignment accepted",
      decline: "Assignment declined",
      start: "Repair started",
      progress: "Progress update",
      complete: "Repair completed · awaiting verification",
    };
    audit(
      c,
      user.name,
      labels[input.action],
      input.note ||
        (input.action === "complete"
          ? input.report!.summary
          : labels[input.action]),
    );
    return c;
  });
  res.json(result);
});
technicianRouter.patch("/profile", async (req, res) => {
  const input = z
    .object({
      available: z.boolean().optional(),
      specialization: z.array(z.enum(categories)).min(1).max(7).optional(),
      serviceArea: z.string().trim().min(3).max(160).optional(),
      bio: z.string().trim().max(1000).optional(),
    })
    .strict()
    .parse(req.body);
  const result = await transaction(async (tx) => {
    const tech = await tx.technician.findUniqueOrThrow({
      where: { id: res.locals.user.technicianId },
    });
    const changedSpecialty =
      input.specialization &&
      JSON.stringify([...new Set(input.specialization)].sort()) !==
        JSON.stringify([...tech.specialization].sort());
    if (input.available && !tech.verified)
      throw new ManagerError(
        403,
        "Your manager must verify your profile before you become available.",
      );
    if (
      changedSpecialty &&
      (await tx.complaint.count({
        where: {
          technicianId: tech.id,
          status: { in: ["Assigned", "In progress", "Awaiting verification"] },
        },
      }))
    )
      throw new ManagerError(
        409,
        "Finish or ask your manager to reassign active jobs before changing specializations.",
      );
    const updated = await tx.technician.update({
      where: { id: tech.id },
      data: {
        ...input,
        ...(changedSpecialty ? { verified: false, available: false } : {}),
      },
    });
    await tx.workspace.update({
      where: { id: 1 },
      data: { revision: { increment: 1 } },
    });
    return updated;
  });
  res.json(result);
});
sharedRouter.get("/profile", (_req, res) => res.json(res.locals.user));
sharedRouter.patch("/profile", async (req, res) => {
  const input = z
    .object({
      name: z.string().trim().min(2).max(80),
      phone: z.string().trim().max(30),
    })
    .strict()
    .parse(req.body);
  const user = await transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: res.locals.user.id },
      data: input,
      include: { room: true, technician: true },
    });
    if (user.technician)
      await tx.technician.update({
        where: { id: user.technician.id },
        data: {
          ...input,
          initials: input.name
            .split(/\s+/)
            .map((s) => s[0])
            .slice(0, 2)
            .join(""),
        },
      });
    await tx.workspace.update({
      where: { id: 1 },
      data: { revision: { increment: 1 } },
    });
    return user;
  });
  res.json(publicUser(user));
});
sharedRouter.get("/notifications", async (_req, res) =>
  res.json(await notifications(res.locals.user.id)),
);
sharedRouter.post("/notifications/read", async (req, res) => {
  const { ids } = z
    .object({ ids: z.array(z.string()).min(1).max(100) })
    .parse(req.body);
  await db.notification.updateMany({
    where: { id: { in: ids }, userId: res.locals.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});
sharedRouter.post(
  "/ai/complaints/:id/analyze",
  requireRoles("STUDENT", "MANAGER"),
  async (req, res) =>
    res.json(
      await analyze(
        String(req.params.id),
        versionSchema.parse(req.body).version,
        res.locals.user,
      ),
    ),
);
sharedRouter.post(
  "/ai/technician/:id/advice",
  requireRoles("TECHNICIAN"),
  async (req, res) => {
    const { question } = z
      .object({
        question: z
          .string()
          .trim()
          .max(1000)
          .default(
            "Summarize this job and suggest general inspection considerations.",
          ),
      })
      .parse(req.body);
    const tech = await db.technician.findUniqueOrThrow({
      where: { id: res.locals.user.technicianId },
    });
    if (!tech.verified)
      throw new ManagerError(
        403,
        "Technician verification is required for job assistance.",
      );
    const c = await authorizedComplaint(String(req.params.id), res.locals.user);
    await checkAi(res.locals.user.id);
    res.json(await technicianAdvice(c, question));
  },
);
