import { beforeAll, afterAll, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { AiButlerRepository, type AiSql, type AiDatabase } from "@/server/ai/repository";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
import { aiIdentity } from "@/server/ai/service";

// Explicit opt-in; zero hosted URLs, no Docker networking or published ports.
const enabled = process.env.AI_LOCAL_POSTGRES_REHEARSAL === "1";
const container = `steamfoot-ai-${randomUUID()}`;
let socket: string, started = false;
type PgClient = { connect(): Promise<void>; end(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
const clients: PgClient[] = [];
const docker = (args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const now = new Date("2026-11-25T12:00:00Z");
let repositories: AiButlerRepository[];
beforeAll(async () => {
  if (!enabled) return;
  socket = mkdtempSync(join(tmpdir(), "steamfoot-ai-pg-")); chmodSync(socket, 0o777);
  docker(["run", "--detach", "--name", container, "--network", "none", "--memory", "512m", "--cpus", "1", "--tmpfs", "/var/lib/postgresql/data:rw,size=256m", "--mount", `type=bind,source=${socket},target=/qa`, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine", "postgres", "-c", "listen_addresses=", "-c", "unix_socket_directories=/var/run/postgresql,/qa"]); started = true;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if (docker(["exec", container, "cat", "/proc/1/comm"]).trim() !== "postgres") throw new Error(); docker(["exec", container, "psql", "-h", "/qa", "-U", "postgres", "-Atc", "SELECT 1"]); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!ready) throw new Error("LOCAL_POSTGRES_NOT_READY");
  const { Client } = createRequire(import.meta.url)("pg");
  for (let i = 0; i < 3; i++) { const c: PgClient = new Client({ host: socket, user: "postgres", database: "postgres" }); await c.connect(); clients.push(c); }
  const adapt = (c: PgClient): AiSql => ({ query: async (sql, values) => (await c.query(sql, values)).rows as never });
  repositories = clients.map(c => {
    const database: AiDatabase = { ...adapt(c), transaction: async work => {
      await c.query("BEGIN");
      try { const result = await work(adapt(c)); await c.query("COMMIT"); return result; }
      catch (error) { await c.query("ROLLBACK"); throw error; }
    } }; return new AiButlerRepository(database);
  });
  await clients[0].query('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE "Store" (id text PRIMARY KEY);CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text,"startsAt" timestamptz,"expiresAt" timestamptz);');
  await clients[0].query(readFileSync("scripts/sql/ai-digital-butler/preview-install.sql", "utf8"));
  await clients[0].query('UPDATE "AiButlerControl" SET stopped=false; INSERT INTO "Store" VALUES (\'a\'),(\'b\'); INSERT INTO "StoreFeatureEntitlement" VALUES (\'a\',\'ai_digital_butler\',\'ENABLED\',NULL,NULL),(\'b\',\'ai_digital_butler\',\'ENABLED\',NULL,NULL);');
  for (const id of ["a", "b"]) await repositories[0].saveSetting(id, { ...DEFAULT_AI_SETTING, enabled: true }, 0, now);
}, 30_000);
afterAll(async () => {
  await Promise.all(clients.map(c => c.end()));
  if (started) docker(["rm", "-f", container]);
  if (socket) rmSync(socket, { recursive: true, force: true });
});
it.skipIf(!enabled)("two independent PostgreSQL connections cannot overspend the shared remaining budget", async () => {
  // Simulate US$19.999900 already charged in another store. Only one 100-micro reservation fits.
  await clients[0].query(`INSERT INTO "AiButlerRequest" ("storeId","eventKey","scopeKey",provider,model,status,"heldMicros","createdAt") VALUES ('a','prior','prior','openai','gpt-6-luna','UNKNOWN',19999900,$1)`, [now]);
  const claim = (storeId: string, index: number) => repositories[index].reserve({ ...aiIdentity({ storeId, channel: "TEST", channelAccountId: "test", actorId: "synthetic", module: "STEAMFOOT" }, `event-${index}`, "s".repeat(40)), model: "gpt-6-luna", provider: "openai", heldMicros: 100, now }, "TEST");
  // The first store's monthly ceiling is raised only in this synthetic fixture.
  await repositories[0].saveSetting("a", { ...DEFAULT_AI_SETTING, enabled: true, monthlyBudgetMicros: 20_000_000 }, 1, now);
  const results = await Promise.allSettled([claim("a", 0), claim("b", 1)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect((await clients[2].query('SELECT SUM("heldMicros")::text AS total FROM "AiButlerRequest"')).rows[0].total).toBe("20000000");
});
it.skipIf(!enabled)("duplicate events serialize to one request across independent connections", async () => {
  await clients[0].query('TRUNCATE "AiButlerRequest"');
  const id = aiIdentity({ storeId: "b", channel: "TEST", channelAccountId: "test", actorId: "synthetic", module: "STEAMFOOT" }, "same", "s".repeat(40));
  const results = await Promise.all(repositories.slice(0, 2).map(repository => repository.reserve({ ...id, model: "gpt-6-luna", provider: "openai", heldMicros: 100, now }, "TEST")));
  expect(results.map(r => r.duplicate).sort()).toEqual([false, true]);
  expect((await clients[2].query('SELECT COUNT(*)::text AS n FROM "AiButlerRequest"')).rows[0].n).toBe("1");
});
it.skipIf(!enabled)("rehearses hosted fixtures and the restricted role without granting business writes or browser access", async () => {
  await clients[0].query(`ALTER TABLE "Store" ADD COLUMN name text, ADD COLUMN slug text, ADD COLUMN "industryModule" text, ADD COLUMN plan text, ADD COLUMN "isDemo" boolean, ADD COLUMN "updatedAt" timestamptz;
    ALTER TABLE "StoreFeatureEntitlement" ADD COLUMN id text, ADD COLUMN "updatedAt" timestamptz;
    CREATE TABLE "Booking" (id text PRIMARY KEY);`);
  await clients[0].query(readFileSync("scripts/sql/ai-digital-butler/preview-fixtures.sql", "utf8"));
  await clients[0].query("SET ROLE steamfoot_ai_preview_20261125");
  try {
    expect((await clients[0].query('SELECT COUNT(*)::text AS n FROM "AiButlerSetting"')).rows[0].n).toBe("4");
    await expect(clients[0].query('INSERT INTO "Booking" VALUES (\'forbidden\')')).rejects.toThrow(/permission denied/);
    await expect(clients[0].query('UPDATE "AiButlerSetting" SET setting=\'{}\' WHERE "storeId"=\'a\' RETURNING *')).resolves.toMatchObject({ rows: [] });
    expect((await clients[0].query("SELECT NOT rolbypassrls AND NOT rolcreaterole AND NOT rolsuper AS safe FROM pg_roles WHERE rolname=current_user")).rows[0].safe).toBe(true);
  } finally { await clients[0].query("RESET ROLE"); }
});
