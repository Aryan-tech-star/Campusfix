import { db, Prisma, transaction, type Tx } from "./db";
import type {
  ManagerState,
  Complaint,
  Technician,
  Analysis,
  Settings,
  Category,
  Status,
  Urgency,
} from "../lib/manager/domain";
import type { PortalComplaint } from "../lib/portal/types";

export const complaintInclude = {
  room: true,
  technician: true,
  repairs: {
    include: { parts: true },
    orderBy: { completedAt: "desc" as const },
  },
  history: { orderBy: { at: "desc" as const } },
  assignments: { orderBy: { assignedAt: "desc" as const }, take: 1 },
} satisfies Prisma.ComplaintInclude;
type Row = Prisma.ComplaintGetPayload<{ include: typeof complaintInclude }>;
export function mapComplaint(c: Row): PortalComplaint {
  const a = c.assignments[0];
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    reporter: c.reporter,
    propertyId: c.hostelId,
    room: c.room.number,
    category: c.category as Category,
    urgency: c.urgency as Urgency,
    status: c.status as Status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    version: c.version,
    technicianId: c.technicianId ?? undefined,
    estimate: c.estimate ?? undefined,
    images: c.images,
    analysis: c.analysis ? (c.analysis as unknown as Analysis) : undefined,
    repairs: c.repairs.map((r) => ({
      id: r.id,
      technicianId: r.technicianId,
      summary: r.summary,
      workPerformed: r.workPerformed,
      images: r.images,
      labour: r.labour,
      parts: r.parts.map((p) => ({
        name: p.name,
        quantity: p.quantity,
        unitCost: p.unitCost,
      })),
      completedAt: r.completedAt.toISOString(),
      verifiedAt: r.verifiedAt?.toISOString(),
      reopenedAt: r.reopenedAt?.toISOString(),
    })),
    history: c.history.map((h) => ({
      id: h.id,
      at: h.at.toISOString(),
      actor: h.actor,
      action: h.action,
      note: h.note,
    })),
    ...(a
      ? {
          assignment: {
            id: a.id,
            status: a.status,
            instructions: a.instructions,
            assignedAt: a.assignedAt.toISOString(),
            acceptedAt: a.acceptedAt?.toISOString(),
            declineReason: a.declineReason ?? undefined,
          },
        }
      : {}),
    ...(c.technician
      ? {
          technician: {
            id: c.technician.id,
            name: c.technician.name,
            specialization: c.technician.specialization as Category[],
            phone: c.technician.phone,
          },
        }
      : {}),
  };
}
export async function readState(
  client: Tx | typeof db = db,
): Promise<ManagerState> {
  const workspace = await client.workspace.findUniqueOrThrow({
    where: { id: 1 },
  });
  const hostels = await client.hostel.findMany({ orderBy: { id: "asc" } });
  const technicians = await client.technician.findMany({
    orderBy: { id: "asc" },
  });
  const complaints = await client.complaint.findMany({
    include: complaintInclude,
    orderBy: { createdAt: "desc" },
  });
  return {
    revision: workspace.revision,
    settings: workspace.settings as unknown as Settings,
    properties: hostels.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      rooms: p.roomCount,
      lat: p.lat,
      lng: p.lng,
      membership: p.membership,
    })),
    technicians: technicians.map(
      (t) =>
        ({
          ...t,
          specialization: t.specialization as Category[],
        }) as Technician,
    ),
    complaints: complaints.map(mapComplaint),
  };
}
const changed = (a: unknown, b: unknown) =>
  JSON.stringify(a) !== JSON.stringify(b);
