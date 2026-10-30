import { z } from "zod";

export const categories = [
  "Plumbing",
  "Electrical",
  "Carpentry",
  "RO / Water",
  "AC / Cooler",
  "Lock repair",
  "Other",
] as const;
export const statuses = [
  "Pending",
  "Approved",
  "Assigned",
  "In progress",
  "Awaiting verification",
  "Completed",
  "Rejected",
  "Reopened",
] as const;
export const urgencies = ["Low", "Normal", "High", "Emergency"] as const;
export type Category = (typeof categories)[number];
export type Status = (typeof statuses)[number];
export type Urgency = (typeof urgencies)[number];
export const analysisSchema = z.object({
  category: z.enum(categories),
  urgency: z.enum(urgencies),
  specialization: z.enum(categories),
  summary: z.string().min(5).max(500),
  reason: z.string().min(5).max(700),
});
export type Analysis = z.infer<typeof analysisSchema> & {
  model: string;
  analyzedAt: string;
};
export type History = {
  id: string;
  at: string;
  actor: string;
  action: string;
  note: string;
};
export type Repair = {
  id: string;
  technicianId: string;
  summary: string;
  labour: number;
  parts: { name: string; quantity: number; unitCost: number }[];
  completedAt: string;
  verifiedAt?: string;
  reopenedAt?: string;
};
export type Complaint = {
  id: string;
  title: string;
  description: string;
  reporter: string;
  propertyId: string;
  room: string;
  category: Category;
  urgency: Urgency;
  status: Status;
  createdAt: string;
  updatedAt: string;
  version: number;
  technicianId?: string;
  estimate?: number;
  images: string[];
  analysis?: Analysis;
  repairs: Repair[];
  history: History[];
};
export type Technician = {
  id: string;
  name: string;
  initials: string;
  specialization: Category[];
  available: boolean;
  verified: boolean;
  reliability: number;
  rating: number;
  jobsCompleted: number;
  responseMinutes: number;
  lat: number;
  lng: number;
  phone: string;
  color: string;
};
export type Property = {
  id: string;
  name: string;
  address: string;
  rooms: number;
  lat: number;
  lng: number;
  membership: number;
};
export const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(160),
  phone: z.string().max(30),
  organization: z.string().trim().min(2).max(100),
  emergencyAlerts: z.boolean(),
  verificationAlerts: z.boolean(),
  dailyDigest: z.boolean(),
  autoAnalyze: z.boolean(),
  compactRows: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
export type ManagerState = {
  revision: number;
  properties: Property[];
  technicians: Technician[];
  complaints: Complaint[];
  settings: Settings;
};
export type Snapshot = ManagerState & {
  meta: {
    demo: boolean;
    storage: string;
    aiConfigured: boolean;
    aiModel: string;
    assignmentEngine: boolean;
  };
};
export type Recommendation = {
  technicianId: string;
  score: number;
  distanceKm: number;
  workload: number;
  explanation: string;
};
export type Recommendations = {
  source:
    | "CampusFix matching rules"
    | "Team assignment engine"
    | "Gemma recommendations";
  model?: string;
  items: Recommendation[];
};
export const assistantSchema = z.object({
  summary: z.string().min(5).max(1200),
  recurring: z
    .array(
      z.object({
        title: z.string().max(180),
        complaintIds: z.array(z.string()).max(12),
        explanation: z.string().max(500),
      }),
    )
    .max(8),
  urgent: z
    .array(z.object({ complaintId: z.string(), reason: z.string().max(500) }))
    .max(12),
  actions: z
    .array(
      z.object({
        title: z.string().max(180),
        detail: z.string().max(700),
        complaintIds: z.array(z.string()).max(12),
      }),
    )
    .max(8),
});
export type AssistantResult = z.infer<typeof assistantSchema> & {
  model: string;
  generatedAt: string;
};
export const active = (c: Complaint) =>
  !["Completed", "Rejected"].includes(c.status);
export const assigned = (c: Complaint) =>
  ["Assigned", "In progress", "Awaiting verification"].includes(c.status);
export const repairCost = (r: Repair) =>
  r.labour + r.parts.reduce((s, p) => s + p.quantity * p.unitCost, 0);
export const complaintCost = (c: Complaint) =>
  c.repairs.filter((r) => r.verifiedAt).reduce((s, r) => s + repairCost(r), 0);
