import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import {
  authenticate,
  clearSession,
  digest,
  hashPassword,
  issueSession,
  publicUser,
  rateLimit,
  verifyPassword,
} from "./auth";
import { ManagerError, categories } from "../lib/manager/domain";

export const authRouter = Router();
const role = z.enum(["STUDENT", "MANAGER", "TECHNICIAN"]);
const credentials = z.object({
  email: z
    .email()
    .max(160)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
  role,
});
const registration = credentials.extend({
  password: z
    .string()
    .min(12, "Use at least 12 characters for your password.")
    .max(128),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).default(""),
  propertyId: z.string().optional(),
  room: z.string().trim().min(1).max(50).optional(),
  inviteCode: z.string().max(100).optional(),
  specialization: z.array(z.enum(categories)).min(1).max(7).optional(),
});
authRouter.get("/options", async (_req, res) => {
  res.json({
    properties: await db.hostel.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    demo: process.env.SEED_DEMO === "true",
  });
});
authRouter.post("/login", async (req, res) => {
  const input = credentials.parse(req.body);
  await rateLimit(`login:${digest(input.email)}`, 8);
  await rateLimit(`login-ip:${digest(req.ip || "unknown")}`, 60);
  const user = await db.user.findUnique({
    where: { email: input.email },
    include: { room: true, technician: true },
  });
  // Derive even for absent accounts to reduce email enumeration by timing.
  const encoded =
    user?.passwordHash ||
    `scrypt:32768:8:1:00000000000000000000000000000000:${"00".repeat(64)}`;
  const valid = await verifyPassword(input.password, encoded);
  if (!user || !valid || !user.active || user.role !== input.role)
    throw new ManagerError(
      401,
      "The email, password or selected role is incorrect.",
    );
  await clearSession(req, res);
  await issueSession(user.id, res);
  res.json({ user: publicUser(user), redirect: `/${user.role.toLowerCase()}` });
});
authRouter.post("/register", async (req, res) => {
  const input = registration.parse(req.body);
  await rateLimit(`register:${digest(req.ip || "unknown")}`, 12, 3600000);
  if (input.role === "MANAGER")
    throw new ManagerError(
      403,
      "Manager accounts are provisioned by the CampusFix operator. Contact your network administrator for access.",
    );
  const passwordHash = await hashPassword(input.password);
  const user = await transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email } }))
      throw new ManagerError(
        409,
        "An account could not be created with these details. Try signing in or contact your manager.",
      );
    let roomId: string | undefined;
    if (input.role === "STUDENT") {
      const hostel = input.propertyId
        ? await tx.hostel.findUnique({ where: { id: input.propertyId } })
        : null;
      if (
        !hostel ||
        !input.room ||
        !input.inviteCode ||
        hostel.inviteCodeHash !== digest(input.inviteCode)
      )
        throw new ManagerError(
          400,
          "Choose your hostel and enter its valid invitation code and your room number.",
        );
      roomId = (
        await tx.room.upsert({
          where: {
            hostelId_number: { hostelId: hostel.id, number: input.room },
          },
          create: { hostelId: hostel.id, number: input.room },
          update: {},
        })
      ).id;
    }
    if (input.role === "TECHNICIAN" && !input.specialization?.length)
      throw new ManagerError(400, "Select at least one specialization.");
    const created = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        phone: input.phone,
        passwordHash,
        role: input.role,
        roomId,
        ...(input.role === "TECHNICIAN"
          ? {
              technician: {
                create: {
                  id: randomUUID(),
                  name: input.name,
                  initials: input.name
                    .split(/\s+/)
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join(""),
                  phone: input.phone,
                  specialization: input.specialization!,
                  available: false,
                  verified: false,
                },
              },
            }
          : {}),
      },
      include: { room: true, technician: true },
    });
    await tx.notification.create({
      data: {
        userId: created.id,
        title: "Welcome to CampusFix",
        message:
          input.role === "STUDENT"
            ? "Report maintenance issues and follow every repair from your workspace."
            : "Your profile is awaiting manager verification. You can receive jobs once approved.",
      },
    });
    if (input.role === "TECHNICIAN") {
      const managers = await tx.user.findMany({
        where: { role: "MANAGER", active: true },
        select: { id: true },
      });
      await tx.notification.createMany({
        data: managers.map((m) => ({
          userId: m.id,
          title: "Technician verification requested",
          message: `${input.name} joined the network and needs profile verification.`,
        })),
      });
    }
    await tx.workspace.update({
      where: { id: 1 },
      data: { revision: { increment: 1 } },
    });
    return created;
  });
  await issueSession(user.id, res);
  res
    .status(201)
    .json({ user: publicUser(user), redirect: `/${user.role.toLowerCase()}` });
});
authRouter.post("/logout", async (req, res) => {
  await clearSession(req, res);
  res.json({ ok: true });
});
authRouter.get("/me", authenticate, (_req, res) =>
  res.json({ user: res.locals.user }),
);
