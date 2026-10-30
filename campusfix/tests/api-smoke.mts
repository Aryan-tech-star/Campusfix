import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000/api/manager";
async function request(
  path = "",
  method = "GET",
  body?: unknown,
  expected = 200,
) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json();
  assert.equal(r.status, expected, JSON.stringify(json));
  return json;
}
const before = await request();
let c = await request(
  "/complaints",
  "POST",
  {
    title: "Demo walkthrough: bathroom tap leak",
    description:
      "Water is dripping steadily from the bathroom tap. Please replace the washer and check for leaks.",
    reporter: "Demo resident",
    propertyId: "p1",
    room: "Demo-101",
    category: "Plumbing",
    urgency: "Normal",
    images: [],
  },
  201,
);
console.log(`Created ${c.id}; persistence and workflow test started.`);
const action = async (action: string, extra: Record<string, unknown> = {}) => {
  c = await request(`/complaints/${c.id}`, "PATCH", {
    version: c.version,
    action,
    ...extra,
  });
};
await request(
  `/complaints/${c.id}`,
  "PATCH",
  { version: c.version, action: "verify" },
  409,
);
await action("approve");
await request(
  `/complaints/${c.id}`,
  "PATCH",
  { version: 1, action: "reject", note: "Stale update check" },
  409,
);
const rec = await request(`/complaints/${c.id}/recommendations`);
assert.ok(rec.items.length);
await action("assign", { technicianId: rec.items[0].technicianId });
await action("start");
await action("estimate", { estimate: 800 });
await action("report", {
  report: {
    summary: "Replaced the tap washer and checked operation with the resident.",
    labour: 300,
    parts: [{ name: "Washer kit", quantity: 1, unitCost: 120 }],
  },
});
await action("verify");
assert.equal(c.status, "Completed");
assert.ok(c.repairs[0].verifiedAt);
await action("reopen", {
  note: "Demo revisit to verify the complete repair lifecycle.",
});
await action("reject", {
  note: "Demo walkthrough complete; this is a test-only complaint.",
});
const after = await request();
assert.equal(
  after.complaints.find((x: { id: string }) => x.id === c.id).status,
  "Rejected",
);
assert.equal(after.complaints.length, before.complaints.length + 1);
const s = { ...after.settings, compactRows: !after.settings.compactRows };
await request("/settings", "PATCH", {
  revision: after.revision,
  settings: s,
  properties: after.properties,
});
const changed = await request();
assert.equal(changed.settings.compactRows, s.compactRows);
await request("/settings", "PATCH", {
  revision: changed.revision,
  settings: after.settings,
  properties: after.properties,
});
const invalid = await fetch(base + "/complaints", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://attacker.example",
  },
  body: "{}",
});
assert.equal(invalid.status, 403);
console.log(
  "PASS: create, transition guards, stale writes, recommendations, assignment, report, cost approval, verify, reopen, reject, settings, persistence, origin check.",
);
