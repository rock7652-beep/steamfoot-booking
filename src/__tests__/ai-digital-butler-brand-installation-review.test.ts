import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const root = "scripts/sql/ai-digital-butler/", plan = root + "brand-preview-review/";
const install = readFileSync(plan + "install.proposed.sql", "utf8");
const soft = readFileSync(plan + "soft-stop.proposed.sql", "utf8");
const remove = readFileSync(plan + "remove-empty.proposed.sql", "utf8");
const role = "steamfoot_ai_preview_20261125", service = "ai-preview-brand-steamfoot";
const tables = ["AiBrandService", "AiBrandGrant", "AiBrandSetting", "AiBrandConversation", "AiBrandRequest", "AiBrandDispatch", "AiBrandHandoffAudit", "AiBrandKnowledgeDocument"];
let db: PGlite;
const exists = async () => (await db.query<{ present: boolean }>('SELECT to_regclass(\'public."AiBrandService"\') IS NOT NULL AS present')).rows[0].present;
const runtime = async <T>(work: () => Promise<T>) => { await db.exec(`SET ROLE ${role}`); try { return await work(); } finally { await db.exec("RESET ROLE"); } };
const baseline = async () => (await db.query('SELECT "storeId",setting,revision FROM "AiButlerSetting" ORDER BY "storeId"')).rows;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE ${role} LOGIN NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 8;
    CREATE TABLE "Store" (id text PRIMARY KEY);
    CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text,"startsAt" timestamptz,"expiresAt" timestamptz);
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO ${role},anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
  for (const file of ["preview-install.sql", "preview-routing.sql", "preview-handoff.sql"]) await db.exec(readFileSync(root + file, "utf8"));
  for (const id of ["ai-preview-steamfoot", "ai-preview-beauty", "ai-preview-fitness", "ai-preview-music", "foreign-store"]) {
    await db.query('INSERT INTO "Store" VALUES ($1)', [id]);
    if (id !== "foreign-store") await db.query('INSERT INTO "AiButlerSetting" ("storeId",setting,revision) VALUES ($1,\'{"enabled":false}\',7)', [id]);
  }
  for (const [id, cost] of [["ai-preview-steamfoot", 1690], ["foreign-store", 1000]]) await db.query('INSERT INTO "AiButlerRequest" ("storeId","eventKey","scopeKey",provider,model,status,"heldMicros","createdAt") VALUES ($1,\'historical\',\'scope\',\'openai\',\'gpt-6-luna\',\'UNKNOWN\',$2,CURRENT_TIMESTAMP)', [id, cost]);
  await db.exec(`GRANT SELECT ON "AiButlerRequest" TO ${role}; CREATE POLICY old_store_scope ON "AiButlerRequest" FOR SELECT TO ${role} USING ("storeId" LIKE 'ai-preview-%');`);
}, 30_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec('RESET ROLE; UPDATE "AiButlerControl" SET stopped=true; UPDATE "AiButlerSetting" SET setting=\'{"enabled":false}\';');
  if (await exists()) {
    // Local fixture cleanup only, never sent to any remote database.
    await db.exec('TRUNCATE ' + tables.map(t => `"${t}"`).join(",") + ";");
    await db.exec(remove);
  }
});
it("includes the reviewed schema verbatim and installs only four stopped synthetic config rows atomically", async () => {
  expect(install).toContain(readFileSync(root + "brand-owner-schema.draft.sql", "utf8"));
  const old = await baseline(); await db.exec(install);
  expect(await baseline()).toEqual(old);
  const [row] = (await db.query<{ status: string; enabled: boolean; published: unknown; count: number }>('SELECT g.status,(s.setting->>\'enabled\')::boolean AS enabled,k.published,(SELECT COUNT(*)::int FROM "AiBrandService") AS count FROM "AiBrandGrant" g JOIN "AiBrandSetting" s USING ("serviceId") JOIN "AiBrandKnowledgeDocument" k USING ("serviceId")')).rows;
  expect(row).toEqual({ status: "HIDDEN", enabled: false, published: null, count: 1 });
  expect((await db.query('SELECT * FROM "AiBrandRequest"')).rows).toHaveLength(0);
  expect((await db.query('SELECT * FROM "AiBrandDispatch"')).rows).toHaveLength(0);
});
it("removes inherited anon/authenticated/service_role table and function privileges without changing defaults", async () => {
  const defaults = (await db.query('SELECT defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY defaclobjtype')).rows;
  await db.exec(install);
  for (const denied of ["anon", "authenticated", "service_role"]) {
    expect((await db.query<{ allowed: boolean }>('SELECT has_function_privilege($1,\'public.ai_owner_global_totals()\',\'EXECUTE\') AS allowed', [denied])).rows[0].allowed).toBe(false);
    for (const table of tables) expect((await db.query<{ allowed: boolean }>('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE,TRUNCATE\') AS allowed', [denied, `public."${table}"`])).rows[0].allowed).toBe(false);
  }
  expect((await db.query('SELECT defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY defaclobjtype')).rows).toEqual(defaults);
});
it("allows only the scoped brand rows and the exact operation privilege matrix", async () => {
  await db.exec(install);
  await db.exec('INSERT INTO "AiBrandService" VALUES (\'foreign-brand\',\'foreign fixture\'); INSERT INTO "AiBrandGrant" ("serviceId") VALUES (\'foreign-brand\');');
  await runtime(async () => {
    expect((await db.query('SELECT id FROM "AiBrandService"')).rows).toEqual([{ id: service }]);
    expect((await db.query('SELECT "serviceId" FROM "AiBrandGrant"')).rows).toEqual([{ serviceId: service }]);
    await expect(db.exec('UPDATE "AiBrandGrant" SET status=\'ENABLED\'')).rejects.toThrow("permission denied");
    await expect(db.exec('INSERT INTO "AiBrandService" VALUES (\'new\',\'forged\')')).rejects.toThrow("permission denied");
    await expect(db.exec('INSERT INTO "AiBrandSetting" ("serviceId",setting) VALUES (\'foreign-brand\',\'{}\')')).rejects.toThrow("row-level security");
    await expect(db.exec(`UPDATE "AiBrandSetting" SET "serviceId"='foreign-brand' WHERE "serviceId"='${service}'`)).rejects.toThrow("row-level security");
    await db.exec(`UPDATE "AiBrandSetting" SET revision=revision+1 WHERE "serviceId"='${service}'`);
    await expect(db.exec('DELETE FROM "AiBrandSetting"')).rejects.toThrow("permission denied");
    await expect(db.exec('TRUNCATE "AiBrandSetting"')).rejects.toThrow("permission denied");
    await expect(db.exec('UPDATE "AiBrandHandoffAudit" SET "actorKey"=\'forged\'')).rejects.toThrow("permission denied");
    await expect(db.exec('CREATE TABLE public.forged(id text)')).rejects.toThrow("permission denied");
  });
});
it("the private cost capability counts RLS-hidden Store costs while exposing no ledger rows", async () => {
  await db.exec(install);
  await runtime(async () => {
    expect((await db.query('SELECT "heldMicros" FROM "AiButlerRequest"')).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM public.ai_owner_global_totals()')).rows).toEqual([{ total: "2690", concurrent: "0" }]);
  });
});
it("a failed grant aborts the whole installation and preserves all old settings", async () => {
  const old = await baseline();
  const broken = install.replace(`GRANT EXECUTE ON FUNCTION public.ai_owner_global_totals() TO ${role}`, 'GRANT EXECUTE ON FUNCTION public.ai_owner_global_totals() TO missing_runtime_role');
  await expect(db.exec(broken)).rejects.toThrow('does not exist'); await db.exec("ROLLBACK");
  expect(await exists()).toBe(false); expect(await baseline()).toEqual(old);
});
it("refuses installation if global stop or any existing test-store stop is missing", async () => {
  await db.exec('UPDATE "AiButlerControl" SET stopped=false');
  await expect(db.exec(install)).rejects.toThrow("AI_MUST_REMAIN_STOPPED"); await db.exec("ROLLBACK");
  expect(await exists()).toBe(false);
  await db.exec('UPDATE "AiButlerControl" SET stopped=true; UPDATE "AiButlerSetting" SET setting=\'{"enabled":true}\' WHERE "storeId"=\'ai-preview-beauty\'');
  await expect(db.exec(install)).rejects.toThrow("FOUR_DISABLED_STORES_REQUIRED"); await db.exec("ROLLBACK");
  expect(await exists()).toBe(false);
});
it("empty rollback removes only the new objects, preserving old costs, controls and role", async () => {
  const old = await baseline(); await db.exec(install); await db.exec(remove);
  expect(await exists()).toBe(false); expect(await baseline()).toEqual(old);
  expect((await db.query('SELECT SUM("heldMicros")::text AS cost FROM "AiButlerRequest"')).rows[0]).toEqual({ cost: "2690" });
  expect((await db.query('SELECT stopped FROM "AiButlerControl"')).rows[0]).toEqual({ stopped: true });
  expect((await db.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [role])).rows).toHaveLength(1);
});
it("activity prohibits destructive rollback; soft stop preserves costs and Store aggregate access", async () => {
  await db.exec(install);
  await db.query('INSERT INTO "AiBrandRequest" ("serviceId","eventKey","scopeKey",provider,model,status,"heldMicros","createdAt") VALUES ($1,\'event\',\'scope\',\'mock\',\'gpt-6-luna\',\'UNKNOWN\',100,CURRENT_TIMESTAMP)', [service]);
  await expect(db.exec(remove)).rejects.toThrow("BRAND_ACTIVITY_REQUIRES_RETENTION"); await db.exec("ROLLBACK");
  await db.exec(soft);
  await runtime(async () => {
    await expect(db.query('SELECT * FROM "AiBrandSetting"')).rejects.toThrow("permission denied");
    expect((await db.query('SELECT * FROM public.ai_owner_global_totals()')).rows).toEqual([{ total: "2790", concurrent: "0" }]);
  });
  expect((await db.query('SELECT * FROM "AiBrandRequest"')).rows).toHaveLength(1);
});
it("foreign brand configuration blocks empty removal rather than dropping another owner's data", async () => {
  await db.exec(install); await db.exec('INSERT INTO "AiBrandService" VALUES (\'foreign\',\'fixture\')');
  await expect(db.exec(remove)).rejects.toThrow("FOREIGN_BRAND_DATA_REQUIRES_RETENTION"); await db.exec("ROLLBACK");
  expect(await exists()).toBe(true);
});
