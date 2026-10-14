import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { commitMusicSourceImportInTransaction } from "@/server/services/music-source-import";
import { parseMusicSourceImport, planMusicSourceImport, sourceImportHash } from "@/lib/music-source-import";
import { sourceFixture } from "./fixtures/music-source-import";
const actor = { storeId: "store-lubymusic", userId: "synthetic-manager", name: "虛構管理者", role: "MANAGER" };
let db: PGlite;
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
  for (const [key, value] of Object.entries({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/music-opening-state-20261007", VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "", DATABASE_URL: "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres", DIRECT_URL: "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres" })) vi.stubEnv(key, value);
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE "Store"(id text PRIMARY KEY); CREATE TABLE "User"(id text PRIMARY KEY);
    CREATE TABLE "Customer"(id text PRIMARY KEY, "storeId" text, name text, phone text, "serviceNote" text, "mergedIntoCustomerId" text, UNIQUE("storeId",phone));
    CREATE TABLE "AuditLog"(id serial PRIMARY KEY, payload jsonb);
    INSERT INTO "Store" VALUES('store-lubymusic'); INSERT INTO "User" VALUES('synthetic-manager');`);
  await db.exec(readFileSync("docs/sql/music-source-import-preview.sql", "utf8"));
});
afterEach(async () => { await db.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });
function adapter(sql: { query: (q: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }, corrupt = false) {
  const query = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const q = parts.reduce((out, part, index) => out + part + (index < values.length ? `$${index + 1}` : ""), "");
    const result = await sql.query(q, values);
    if (corrupt && q.startsWith("SELECT payload,result")) return [{ payload: {}, result: {} }];
    return result.rows;
  };
  return { $queryRaw: query, $executeRaw: query,
    customer: {
      findMany: async () => (await sql.query('SELECT * FROM "Customer" WHERE "storeId"=$1', [actor.storeId])).rows,
      create: async ({ data }: { data: { id: string; storeId: string; name: string; phone: string; serviceNote: string } }) => {
        await sql.query('INSERT INTO "Customer" (id,"storeId",name,phone,"serviceNote") VALUES ($1,$2,$3,$4,$5)', [data.id, data.storeId, data.name, data.phone, data.serviceNote]); return { id: data.id };
      },
    },
    auditLog: { create: async ({ data }: { data: unknown }) => { await sql.query('INSERT INTO "AuditLog" (payload) VALUES ($1::jsonb)', [JSON.stringify(data)]); } },
  } as unknown as Prisma.TransactionClient;
}
describe("structured source importer — PGlite PostgreSQL transaction adapter", () => {
  it("writes profiles and immutable-source payload atomically; identical reimport is a no-op", async () => {
    const data = parseMusicSourceImport(sourceFixture()), plan = planMusicSourceImport(data, []);
    const run = () => db.transaction(sql => commitMusicSourceImportInTransaction(adapter(sql), actor, data, sourceImportHash(plan)));
    const first = await run(), second = await run();
    expect(first.duplicate).toBe(false); expect(second.duplicate).toBe(true); expect(second.batchId).toBe(first.batchId);
    expect((await db.query('SELECT count(*)::int AS n FROM "Customer"')).rows).toEqual([{ n: 1 }]);
    expect((await db.query('SELECT count(*)::int AS n FROM "AuditLog"')).rows).toEqual([{ n: 1 }]);
  });
  it("rolls back profiles, batch and audit on readback failure", async () => {
    const data = parseMusicSourceImport(sourceFixture()), hash = sourceImportHash(planMusicSourceImport(data, []));
    await expect(db.transaction(sql => commitMusicSourceImportInTransaction(adapter(sql, true), actor, data, hash))).rejects.toThrow("讀回");
    for (const table of ["Customer", "MusicSourceImportBatch", "AuditLog"]) expect((await db.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows).toEqual([{ n: 0 }]);
  });
  it("blocks a stale plan before any writes", async () => {
    await expect(db.transaction(sql => commitMusicSourceImportInTransaction(adapter(sql), actor, sourceFixture(), "stale"))).rejects.toThrow("重新預覽");
    expect((await db.query('SELECT count(*)::int AS n FROM "Customer"')).rows).toEqual([{ n: 0 }]);
  });
  it("scope and business-hour rejection happen before database queries", async () => {
    const query = vi.fn(); const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
    await expect(commitMusicSourceImportInTransaction(tx, { ...actor, storeId: "another-store" }, sourceFixture(), "x")).rejects.toThrow();
    vi.setSystemTime(new Date("2026-10-14T06:00:00Z"));
    await expect(commitMusicSourceImportInTransaction(tx, actor, sourceFixture(), "x")).rejects.toThrow("BUSINESS_HOURS");
    expect(query).not.toHaveBeenCalled();
  });
  it.each(["anon", "authenticated"])("%s has no archive access", async role => {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query('SELECT * FROM "MusicSourceImportBatch"')).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
    const rls = await db.query('SELECT relrowsecurity AS enabled FROM pg_class WHERE relname=$1', ["MusicSourceImportBatch"]);
    expect(rls.rows).toEqual([{ enabled: true }]);
  });
});
