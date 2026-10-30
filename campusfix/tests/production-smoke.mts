import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import pg from "pg";

// Run after npm run build and npm run build:api. No existing records are changed:
// this test creates one random database and drops only that database in finally.
// Credentials are read quietly and passed in process environments, never argv.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const frontendPort = 3107;
const apiPort = 4107;
const frontend = `http://127.0.0.1:${frontendPort}`;
const api = `http://127.0.0.1:${apiPort}`;
const trustedOrigin = "https://campusfix.example";
const databaseName = `campusfix_prod_smoke_${randomBytes(10).toString("hex")}`;
const managerEmail = "manager@production-smoke.invalid";
const managerPassword = randomBytes(24).toString("base64url");
const invitation = randomBytes(24).toString("base64url");
const testPassword = randomBytes(24).toString("base64url");
const sourceDatabaseUrl = process.env.DATABASE_URL;
assert.ok(
  sourceDatabaseUrl,
  "DATABASE_URL must be set in the local environment.",
);
assert.ok(
  existsSync(".next/BUILD_ID"),
  "Run the frontend production build first.",
);
assert.ok(
  existsSync("build/api/index.js"),
  "Run the API production build first.",
);

const testDatabaseUrl = new URL(sourceDatabaseUrl);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(testDatabaseUrl.hostname), "Production smoke is local-only; do not run it against a hosted database.");
assert.ok(["postgres:", "postgresql:"].includes(testDatabaseUrl.protocol));
testDatabaseUrl.pathname = `/${databaseName}`;
const ssl = process.env.DATABASE_CA
  ? {
      ca: process.env.DATABASE_CA.replace(/\\n/g, "\n"),
      rejectUnauthorized: true,
    }
  : undefined;
const administrator = new pg.Client({
  connectionString: sourceDatabaseUrl,
  ssl,
});
const children = new Set<ChildProcess>();
let databaseCreated = false;
let administratorConnected = false;
let inspector: pg.Client | undefined;

const productionEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: testDatabaseUrl.toString(),
  API_BASE_URL: api,
  API_HOST: "127.0.0.1",
  API_PORT: String(apiPort),
  APP_ORIGINS: trustedOrigin,
  TRUST_PROXY: "0",
  GEMMA_ENABLED: "false",
  GEMMA_API_KEY: "",
  SEED_DEMO: "false",
  NEXT_TELEMETRY_DISABLED: "1",
};

function start(args: string[], env = productionEnv) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: "ignore",
    windowsHide: true,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

async function command(args: string[], env = productionEnv) {
  const child = start(args, env);
  const exit = once(child, "exit");
  const timeout = setTimeout(() => child.kill(), 60_000);
  timeout.unref();
  try {
    const [code] = await exit;
    return code as number | null;
  } finally {
    clearTimeout(timeout);
  }
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  const force = setTimeout(() => child.kill("SIGKILL"), 5_000);
  force.unref();
  try {
    await exited;
  } finally {
    clearTimeout(force);
  }
}

async function assertPortAvailable(port: number) {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", () =>
      reject(
        new Error(
          `Test port ${port} is already in use; no service was stopped.`,
        ),
      ),
    );
    socket.listen(port, "127.0.0.1", () => socket.close(() => resolve()));
  });
}

async function waitForHealth(child: ChildProcess, url: string, label: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert.equal(
      child.exitCode,
      null,
      `${label} exited before becoming ready.`,
    );
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      const value = await response.json();
      if (response.ok && value.status === "ok") return;
    } catch {
      // The process may still be opening its listener or its database pool.
    }
    await delay(150);
  }
  throw new Error(`${label} did not become healthy within 30 seconds.`);
}

