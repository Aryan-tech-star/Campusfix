import "./env";
import { z } from "zod";
import { db } from "./db";
import { hashPassword, digest } from "./auth";

async function main() {
  const input = z
    .object({
      BOOTSTRAP_MANAGER_EMAIL: z.email(),
      BOOTSTRAP_MANAGER_PASSWORD: z.string().min(16).max(128),
      BOOTSTRAP_MANAGER_NAME: z.string().min(2).max(80),
      HOSTEL_NAME: z.string().min(2).max(100),
      HOSTEL_ADDRESS: z.string().min(5).max(250),
      HOSTEL_ROOMS: z.coerce.number().int().min(1).max(5000),
      HOSTEL_INVITE_CODE: z.string().min(16).max(100),
    })
    .parse(process.env);
  if (await db.workspace.findUnique({ where: { id: 1 } }))
    throw new Error(
      "Workspace already exists. Bootstrap will not overwrite any account or record.",
    );
  const passwordHash = await hashPassword(input.BOOTSTRAP_MANAGER_PASSWORD);
  await db.$transaction(async (tx) => {
    await tx.workspace.create({
      data: {
        id: 1,
        demo: false,
        settings: {
          name: input.BOOTSTRAP_MANAGER_NAME,
          email: input.BOOTSTRAP_MANAGER_EMAIL.toLowerCase(),
          phone: "",
          organization: input.HOSTEL_NAME,
          emergencyAlerts: true,
          verificationAlerts: true,
          dailyDigest: false,
          autoAnalyze: true,
          compactRows: false,
        },
      },
    });
    await tx.hostel.create({
      data: {
        name: input.HOSTEL_NAME,
        address: input.HOSTEL_ADDRESS,
        roomCount: input.HOSTEL_ROOMS,
        lat: Number(process.env.HOSTEL_LAT || 0),
        lng: Number(process.env.HOSTEL_LNG || 0),
        membership: 0,
        inviteCodeHash: digest(input.HOSTEL_INVITE_CODE),
      },
    });
    await tx.user.create({
      data: {
        email: input.BOOTSTRAP_MANAGER_EMAIL.toLowerCase(),
        name: input.BOOTSTRAP_MANAGER_NAME,
        passwordHash,
        role: "MANAGER",
      },
    });
  });
  console.log(
    "Production workspace and initial manager created. Remove bootstrap password variables from the runtime environment.",
  );
}
main()
  .catch(() => {
    console.error(
      "Bootstrap failed. Check required variables, migrations and whether the workspace already exists. No credentials were logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
