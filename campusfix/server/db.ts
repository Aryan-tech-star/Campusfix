import "./env";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for the CampusFix backend.");
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 10000,
  ...(process.env.DATABASE_CA
    ? {
        ssl: {
          ca: process.env.DATABASE_CA.replace(/\\n/g, "\n"),
          rejectUnauthorized: true,
        },
      }
    : {}),
});
export const db = new PrismaClient({ adapter, log: [] });
export type Tx = Prisma.TransactionClient;
export { Prisma };

// All maintenance mutations share one short transaction and workspace row lock.
// Gemma/network calls always happen outside this lock.
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = 1 FOR UPDATE`;
      return fn(tx);
    },
    { timeout: 30000, maxWait: 10000 },
  );
}