export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
export class ManagerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const createSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(10).max(2500),
  reporter: z.string().trim().min(2).max(80),
  propertyId: z.string().min(1),
  room: z.string().trim().min(1).max(50),
  category: z.enum(categories),
  urgency: z.enum(urgencies),
  images: z
    .array(
      z
        .string()
        .max(1_400_000)
        .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
    )
    .max(3)
    .default([]),
});
export const actionSchema = z.object({
  version: z.number().int().min(1),
  action: z.enum([
    "approve",
    "reject",
    "prioritize",
    "reopen",
    "assign",
    "start",
    "report",
    "verify",
    "estimate",
  ]),
  note: z.string().trim().max(1500).default(""),
  technicianId: z.string().optional(),
  urgency: z.enum(urgencies).optional(),
  estimate: z.number().min(0).max(1000000).optional(),
  report: z
    .object({
      summary: z.string().trim().min(10).max(2000),
      labour: z.number().min(0).max(1000000),
      parts: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(100),
            quantity: z.number().int().min(1).max(1000),
            unitCost: z.number().min(0).max(100000),
          }),
        )
        .max(30),
    })
    .optional(),
});
export function audit(
  c: Complaint,
  actor: string,
  action: string,
  note: string,
) {
  const at = new Date().toISOString();
  c.updatedAt = at;
  c.version++;
  c.history.unshift({ id: crypto.randomUUID(), at, actor, action, note });
}
export function applyAction(
  s: ManagerState,
  id: string,
  input: z.infer<typeof actionSchema>,
) {
  const c = s.complaints.find((c) => c.id === id);
  if (!c) throw new ManagerError(404, "Complaint not found.");
  if (c.version !== input.version)
    throw new ManagerError(
      409,
      "This complaint changed. Refresh it before trying again.",
    );
  const allow = (...values: Status[]) => {
    if (!values.includes(c.status))
      throw new ManagerError(
        409,
        `This action is not available while a complaint is ${c.status.toLowerCase()}.`,
      );
  };
  const requireNote = () => {
    if (input.note.length < 5)
      throw new ManagerError(400, "Add a reason of at least 5 characters.");
  };
  switch (input.action) {
    case "approve":
      allow("Pending", "Reopened");
      c.status = "Approved";
      break;
    case "reject":
      allow("Pending", "Approved", "Reopened");
      requireNote();
      c.status = "Rejected";
      c.technicianId = undefined;
      break;
    case "prioritize":
      if (!active(c))
        throw new ManagerError(
          409,
          "Reopen the complaint before changing priority.",
        );
      if (!input.urgency) throw new ManagerError(400, "Select a priority.");
      c.urgency = input.urgency;
      break;
    case "reopen":
      allow("Completed", "Rejected", "Awaiting verification");
      requireNote();
      c.status = "Reopened";
      c.technicianId = undefined;
      if (c.repairs[0]) c.repairs[0].reopenedAt = new Date().toISOString();
      break;
    case "assign": {
      allow("Approved", "Assigned", "In progress", "Reopened");
      const t = s.technicians.find((t) => t.id === input.technicianId);
      if (
        !t ||
        !t.verified ||
        !t.available ||
        !t.specialization.includes(c.category)
      )
        throw new ManagerError(
          400,
          "Choose an available, verified technician with the required specialization.",
        );
      if (
        s.complaints.filter(
          (x) => x.id !== id && x.technicianId === t.id && assigned(x),
        ).length >= 4
      )
        throw new ManagerError(
          409,
          "This technician is at capacity. Choose another technician.",
        );
      c.technicianId = t.id;
      c.status = "Assigned";
      break;
    }
    case "start":
      allow("Assigned");
      c.status = "In progress";
      break;
    case "estimate":
      if (!active(c))
        throw new ManagerError(
          409,
          "Only open complaints can have an estimate approved.",
        );
      if (input.estimate === undefined)
        throw new ManagerError(400, "Enter the approved estimate.");
      c.estimate = input.estimate;
      break;
    case "report":
      allow("In progress", "Assigned");
      if (!input.report || !c.technicianId)
        throw new ManagerError(
          400,
          "A repair report and assigned technician are required.",
        );
      c.repairs.unshift({
        ...input.report,
        id: crypto.randomUUID(),
        technicianId: c.technicianId,
        completedAt: new Date().toISOString(),
      });
      c.status = "Awaiting verification";
      break;
    case "verify":
      allow("Awaiting verification");
      if (!c.repairs[0] || c.repairs[0].verifiedAt)
        throw new ManagerError(409, "No unverified repair report found.");
      if (c.estimate === undefined || repairCost(c.repairs[0]) > c.estimate)
        throw new ManagerError(
          409,
          "Approve an estimate covering the repair total before verification.",
        );
      c.repairs[0].verifiedAt = new Date().toISOString();
      c.status = "Completed";
      break;
  }
  const details =
    input.action === "assign"
      ? `Assigned to ${s.technicians.find((t) => t.id === c.technicianId)?.name}. ${input.note}`
      : input.action === "estimate"
        ? `Approved estimate: ${money(c.estimate ?? 0)}. ${input.note}`
        : input.action === "prioritize"
          ? `Priority set to ${c.urgency}. ${input.note}`
          : input.note;
  audit(
    c,
    s.settings.name,
    input.action === "report"
      ? "Repair report recorded by manager"
      : input.action,
    details,
  );
  return c;
}
