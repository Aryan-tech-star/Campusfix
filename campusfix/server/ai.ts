import { z } from "zod";
import { db } from "./db";
import { mutateState, complaintInclude, mapComplaint } from "./store";
import { analyzeComplaint, gemmaModel } from "../lib/manager/gemma";
import { ManagerError, audit } from "../lib/manager/domain";
import type { SessionUser } from "../lib/portal/types";
import { rateLimit } from "./auth";

export const meta = () => ({
  demo: process.env.SEED_DEMO === "true",
  aiConfigured: !!process.env.GEMMA_API_KEY,
  aiEnabled: process.env.GEMMA_ENABLED === "true",
  aiModel: gemmaModel(),
});
export async function checkAi(userId: string) {
  if (process.env.GEMMA_ENABLED !== "true")
    throw new ManagerError(
      503,
      "Gemma is paused pending server credential configuration. No AI response has been generated.",
    );
  await rateLimit(`ai:${userId}`, 60);
}
export async function authorizedComplaint(id: string, user: SessionUser) {
  const row = await db.complaint.findUnique({
    where: { id },
    include: complaintInclude,
  });
  if (
    !row ||
    (user.role === "STUDENT" && row.studentId !== user.id) ||
    (user.role === "TECHNICIAN" && row.technicianId !== user.technicianId)
  )
    throw new ManagerError(404, "Complaint not found.");
  return mapComplaint(row);
}
export const versionSchema = z.object({ version: z.number().int().min(1) });
export async function analyze(id: string, version: number, user: SessionUser) {
  const complaint = await authorizedComplaint(id, user);
  if (complaint.version !== version)
    throw new ManagerError(
      409,
      "This complaint changed. Refresh before analysis.",
    );
  await checkAi(user.id);
  const analysis = await analyzeComplaint(complaint);
  return mutateState((s) => {
    const c = s.complaints.find((c) => c.id === id)!;
    if (c.version !== version)
      throw new ManagerError(
        409,
        "This complaint changed during analysis. Please retry.",
      );
    c.analysis = analysis;
    if (["Pending", "Approved", "Reopened"].includes(c.status)) {
      c.category = analysis.category;
      const priorities = ["Low", "Normal", "High", "Emergency"];
      if (priorities.indexOf(analysis.urgency) > priorities.indexOf(c.urgency))
        c.urgency = analysis.urgency;
    }
    audit(c, "Gemma", "AI analysis", analysis.summary);
    return c;
  });
}
