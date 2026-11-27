import { beforeAll, afterAll, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { AiRoutingRepository } from "@/server/ai/routing-repository";
import { AiButlerRepository, type AiSql, type AiDatabase } from "@/server/ai/repository";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
import { aiIdentity } from "@/server/ai/service";
import { AiHandoffRepository } from "@/server/ai/handoff-repository";

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

it.skipIf(!enabled)("unknown routing receipts block a new event until the operator changes generation",async()=>{
 await clients[0].query(readFileSync("scripts/sql/ai-digital-butler/preview-routing.sql","utf8"));
 const c=clients[0];
 const adapt:AiSql={query:async(sql,values)=>(await c.query(sql,values)).rows as never};
 const routes=new AiRoutingRepository({...adapt,transaction:async work=>{await c.query("BEGIN");try{const result=await work(adapt);await c.query("COMMIT");return result;}catch(error){await c.query("ROLLBACK");throw error;}}});
 const id={storeId:"ai-preview-beauty",scopeKey:"f".repeat(64),eventKey:"a".repeat(64)},fingerprint="b".repeat(64);
 expect((await routes.claim(id,fingerprint,false,now)).state).toBe("CLAIMED");
 await routes.unknown(id,now);
 expect((await routes.claim({...id,eventKey:"c".repeat(64)},fingerprint,false,now)).state).toBe("BUSY");
 await repositories[0].handoff(id,false,now);
 expect((await routes.claim({...id,eventKey:"d".repeat(64)},fingerprint,false,now)).state).toBe("CLAIMED");
});

it.skipIf(!enabled)("two operators cannot resume the same handoff version twice across PostgreSQL connections", async () => {
  await clients[0].query(readFileSync("scripts/sql/ai-digital-butler/preview-handoff.sql", "utf8"));
  const scope = { storeId: "ai-preview-fitness", scopeKey: "e".repeat(64) };
  const revision = await repositories[0].handoff(scope, true, now);
  const queues = clients.slice(0, 2).map(c => {
    const adapt: AiSql = { query: async (sql, values) => (await c.query(sql, values)).rows as never };
    return new AiHandoffRepository({ ...adapt, transaction: async work => {
      await c.query("BEGIN"); try { const result = await work(adapt); await c.query("COMMIT"); return result; }
      catch (error) { await c.query("ROLLBACK"); throw error; }
    } });
  });
  const commands = ["a", "b"].map(key => ({ ...scope, revision, actorKey: key.repeat(64), commandKey: key.repeat(64) }));
  expect(await queues[0].list(scope.storeId)).toMatchObject({ total: 1, rows: [{ scopeKey: scope.scopeKey, revision, needsReview: false }] });
  const results = await Promise.allSettled(queues.map((queue, i) => queue.resume(commands[i], now, async () => undefined)));
  expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(row => row.status === "rejected")).toHaveLength(1);
  const winner = results.findIndex(row => row.status === "fulfilled");
  expect(await queues[winner].resume(commands[winner], now, async () => undefined)).toEqual({ duplicate: true, revision: revision + 1 });
  expect((await clients[2].query('SELECT COUNT(*)::int AS n FROM "AiButlerHandoffAudit"')).rows[0].n).toBe(1);
});

it.skipIf(!enabled)("operator authorization must not wait for the sole connection already held by its transaction", async () => {
  const { Pool } = createRequire(import.meta.url)("pg");
  const pool = new Pool({ host: socket, user: "postgres", database: "postgres", max: 1, connectionTimeoutMillis: 300 });
  const identity = { storeId: "ai-preview-fitness", scopeKey: "9".repeat(64) };
  const revision = await repositories[0].handoff(identity, true, now);
  const query: AiSql["query"] = async (sql, values) => (await pool.query(sql, values)).rows;
  const queue = new AiHandoffRepository({ query, transaction: async work => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try { const result = await work({ query: async (sql, values) => (await client.query(sql, values)).rows }); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    } finally { client.release(); }
  } });
  try {
    await expect(queue.resume({ ...identity, revision, actorKey: "8".repeat(64), commandKey: "8".repeat(64) }, now,
      async () => { await pool.query("SELECT 1"); })).resolves.toEqual({ duplicate: false, revision: revision + 1 });
  } finally { await pool.end(); }
});