async function request(
  path: string,
  {
    method = "GET",
    body,
    cookie = "",
    expected = 200,
    origin = trustedOrigin,
  }: {
    method?: string;
    body?: unknown;
    cookie?: string;
    expected?: number;
    origin?: string;
  } = {},
) {
  const response = await fetch(frontend + path, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // Never include bodies or cookie headers in assertion messages.
  assert.equal(
    response.status,
    expected,
    `${method} ${path} returned an unexpected status.`,
  );
  return response;
}

function sessionCookie(response: Response) {
  const cookie = response.headers
    .getSetCookie()
    .filter((value) => value.startsWith("campusfix_session="))
    .at(-1);
  assert.ok(cookie, "The frontend proxy must forward the session cookie.");
  assert.ok(/;\s*HttpOnly/i.test(cookie), "Session cookies must be HttpOnly.");
  assert.ok(
    /;\s*Secure/i.test(cookie),
    "Production session cookies must be Secure.",
  );
  assert.ok(
    /;\s*SameSite=Strict/i.test(cookie),
    "Session cookies must use SameSite=Strict.",
  );
  assert.ok(
    /;\s*Path=\//i.test(cookie),
    "Session cookies must use the root path.",
  );
  return cookie.split(";")[0];
}

async function redirect(path: string, destination: string, cookie = "") {
  const response = await request(path, { cookie, expected: 307 });
  assert.equal(
    new URL(response.headers.get("location")!, frontend).pathname,
    destination,
  );
  await response.body?.cancel();
}

try {
  await Promise.all([
    assertPortAvailable(frontendPort),
    assertPortAvailable(apiPort),
  ]);
  await administrator.connect();
  administratorConnected = true;
  // The identifier is generated here, never supplied by a user or environment.
  assert.ok(/^campusfix_prod_smoke_[a-f0-9]{20}$/.test(databaseName));
  await administrator.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  assert.equal(
    await command(["node_modules/prisma/build/index.js", "migrate", "deploy"]),
    0,
    "Production migrations failed for the disposable database.",
  );

  const bootstrapEnv = {
    ...productionEnv,
    BOOTSTRAP_MANAGER_EMAIL: managerEmail,
    BOOTSTRAP_MANAGER_PASSWORD: managerPassword,
    BOOTSTRAP_MANAGER_NAME: "Production Smoke Manager",
    HOSTEL_NAME: "Production Smoke Residence",
    HOSTEL_ADDRESS: "Isolated test residence, Pune",
    HOSTEL_ROOMS: "12",
    HOSTEL_INVITE_CODE: invitation,
    HOSTEL_LAT: "18.5204",
    HOSTEL_LNG: "73.8567",
  };
  assert.equal(
    await command(["--import", "tsx", "server/bootstrap.ts"], bootstrapEnv),
    0,
    "Production workspace bootstrap failed.",
  );
  inspector = new pg.Client({
    connectionString: testDatabaseUrl.toString(),
    ssl,
  });
  await inspector.connect();
  const initial = await inspector.query('SELECT id, demo FROM "Workspace"');
  assert.equal(initial.rowCount, 1);
  assert.equal(
    initial.rows[0].demo,
    false,
    "Production bootstrap must not create a demo workspace.",
  );
  const initialManagers = await inspector.query('SELECT id, role FROM "User"');
  assert.equal(initialManagers.rowCount, 1);
  assert.equal(initialManagers.rows[0].role, "MANAGER");
  assert.equal(
    await command(["--import", "tsx", "server/bootstrap.ts"], bootstrapEnv),
    1,
    "Bootstrap must refuse to overwrite an existing workspace.",
  );
  const preservedManagers = await inspector.query('SELECT id FROM "User"');
  assert.equal(preservedManagers.rowCount, 1);
  assert.equal(preservedManagers.rows[0].id, initialManagers.rows[0].id);
  console.log(
    "PASS: production migrations, non-demo bootstrap, and overwrite refusal.",
  );

  let backend = start(["build/api/index.js"]);
  await waitForHealth(backend, `${api}/health`, "Production API");
  const frontendProcess = start([
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(frontendPort),
  ]);
  await waitForHealth(
    frontendProcess,
    `${frontend}/api/health`,
    "Production frontend proxy",
  );
  for (const path of ["/manager", "/student", "/technician"])
    await redirect(path, "/login");
  for (const path of [
    "/api/manager",
    "/api/student",
    "/api/technician",
    "/api/auth/me",
  ])
    await request(path, { expected: 401 });
  const loginPage = await request("/login");
  assert.ok((await loginPage.text()).includes("CampusFix"));
  const health = await (await request("/api/health")).json();
  assert.equal(health.database, "PostgreSQL");
  console.log(
    "PASS: production startup, public health/login, and anonymous route protection.",
  );

  await request("/api/auth/login", {
    method: "POST",
    body: { email: managerEmail, password: managerPassword, role: "STUDENT" },
    expected: 401,
  });
  await request("/api/auth/login", {
    method: "POST",
    body: {
      email: managerEmail,
      password: "incorrect password",
      role: "MANAGER",
    },
    expected: 401,
  });
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: managerEmail, password: managerPassword, role: "MANAGER" },
  });
  const managerCookie = sessionCookie(login);
  const manager = await login.json();
  assert.equal(manager.user.role, "MANAGER");
  assert.equal(manager.redirect, "/manager");
  const workspace = await (
    await request("/api/manager", { cookie: managerCookie })
  ).json();
  assert.equal(workspace.meta.demo, false);
  assert.equal(workspace.meta.aiConfigured, false);
  assert.equal(workspace.complaints.length, 0);
  assert.equal(workspace.properties.length, 1);
  await request("/manager", { cookie: managerCookie });
  await redirect("/student", "/manager", managerCookie);
  await redirect("/technician", "/manager", managerCookie);
  await request("/api/student", { cookie: managerCookie, expected: 403 });
  await request("/api/technician", { cookie: managerCookie, expected: 403 });
  await request("/api/profile", {
    method: "PATCH",
    body: { name: "Denied update", phone: "" },
    cookie: managerCookie,
    origin: "https://untrusted.example",
    expected: 403,
  });
  console.log(
    "PASS: secure cookies through the frontend proxy, manager sign-in, role guards, and origin protection.",
  );

  const options = await (await request("/api/auth/options")).json();
  const studentSignup = await request("/api/auth/register", {
    method: "POST",
    expected: 201,
    body: {
      email: "student@production-smoke.invalid",
      password: testPassword,
      role: "STUDENT",
      name: "Smoke Student",
      propertyId: options.properties[0].id,
      room: "101",
      inviteCode: invitation,
    },
  });
  const studentCookie = sessionCookie(studentSignup);
  const technicianSignup = await request("/api/auth/register", {
    method: "POST",
    expected: 201,
    body: {
      email: "technician@production-smoke.invalid",
      password: testPassword,
      role: "TECHNICIAN",
      name: "Smoke Technician",
      specialization: ["Plumbing"],
    },
  });
  const technicianCookie = sessionCookie(technicianSignup);
  await request("/student", { cookie: studentCookie });
  await request("/technician", { cookie: technicianCookie });
  for (const cookie of [studentCookie, technicianCookie])
    await request("/api/manager", { cookie, expected: 403 });
  await request("/api/technician", { cookie: studentCookie, expected: 403 });
  await request("/api/student", { cookie: technicianCookie, expected: 403 });
  await redirect("/manager", "/student", studentCookie);
  await redirect("/manager", "/technician", technicianCookie);
  console.log(
    "PASS: production student/technician registration, page rendering, and cross-role isolation.",
  );

  await stop(backend);
  backend = start(["build/api/index.js"]);
  await waitForHealth(backend, `${api}/health`, "Restarted production API");
  assert.equal(
    (await (await request("/api/auth/me", { cookie: managerCookie })).json())
      .user.id,
    manager.user.id,
  );
  for (const cookie of [managerCookie, studentCookie, technicianCookie]) {
    const logout = await request("/api/auth/logout", {
      method: "POST",
      body: {},
      cookie,
    });
    assert.ok(
      logout.headers
        .getSetCookie()
        .some((value) => value.startsWith("campusfix_session=;")),
      "Logout must clear the browser session cookie.",
    );
    await request("/api/auth/me", { cookie, expected: 401 });
  }
  await redirect("/manager", "/login", managerCookie);
  assert.equal(
    (await inspector.query('SELECT COUNT(*)::int AS count FROM "Session"'))
      .rows[0].count,
    0,
  );
  console.log(
    "PASS: sessions survive API restart; logout invalidates every role's session.",
  );
} finally {
  await Promise.all([...children].map(stop));
  await inspector?.end();
  if (databaseCreated && administratorConnected) {
    // This is the only DROP: it must match the exact name created successfully above.
    assert.ok(/^campusfix_prod_smoke_[a-f0-9]{20}$/.test(databaseName));
    assert.notEqual(new URL(sourceDatabaseUrl).pathname, `/${databaseName}`);
    await administrator.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    console.log(
      "Cleaned up the disposable production database and test server processes.",
    );
  }
  if (administratorConnected) await administrator.end();
}
