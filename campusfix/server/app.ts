import "./env";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { db, Prisma } from "./db";
import { ManagerError } from "../lib/manager/domain";
import { authRouter } from "./auth-routes";
import { authenticate, requireRoles } from "./auth";
import { managerRouter } from "./manager-routes";
import { studentRouter, technicianRouter, sharedRouter } from "./portal-routes";

export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
const origins = (
  process.env.APP_ORIGINS ||
  (process.env.NODE_ENV === "production"
    ? ""
    : "http://127.0.0.1:3000,http://localhost:3000")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (
  !origins.length ||
  origins.some(
    (o) =>
      o === "*" ||
      (process.env.NODE_ENV === "production" && !o.startsWith("https://")),
  )
)
  throw new Error(
    "APP_ORIGINS must contain explicit HTTPS frontend origins in production.",
  );
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || origins.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use((req, _res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (!req.headers.origin ||
      !origins.includes(req.headers.origin) ||
      req.headers["sec-fetch-site"] === "cross-site")
  )
    throw new ManagerError(
      403,
      "This request came from an unrecognized origin.",
    );
  next();
});
app.use(express.json({ limit: "4.5mb" }));
app.use(cookieParser());
app.get(
  ["/health", "/api/health", "/api/manager/health"],
  async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({
        status: "ok",
        service: "CampusFix API",
        database: "PostgreSQL",
      });
    } catch {
      res
        .status(503)
        .json({ status: "unavailable", error: "The database is unavailable." });
    }
  },
);
app.use("/api/auth", authRouter);
app.use("/api", authenticate);
app.use("/api/manager", requireRoles("MANAGER"), managerRouter);
app.use("/api/student", requireRoles("STUDENT"), studentRouter);
app.use("/api/technician", requireRoles("TECHNICIAN"), technicianRouter);
app.use("/api", sharedRouter);
app.use((_req, _res, next) =>
  next(new ManagerError(404, "Endpoint not found.")),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next; // Express identifies error middleware by its four arguments.
    if (error instanceof ManagerError)
      return res.status(error.status).json({ error: error.message });
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues
          .map((x) => `${x.path.join(".") || "Request"}: ${x.message}`)
          .slice(0, 5)
          .join("; "),
      });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return res
        .status(409)
        .json({
          error:
            "These details conflict with an existing record. Refresh and try again.",
        });
    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      error.type === "entity.too.large"
    )
      return res
        .status(413)
        .json({
          error: "Request too large. Use up to three images of 1 MB each.",
        });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON request." });
    // No raw DB/provider exceptions, request bodies, cookies or credentials enter logs.
    console.error(
      "CampusFix request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return res
      .status(500)
      .json({
        error:
          "The request could not be completed. Please retry or contact your manager.",
      });
  },
);
