import { config } from "dotenv";
import { defineConfig } from "prisma/config";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx server/seed.ts" },
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://localhost:5432/campusfix",
  },
});