export async function saveState(
  tx: Tx,
  s: ManagerState,
  before?: ManagerState,
) {
  await tx.workspace.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      revision: s.revision,
      settings: s.settings as unknown as Prisma.InputJsonValue,
    },
    update: {
      revision: s.revision,
      settings: s.settings as unknown as Prisma.InputJsonValue,
    },
  });
  for (const p of s.properties)
    if (
      changed(
        p,
        before?.properties.find((x) => x.id === p.id),
      )
    ) {
      const { rooms, ...rest } = p;
      await tx.hostel.upsert({
        where: { id: p.id },
        create: { ...rest, roomCount: rooms },
        update: { ...rest, roomCount: rooms },
      });
    }
  for (const t of s.technicians)
    if (
      changed(
        t,
        before?.technicians.find((x) => x.id === t.id),
      )
    ) {
      const fields = {
        name: t.name,
        initials: t.initials,
        specialization: [...t.specialization],
        available: t.available,
        verified: t.verified,
        reliability: t.reliability,
        rating: t.rating,
        jobsCompleted: t.jobsCompleted,
        responseMinutes: t.responseMinutes,
        lat: t.lat,
        lng: t.lng,
        phone: t.phone,
        color: t.color,
      };
      await tx.technician.upsert({
        where: { id: t.id },
        create: { id: t.id, ...fields },
        update: fields,
      });
    }
  for (const c of s.complaints) {
    const old = before?.complaints.find((x) => x.id === c.id);
    if (!changed(c, old)) continue;
    const room = await tx.room.upsert({
      where: { hostelId_number: { hostelId: c.propertyId, number: c.room } },
      create: { hostelId: c.propertyId, number: c.room },
      update: {},
    });
    const fields = {
      title: c.title,
      description: c.description,
      reporter: c.reporter,
      hostelId: c.propertyId,
      roomId: room.id,
      category: c.category,
      urgency: c.urgency,
      status: c.status,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
      version: c.version,
      technicianId: c.technicianId ?? null,
      estimate: c.estimate ?? null,
      images: c.images,
      analysis: c.analysis
        ? (c.analysis as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    };
    await tx.complaint.upsert({
      where: { id: c.id },
      create: { id: c.id, ...fields },
      update: fields,
    });
    for (const r of c.repairs) {
      const fields = {
        summary: r.summary,
        workPerformed: r.workPerformed ?? "",
        labour: r.labour,
        images: r.images ?? [],
        completedAt: new Date(r.completedAt),
        verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
        reopenedAt: r.reopenedAt ? new Date(r.reopenedAt) : null,
      };
      await tx.repairReport.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          complaintId: c.id,
          technicianId: r.technicianId,
          ...fields,
          parts: { create: r.parts },
        },
        update: fields,
      });
    }
    await tx.statusHistory.createMany({
      data: c.history.map((h) => ({
        ...h,
        at: new Date(h.at),
        complaintId: c.id,
      })),
      skipDuplicates: true,
    });
    const latest = c.history[0];
    if (c.status === "In progress" && old?.status === "Assigned")
      await tx.assignment.updateMany({
        where: {
          complaintId: c.id,
          technicianId: c.technicianId,
          status: "PENDING",
        },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
    if (
      c.status === "Assigned" &&
      c.technicianId &&
      (old?.status !== "Assigned" ||
        (latest?.id !== old?.history[0]?.id && latest?.action === "assign"))
    ) {
      await tx.assignment.updateMany({
        where: { complaintId: c.id, status: { in: ["PENDING", "ACCEPTED"] } },
        data: { status: "CANCELLED", endedAt: new Date() },
      });
      await tx.assignment.create({
        data: {
          complaintId: c.id,
          technicianId: c.technicianId,
          instructions: latest?.note ?? "",
          assignedAt: new Date(c.updatedAt),
        },
      });
    } else if (!before && c.technicianId) {
      await tx.assignment.create({
        data: {
          complaintId: c.id,
          technicianId: c.technicianId,
          status:
            c.status === "In progress"
              ? "ACCEPTED"
              : c.status === "Assigned"
                ? "PENDING"
                : "COMPLETED",
          assignedAt: new Date(c.createdAt),
          acceptedAt: c.status === "Assigned" ? null : new Date(c.createdAt),
        },
      });
    }
    if (c.status === "Awaiting verification")
      await tx.assignment.updateMany({
        where: { complaintId: c.id, status: { in: ["PENDING", "ACCEPTED"] } },
        data: { status: "COMPLETED", endedAt: new Date() },
      });
    if (["Reopened", "Rejected"].includes(c.status) && old?.status !== c.status)
      await tx.assignment.updateMany({
        where: { complaintId: c.id, status: { in: ["PENDING", "ACCEPTED"] } },
        data: { status: "CANCELLED", endedAt: new Date() },
      });
    if (old && latest && latest.id !== old.history[0]?.id)
      await notifyComplaint(
        tx,
        c,
        latest.action,
        latest.note || `${c.title}: ${c.status}.`,
        old.technicianId,
      );
  }
}
export async function notifyComplaint(
  tx: Tx,
  c: Complaint,
  title: string,
  message: string,
  previousTechnicianId?: string,
) {
  const row = await tx.complaint.findUniqueOrThrow({
    where: { id: c.id },
    select: { studentId: true },
  });
  const people = await tx.user.findMany({
    where: {
      active: true,
      OR: [
        { role: "MANAGER" },
        ...(row.studentId ? [{ id: row.studentId }] : []),
        {
          technician: {
            id: {
              in: [c.technicianId, previousTechnicianId].filter(
                Boolean,
              ) as string[],
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  await tx.notification.createMany({
    data: people.map((p) => ({
      userId: p.id,
      complaintId: c.id,
      title: title[0].toUpperCase() + title.slice(1),
      message: message.slice(0, 1500),
    })),
  });
}
export async function mutateState<T>(
  fn: (s: ManagerState, tx: Tx) => Promise<T> | T,
) {
  return transaction(async (tx) => {
    const s = await readState(tx),
      before = structuredClone(s);
    const result = await fn(s, tx);
    s.revision++;
    await saveState(tx, s, before);
    return result;
  });
}
