import "./env";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { db, transaction } from "./db";
import { hashPassword, digest } from "./auth";
import { seedState } from "../lib/manager/seed";
import { saveState } from "./store";
import type { ManagerState } from "../lib/manager/domain";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.SEED_DEMO !== "true")
    throw new Error(
      "Demo seed requires SEED_DEMO=true and a non-production environment.",
    );
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Set a development-only DEMO_PASSWORD of at least 12 characters.",
    );
  const passwordHash = await hashPassword(password);
  const existing = await db.workspace.findUnique({ where: { id: 1 } });
  if (!existing) {
    let state: ManagerState = seedState();
    const file = process.env.LEGACY_SQLITE_PATH || "data/manager.sqlite";
    if (existsSync(file)) {
      const legacy = new DatabaseSync(file, { readOnly: true });
      const row = legacy
        .prepare("SELECT payload FROM manager_state WHERE id=1")
        .get() as { payload: string } | undefined;
      if (row) state = JSON.parse(row.payload);
      legacy.close();
      console.log(
        "Importing the existing manager records without modifying the SQLite source.",
      );
    }
    await transaction(async (tx) => {
      await saveState(tx, state);
      await tx.workspace.update({ where: { id: 1 }, data: { demo: true } });
    });
  }
  await db.hostel.updateMany({
    data: { inviteCodeHash: digest("CAMPUS-DEMO") },
  });
  const accounts = [
    {
      email: "manager@campusfix.demo",
      name: "Aarav Sharma",
      role: "MANAGER" as const,
    },
    {
      email: "student@campusfix.demo",
      name: "Ananya Rao",
      role: "STUDENT" as const,
      room: "204",
    },
    {
      email: "student2@campusfix.demo",
      name: "Rohan Mehta",
      role: "STUDENT" as const,
      room: "107",
    },
    {
      email: "plumber@campusfix.demo",
      name: "Rajesh Kumar",
      role: "TECHNICIAN" as const,
      tech: "t1",
    },
    {
      email: "electrician@campusfix.demo",
      name: "Amit Verma",
      role: "TECHNICIAN" as const,
      tech: "t2",
    },
    {
      email: "carpenter@campusfix.demo",
      name: "Suresh Patil",
      role: "TECHNICIAN" as const,
      tech: "t3",
    },
  ];
  for (const a of accounts) {
    const room = a.room
      ? await db.room.upsert({
          where: { hostelId_number: { hostelId: "p1", number: a.room } },
          create: { hostelId: "p1", number: a.room },
          update: {},
        })
      : null;
    const user = await db.user.upsert({
      where: { email: a.email },
      create: {
        email: a.email,
        name: a.name,
        role: a.role,
        passwordHash,
        roomId: room?.id,
      },
      update: {},
    });
    if (a.tech)
      await db.technician.update({
        where: { id: a.tech },
        data: { userId: user.id },
      });
  }
  // Give each demo student a small, disjoint selection of the imported hostel history.
  const students = await db.user.findMany({
    where: {
      role: "STUDENT",
      email: {
        in: accounts.filter((a) => a.role === "STUDENT").map((a) => a.email),
      },
    },
    orderBy: { email: "asc" },
  });
  for (const user of students) {
    if (await db.complaint.count({ where: { studentId: user.id } })) continue;
    const complaints = await db.complaint.findMany({
      where: { hostelId: "p1", studentId: null },
      orderBy: { createdAt: "desc" },
      take: 4,
    });
    await db.complaint.updateMany({
      where: { id: { in: complaints.map((c) => c.id) } },
      data: { studentId: user.id },
    });
    await db.notification.create({
      data: {
        userId: user.id,
        title: "Welcome to CampusFix",
        message:
          "Your hostel's maintenance team is one report away. This workspace contains demonstration data.",
      },
    });
  }
  console.log(
    "Demo accounts ready: 1 manager, 2 students, 3 technicians. Existing passwords and records preserved.",
  );
}
main()
  .catch(() => {
    console.error(
      "Seed failed. Check database access, migrations, SEED_DEMO and DEMO_PASSWORD; no credentials were logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
