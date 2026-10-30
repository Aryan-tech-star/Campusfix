import { app } from "./app";
import { db } from "./db";
const port = Number(process.env.API_PORT || 4000);
const server = app.listen(port, process.env.API_HOST || "127.0.0.1", () =>
  console.log(`CampusFix API listening on port ${port}`),
);
const cleanup = setInterval(() => {
  void Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    db.rateLimit.deleteMany({ where: { until: { lt: new Date() } } }),
  ]).catch(() => {});
}, 3600000);
cleanup.unref();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(cleanup);
    server.close(() => {
      void db.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
