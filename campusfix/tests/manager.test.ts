import test from "node:test";
import assert from "node:assert/strict";
import { seedState } from "../lib/manager/seed";
import {
  applyAction,
  actionSchema,
  createSchema,
  complaintCost,
  analysisSchema,
  ManagerError,
  type ManagerState,
} from "../lib/manager/domain";
import { localRecommendations } from "../lib/manager/matching";
import {
  parseGemmaJson,
  analyzeComplaint,
  explainRecommendations,
  managerAssistant,
} from "../lib/manager/gemma";
const run = (
  s: ManagerState,
  id: string,
  action: string,
  extra: Record<string, unknown> = {},
) =>
  applyAction(
    s,
    id,
    actionSchema.parse({
      version: s.complaints.find((c) => c.id === id)!.version,
      action,
      ...extra,
    }),
  );

test("full lifecycle preserves costs and repair history after a revisit", () => {
  const s = seedState(),
    c = s.complaints[0];
  run(s, c.id, "approve");
  run(s, c.id, "assign", { technicianId: "t1" });
  run(s, c.id, "start");
  run(s, c.id, "estimate", { estimate: 800 });
  run(s, c.id, "report", {
    report: {
      summary: "Replaced washer and tested the pipe for leaks.",
      labour: 300,
      parts: [{ name: "Washer", quantity: 2, unitCost: 50 }],
    },
  });
  run(s, c.id, "verify");
  assert.equal(c.status, "Completed");
  assert.equal(complaintCost(c), 400);
  run(s, c.id, "reopen", {
    note: "The tap is leaking again after inspection.",
  });
  assert.equal(c.status, "Reopened");
  assert.equal(c.repairs.length, 1);
  assert.equal(complaintCost(c), 400);
  assert.ok(c.repairs[0].reopenedAt);
  assert.equal(c.technicianId, undefined);
  assert.equal(c.history.length, 8);
});
test("rejects stale concurrent writes without changing complaint", () => {
  const s = seedState(),
    c = s.complaints[0];
  run(s, c.id, "approve");
  assert.throws(
    () =>
      applyAction(
        s,
        c.id,
        actionSchema.parse({
          version: 1,
          action: "reject",
          note: "Duplicate request",
        }),
      ),
    (e: unknown) => e instanceof ManagerError && e.status === 409,
  );
  assert.equal(c.status, "Approved");
});
test("requires valid transitions and a reason for rejection/reopening", () => {
  const s = seedState(),
    c = s.complaints[0];
  assert.throws(() => run(s, c.id, "verify"));
  assert.throws(() => run(s, c.id, "reject"));
  run(s, c.id, "reject", { note: "This is a duplicate report." });
  assert.equal(c.status, "Rejected");
  assert.throws(() => run(s, c.id, "prioritize", { urgency: "Emergency" }));
  assert.throws(() => run(s, c.id, "reopen"));
});
test("blocks mismatched, off-duty and unverified technicians", () => {
  const s = seedState(),
    c = s.complaints[0];
  run(s, c.id, "approve");
  assert.throws(() => run(s, c.id, "assign", { technicianId: "t2" }));
  assert.throws(() => run(s, c.id, "assign", { technicianId: "t5" }));
  s.technicians[0].verified = false;
  assert.throws(() => run(s, c.id, "assign", { technicianId: "t1" }));
});
test("capacity is checked at assignment time", () => {
  const s = seedState(),
    c = s.complaints[0];
  run(s, c.id, "approve");
  for (const x of s.complaints.slice(2, 6)) {
    x.technicianId = "t1";
    x.status = "In progress";
  }
  assert.throws(() => run(s, c.id, "assign", { technicianId: "t1" }));
  assert.ok(
    !localRecommendations(s, c).items.some((r) => r.technicianId === "t1"),
  );
});
test("verification requires explicit approval covering total costs", () => {
  const s = seedState(),
    c = s.complaints.find((c) => c.status === "Awaiting verification")!;
  c.estimate = 100;
  assert.throws(() => run(s, c.id, "verify"));
  assert.equal(c.repairs[0].verifiedAt, undefined);
  run(s, c.id, "estimate", { estimate: 1000 });
  run(s, c.id, "verify");
  assert.throws(() => run(s, c.id, "verify"));
});
test("recommendations explain specialization, distance, workload and reliability", () => {
  const s = seedState(),
    c = s.complaints[0],
    r = localRecommendations(s, c);
  assert.equal(r.source, "CampusFix matching rules");
  assert.ok(r.items.length);
  assert.ok(
    r.items.every(
      (x) =>
        x.explanation.includes("km") &&
        x.explanation.includes("reliability") &&
        x.workload < 4,
    ),
  );
  assert.ok(
    !r.items.some((x) => x.technicianId === "t2" || x.technicianId === "t5"),
  );
});
test("validates financial input and prohibits active image markup", () => {
  assert.equal(
    actionSchema.safeParse({
      version: 1,
      action: "report",
      report: { summary: "Fixed the leak", labour: -1, parts: [] },
    }).success,
    false,
  );
  const input = {
    title: "Bathroom tap leak",
    description: "Water leaks continuously",
    reporter: "Resident",
    propertyId: "p1",
    room: "101",
    category: "Plumbing",
    urgency: "Normal",
    images: ["data:image/svg+xml;base64,abc"],
  };
  assert.equal(createSchema.safeParse(input).success, false);
});
test("Gemma JSON parser accepts valid structured output and rejects invented categories", () => {
  const valid = {
    category: "Plumbing",
    urgency: "High",
    specialization: "Plumbing",
    summary: "Bathroom tap is leaking.",
    reason: "Water loss needs prompt repair.",
    keywords: ["tap", "leak"],
  };
  assert.deepEqual(
    parseGemmaJson(
      "```json\n" + JSON.stringify(valid) + "\n```",
      analysisSchema,
    ),
    valid,
  );
  assert.throws(() =>
    parseGemmaJson(
      JSON.stringify({ ...valid, category: "Made up" }),
      analysisSchema,
    ),
  );
  assert.throws(() =>
    parseGemmaJson("Here is a helpful explanation", analysisSchema),
  );
});
test("Gemma failures remain explicit; schema/ID errors and model substitution are rejected", async () => {
  const previousKey = process.env.GEMMA_API_KEY,
    previousModel = process.env.GEMMA_MODEL,
    previousFetch = globalThis.fetch;
  const s = seedState(),
    c = s.complaints[0];
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  try {
    delete process.env.GEMMA_API_KEY;
    await assert.rejects(analyzeComplaint(c), /not configured/);
    process.env.GEMMA_API_KEY = "unit-test-placeholder";
    process.env.GEMMA_MODEL = "gemini-not-gemma";
    await assert.rejects(
      analyzeComplaint(c),
      /Gemini substitution is disabled/,
    );
    process.env.GEMMA_MODEL = "gemma-4-26b-a4b-it";
    globalThis.fetch = async () => new Response("{}", { status: 429 });
    await assert.rejects(analyzeComplaint(c), /quota or rate limit/);
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      return attempts === 1
        ? new Response("{}", { status: 503 })
        : Response.json({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        category: "Plumbing",
                        specialization: "Plumbing",
                        urgency: "High",
                        summary: "Ceiling pipe is leaking.",
                        reason: "Water leak needs inspection.",
                      }),
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
          });
    };
    assert.equal((await analyzeComplaint(c)).category, "Plumbing");
    assert.equal(attempts, 2);
    globalThis.fetch = async () => {
      throw new Error("simulated network outage");
    };
    await assert.rejects(analyzeComplaint(c), /could not be reached/);
    const answer = (text: string) => async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
      });
    globalThis.fetch = answer("not valid JSON");
    await assert.rejects(analyzeComplaint(c), /invalid structured response/);
    globalThis.fetch = answer(
      JSON.stringify({
        items: [
          {
            technicianId: "unknown",
            explanation: "Invented candidate must be rejected.",
          },
        ],
      }),
    );
    await assert.rejects(
      explainRecommendations(s, c, localRecommendations(s, c)),
      /unknown or duplicate/,
    );
    globalThis.fetch = answer(
      JSON.stringify({
        summary: "All work reviewed.",
        recurring: [],
        urgent: [{ complaintId: "FAKE-123", reason: "Invented issue." }],
        actions: [],
      }),
    );
    await assert.rejects(
      managerAssistant(s, "Summarize pending work"),
      /unknown complaint/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    restore("GEMMA_API_KEY", previousKey);
    restore("GEMMA_MODEL", previousModel);
  }
});
