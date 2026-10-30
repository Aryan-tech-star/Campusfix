import { z } from "zod";
import {
  assigned,
  Complaint,
  ManagerState,
  Recommendations,
  ManagerError,
} from "./domain";
export function localRecommendations(
  s: ManagerState,
  c: Complaint,
): Recommendations {
  const p = s.properties.find((p) => p.id === c.propertyId)!;
  const rad = (n: number) => (n * Math.PI) / 180;
  const items = s.technicians
    .filter(
      (t) => t.verified && t.available && t.specialization.includes(c.category),
    )
    .map((t) => {
      const a =
        Math.sin(rad(t.lat - p.lat) / 2) ** 2 +
        Math.cos(rad(p.lat)) *
          Math.cos(rad(t.lat)) *
          Math.sin(rad(t.lng - p.lng) / 2) ** 2;
      const distanceKm =
        Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) /
        10;
      const workload = s.complaints.filter(
        (x) => x.id !== c.id && x.technicianId === t.id && assigned(x),
      ).length;
      const score = Math.round(
        Math.max(
          0,
          45 +
            t.reliability * 0.35 +
            Math.max(0, 10 - distanceKm) +
            Math.max(0, 10 - workload * 2.5),
        ),
      );
      return {
        technicianId: t.id,
        score,
        distanceKm,
        workload,
        explanation: `Verified ${c.category.toLowerCase()} specialist · ${distanceKm} km straight-line distance · ${workload} active jobs · ${t.reliability}% reliability. Available for manager-approved assignment.`,
      };
    })
    .filter((t) => t.workload < 4)
    .sort((a, b) => b.score - a.score);
  return { source: "CampusFix matching rules", items };
}
export async function recommendations(
  s: ManagerState,
  c: Complaint,
): Promise<Recommendations> {
  const local = localRecommendations(s, c),
    endpoint = process.env.SMART_ASSIGNMENT_URL;
  if (!endpoint) return local;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production")
      throw new Error("HTTPS required");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.SMART_ASSIGNMENT_TOKEN
          ? { authorization: `Bearer ${process.env.SMART_ASSIGNMENT_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        complaint: {
          id: c.id,
          category: c.category,
          urgency: c.urgency,
          propertyId: c.propertyId,
        },
        property: s.properties.find((p) => p.id === c.propertyId),
        candidates: local.items.map((r) => ({
          ...r,
          specialization: s.technicians.find((t) => t.id === r.technicianId)!
            .specialization,
          reliability: s.technicians.find((t) => t.id === r.technicianId)!
            .reliability,
        })),
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("upstream");
    const result = z
      .object({
        items: z
          .array(
            z.object({
              technicianId: z.string(),
              explanation: z.string().min(5).max(800),
            }),
          )
          .max(10),
      })
      .parse(await response.json());
    const seen = new Set<string>();
    const items = result.items.map((r) => {
      const match = local.items.find((x) => x.technicianId === r.technicianId);
      if (!match || seen.has(r.technicianId)) throw new Error("ineligible");
      seen.add(r.technicianId);
      return { ...match, explanation: r.explanation };
    });
    return { source: "Team assignment engine", items };
  } catch {
    throw new ManagerError(
      502,
      "The team assignment engine is unavailable or returned invalid recommendations. No assignment was made.",
    );
  }
}
