import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { ManagerState } from "./domain";
import { seedState } from "./seed";

// Isolated adapter boundary. Transactions serialize writes across workers/processes.
const globalStore = globalThis as unknown as {
  managerSqlite?: DatabaseSync;
  managerPg?: Pool;
  managerPgReady?: Promise<void>;
};
export const storageName = () =>
  process.env.MANAGER_DATABASE_URL ? "PostgreSQL" : "SQLite";
function initialState(): ManagerState {
  const s = seedState();
  if (
    process.env.MANAGER_SEED_DEMO === "false" ||
    (process.env.NODE_ENV === "production" &&
      process.env.MANAGER_SEED_DEMO !== "true")
  )
    s.complaints = [];
  return s;
}
function sqlite() {
  if (!globalStore.managerSqlite) {
    const file = path.resolve(
      /* turbopackIgnore: true */
      process.env.MANAGER_DB_PATH || "data/manager.sqlite",
    );
    mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS manager_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)",
    );
    db.prepare(
      "INSERT OR IGNORE INTO manager_state (id,payload) VALUES (1,?)",
    ).run(JSON.stringify(initialState()));
    globalStore.managerSqlite = db;
  }
  return globalStore.managerSqlite;
}
async function postgres() {
  if (!globalStore.managerPg) {
    globalStore.managerPg = new Pool({
      connectionString: process.env.MANAGER_DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 10000,
      ssl: process.env.MANAGER_DATABASE_CA
        ? {
            ca: process.env.MANAGER_DATABASE_CA.replace(/\\n/g, "\n"),
            rejectUnauthorized: true,
          }
        : undefined,
    });
    const pool = globalStore.managerPg;
    globalStore.managerPgReady = (async () => {
      await pool.query(
        "CREATE TABLE IF NOT EXISTS campusfix_manager_state (id INTEGER PRIMARY KEY CHECK(id=1), payload JSONB NOT NULL)",
      );
      await pool.query(
        "INSERT INTO campusfix_manager_state (id,payload) VALUES (1,$1) ON CONFLICT DO NOTHING",
        [JSON.stringify(initialState())],
      );
    })();
  }
  await globalStore.managerPgReady;
  return globalStore.managerPg;
}
export async function readState(): Promise<ManagerState> {
  if (process.env.MANAGER_DATABASE_URL)
    return (
      await (
        await postgres()
      ).query("SELECT payload FROM campusfix_manager_state WHERE id=1")
    ).rows[0].payload;
  const row = sqlite()
    .prepare("SELECT payload FROM manager_state WHERE id=1")
    .get() as { payload: string };
  return JSON.parse(row.payload);
}
export async function mutateState<T>(
  mutate: (s: ManagerState) => T,
): Promise<T> {
  if (process.env.MANAGER_DATABASE_URL) {
    const client = await (await postgres()).connect();
    try {
      await client.query("BEGIN");
      const s = (
        await client.query(
          "SELECT payload FROM campusfix_manager_state WHERE id=1 FOR UPDATE",
        )
      ).rows[0].payload as ManagerState;
      const result = mutate(s);
      s.revision++;
      await client.query(
        "UPDATE campusfix_manager_state SET payload=$1 WHERE id=1",
        [JSON.stringify(s)],
      );
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  const db = sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare("SELECT payload FROM manager_state WHERE id=1")
      .get() as { payload: string };
    const s = JSON.parse(row.payload) as ManagerState;
    const result = mutate(s);
    s.revision++;
    db.prepare("UPDATE manager_state SET payload=? WHERE id=1").run(
      JSON.stringify(s),
    );
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
