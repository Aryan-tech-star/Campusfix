import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const port = 3107,
  origin = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString("hex");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      MANAGER_LOGIN_PASSWORD: password,
      MANAGER_SESSION_SECRET: randomBytes(32).toString("hex"),
      MANAGER_APP_URL: origin,
      MANAGER_DB_PATH: `work/production-${Date.now()}.sqlite`,
      MANAGER_SEED_DEMO: "false",
    },
    stdio: "ignore",
    windowsHide: true,
  },
);
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(origin + "/api/manager/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(ready, "Production server did not become ready");
  assert.equal((await fetch(origin + "/manager")).status, 200);
  assert.equal((await fetch(origin + "/api/manager")).status, 401);
  const login = await fetch(origin + "/api/manager/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=strict/i);
  const r = await fetch(origin + "/api/manager", {
    headers: { cookie: cookie.split(";")[0] },
  });
  assert.equal(r.status, 200);
  const state = await r.json();
  assert.equal(state.meta.demo, false);
  assert.equal(state.complaints.length, 0);
  const bad = await fetch(origin + "/api/manager/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ password: "incorrect" }),
  });
  assert.equal(bad.status, 401);
  const csrf = await fetch(origin + "/api/manager/settings", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: cookie.split(";")[0],
      origin: "https://attacker.example",
    },
    body: "{}",
  });
  assert.equal(csrf.status, 403);
  console.log(
    "PASS: production page, public health, unauthorized API blocked, manager sign-in, secure HttpOnly cookie, authenticated read, empty production seed, bad-password rejection, CSRF rejection.",
  );
} finally {
  server.kill();
}
