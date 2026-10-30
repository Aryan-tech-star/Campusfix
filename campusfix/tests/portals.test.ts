import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import type { Complaint, Snapshot } from "../lib/manager/domain";
import type { TechnicianSnapshot, StudentSnapshot } from "../lib/portal/types";
process.env.GEMMA_ENABLED = "false"; // These tests must never send provider requests.

test("PostgreSQL-backed roles and complete shared maintenance lifecycle", async (t) => {
  await import("../server/env");
  assert(process.env.NODE_ENV !== "production" && process.env.SEED_DEMO === "true", "Integration tests require an isolated development demo database.");
  const { app } = await import("../server/app");
  const { db } = await import("../server/db");
  const { hashPassword, verifyPassword } = await import("../server/auth");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`,
    origin = "http://127.0.0.1:3000";
  const password = process.env.DEMO_PASSWORD!;
  assert(password, "Demo credentials must be configured locally.");
  const createdUsers: string[] = [],
    createdComplaints: string[] = [];
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    expected = 200,
    customOrigin = origin,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        origin: customOrigin,
        cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json();
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${JSON.stringify(value)}`,
    );
    return {
      value,
      cookie: response.headers.getSetCookie().at(-1)?.split(";")[0] || cookie,
      response,
    };
  }
  let manager = "",
    student = "",
    student2 = "",
    technician = "",
    techId = "",
    c: Complaint;
  try {
    await db.rateLimit.deleteMany();
    await t.test(
      "password hashing, login, persistent HTTP-only sessions and role isolation",
      async () => {
        const hash = await hashPassword(password);
        assert.notEqual(hash, password);
        assert(await verifyPassword(password, hash));
        assert(!(await verifyPassword("wrong password", hash)));
        await request("/manager", "GET", undefined, "", 401);
        await request(
          "/auth/login",
          "POST",
          { email: "student@campusfix.demo", password, role: "MANAGER" },
          "",
          401,
        );
        const m = await request("/auth/login", "POST", {
          email: "manager@campusfix.demo",
          password,
          role: "MANAGER",
        });
        manager = m.cookie;
        assert.match(m.response.headers.get("set-cookie")!, /HttpOnly/i);
        assert.match(m.response.headers.get("set-cookie")!, /SameSite=Strict/i);
        assert.equal(m.value.redirect, "/manager");
        student = (
          await request("/auth/login", "POST", {
            email: "student@campusfix.demo",
            password,
            role: "STUDENT",
          })
        ).cookie;
        student2 = (
          await request("/auth/login", "POST", {
            email: "student2@campusfix.demo",
            password,
            role: "STUDENT",
          })
        ).cookie;
        await request("/manager", "GET", undefined, student, 403);
        await request("/technician", "GET", undefined, student, 403);
        await request("/student", "GET", undefined, manager, 403);
        assert.equal(
          (await request("/auth/me", "GET", undefined, student)).value.user
            .role,
          "STUDENT",
        );
        await request(
          "/profile",
          "PATCH",
          { name: "Intruder", phone: "", role: "MANAGER" },
          student,
          400,
        );
        await request(
          "/profile",
          "PATCH",
          { name: "Intruder", phone: "" },
          student,
          403,
          "https://untrusted.example",
        );
      },
    );
    await t.test(
      "registration cannot grant manager or technician verification privileges",
      async () => {
        await request(
          "/auth/register",
          "POST",
          {
            name: "Not an admin",
            email: `denied-${randomUUID()}@test.invalid`,
            password,
            role: "MANAGER",
          },
          "",
          403,
        );
        const signup = await request(
          "/auth/register",
          "POST",
          {
            name: "Workflow Test Plumber",
            email: `tech-${randomUUID()}@test.invalid`,
            password,
            role: "TECHNICIAN",
            specialization: ["Plumbing"],
          },
          "",
          201,
        );
        createdUsers.push(signup.value.user.id);
        technician = signup.cookie;
        techId = signup.value.user.technicianId;
        const snapshot = (
          await request("/technician", "GET", undefined, technician)
        ).value as TechnicianSnapshot;
        assert.equal(snapshot.technician.verified, false);
        assert.equal(snapshot.technician.available, false);
        await request(
          "/technician/profile",
          "PATCH",
          { verified: true },
          technician,
          400,
        );
        await request(
          "/technician/profile",
          "PATCH",
          { available: true },
          technician,
          403,
        );
        const s = (await request("/manager", "GET", undefined, manager))
          .value as Snapshot;
        await request(
          `/manager/technicians/${techId}`,
          "PATCH",
          { verified: true, revision: s.revision },
          manager,
        );
        await request(
          "/technician/profile",
          "PATCH",
          { available: true, serviceArea: "Pune · test hostel cluster" },
          technician,
        );
        assert.equal(
          (
            await request("/manager", "GET", undefined, manager)
          ).value.technicians.find((x: { id: string }) => x.id === techId)
            .available,
          true,
        );
      },
    );
    await t.test(
      "student submission is persisted and access is restricted to its owner",
      async () => {
        const input = {
          title: "Workflow test: bathroom tap leaking",
          description:
            "The bathroom tap leaks continuously under the wash basin. Please inspect the pipe and washer.",
          propertyId: "p1",
          room: "204",
          category: "Plumbing",
          urgency: "High",
          images: [],
        };
        await request(
          "/student/complaints",
          "POST",
          { ...input, propertyId: "p2" },
          student,
          403,
        );
        await request(
          "/student/complaints",
          "POST",
          { ...input, images: ["data:image/png;base64,YmFk"] },
          student,
          400,
        );
        const result = (
          await request("/student/complaints", "POST", input, student, 201)
        ).value;
        c = result.complaint;
        createdComplaints.push(c.id);
        assert.match(c.id, /^CF-\d+$/);
        assert.equal(c.status, "Pending");
        assert.match(result.aiError, /paused/);
        const persisted = await db.complaint.findUniqueOrThrow({
          where: { id: c.id },
        });
        assert.equal(persisted.title, input.title);
        assert(persisted.studentId);
        await request(
          `/student/complaints/${c.id}`,
          "GET",
          undefined,
          student2,
          404,
        );
        assert(
          !(
            await request("/student", "GET", undefined, student2)
          ).value.complaints.some((x: Complaint) => x.id === c.id),
        );
        assert(
          (
            await request("/manager", "GET", undefined, manager)
          ).value.complaints.some((x: Complaint) => x.id === c.id),
        );
        await request(
          `/ai/complaints/${c.id}/analyze`,
          "POST",
          { version: c.version },
          student,
          503,
        );
      },
    );
    async function managerAction(action: string, extra: object = {}) {
      c = (
        await request(
          `/manager/complaints/${c.id}`,
          "PATCH",
          { action, version: c.version, ...extra },
          manager,
        )
      ).value;
    }
    async function techAction(action: string, extra: object = {}) {
      c = (
        await request(
          `/technician/jobs/${c.id}/actions`,
          "POST",
          { action, version: c.version, ...extra },
          technician,
        )
      ).value;
    }
    await t.test(
      "manager assignment, technician acceptance, progress and stale-write protection",
      async () => {
        await managerAction("approve");
        await managerAction("assign", {
          technicianId: techId,
          note: "Inspect the tap seal and check for leaks.",
        });
        const ts = (await request("/technician", "GET", undefined, technician))
          .value as TechnicianSnapshot;
        assert.equal(
          ts.complaints.find((x) => x.id === c.id)?.assignment?.status,
          "PENDING",
        );
        await request(
          `/technician/jobs/${c.id}/actions`,
          "POST",
          { action: "start", version: c.version },
          technician,
          409,
        );
        await techAction("accept");
        const stale = c.version;
        await techAction("start");
        await request(
          `/technician/jobs/${c.id}/actions`,
          "POST",
          {
            action: "progress",
            version: stale,
            note: "Stale update must not be saved",
          },
          technician,
          409,
        );
        await techAction("progress", {
          note: "Water isolated. The worn tap washer is being replaced.",
        });
        const ss = (await request("/student", "GET", undefined, student))
          .value as StudentSnapshot;
        assert.equal(
          ss.complaints.find((x) => x.id === c.id)?.status,
          "In progress",
        );
        assert.equal(
          ss.complaints.find((x) => x.id === c.id)?.technician?.id,
          techId,
        );
      },
    );
    await t.test(
      "technician completion requires manager cost approval and verification",
      async () => {
        await techAction("complete", {
          report: {
            summary: "Replaced the worn washer and tested for leaks.",
            workPerformed:
              "Isolated water, replaced tap washer and pressure tested.",
            labour: 300,
            parts: [{ name: "Tap washer", quantity: 1, unitCost: 50 }],
            images: [],
          },
        });
        assert.equal(c.status, "Awaiting verification");
        assert.equal(c.repairs[0].verifiedAt, undefined);
        await request(
          `/manager/complaints/${c.id}`,
          "PATCH",
          { action: "verify", version: c.version },
          technician,
          403,
        );
        await request(
          `/technician/jobs/${c.id}/actions`,
          "POST",
          { action: "verify", version: c.version },
          technician,
          400,
        );
        await request(
          `/manager/complaints/${c.id}`,
          "PATCH",
          { action: "verify", version: c.version },
          manager,
          409,
        );
        await managerAction("estimate", { estimate: 350 });
        await managerAction("verify");
        assert.equal(c.status, "Completed");
        assert(c.repairs[0].verifiedAt);
        const studentView = (
          await request(
            `/student/complaints/${c.id}`,
            "GET",
            undefined,
            student,
          )
        ).value as Complaint;
        assert.equal(studentView.status, "Completed");
        assert.equal(studentView.repairs[0].parts[0].name, "Tap washer");
        const notifications = (
          await request("/notifications", "GET", undefined, student)
        ).value;
        assert(
          notifications.some(
            (n: { complaintId: string }) => n.complaintId === c.id,
          ),
        );
        await request(
          "/notifications/read",
          "POST",
          { ids: [notifications[0].id] },
          student,
        );
        assert(
          (await request("/notifications", "GET", undefined, student)).value[0]
            .readAt,
        );
      },
    );
    await t.test(
      "reopening preserves repairs, supports decline and limits access after reassignment",
      async () => {
        await managerAction("reopen", {
          note: "A follow-up inspection found a slow drip. Please revisit.",
        });
        assert.equal(c.status, "Reopened");
        assert(c.repairs[0].verifiedAt);
        assert(c.repairs[0].reopenedAt);
        await request(
          `/technician/jobs/${c.id}/actions`,
          "POST",
          { action: "start", version: c.version },
          technician,
          404,
        );
        await managerAction("assign", { technicianId: techId });
        await techAction("decline", {
          note: "Unavailable for the requested follow-up time.",
        });
        assert.equal(c.status, "Approved");
        assert.equal(c.technicianId, undefined);
        await managerAction("reject", {
          note: "Automated workflow test completed; this fixture is closed.",
        });
        await request("/auth/logout", "POST", {}, student);
        await request("/auth/me", "GET", undefined, student, 401);
        await request(
          "/auth/me",
          "GET",
          undefined,
          student.replace(/.$/, "z"),
          401,
        );
      },
    );
  } finally {
    // Only records created by this test are removed; imported demo/user records remain intact.
    await db.$transaction(async (tx) => {
      await tx.notification.deleteMany({
        where: {
          OR: [
            { complaintId: { in: createdComplaints } },
            { userId: { in: createdUsers } },
          ],
        },
      });
      await tx.repairPart.deleteMany({
        where: { report: { complaintId: { in: createdComplaints } } },
      });
      await tx.repairReport.deleteMany({
        where: { complaintId: { in: createdComplaints } },
      });
      await tx.statusHistory.deleteMany({
        where: { complaintId: { in: createdComplaints } },
      });
      await tx.assignment.deleteMany({
        where: { complaintId: { in: createdComplaints } },
      });
      await tx.complaint.deleteMany({
        where: { id: { in: createdComplaints } },
      });
      await tx.technician.deleteMany({
        where: { userId: { in: createdUsers } },
      });
      await tx.user.deleteMany({ where: { id: { in: createdUsers } } });
      await tx.rateLimit.deleteMany();
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
