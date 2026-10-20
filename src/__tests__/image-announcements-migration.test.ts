import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
it("migration preserves stores, isolates binary assets and cascades only the deleted store", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Store" (id TEXT PRIMARY KEY); INSERT INTO "Store" VALUES (\'a\'), (\'b\');');
    await db.exec(readFileSync("prisma/migrations/20261020100000_image_announcements/migration.sql", "utf8"));
    await db.query('INSERT INTO "ImageAnnouncementSet" ("storeId", items) VALUES ($1, $2::jsonb)', ['a', JSON.stringify([{ id: 'image-a' }])]);
    await db.query('INSERT INTO "ImageAnnouncementAsset" (id, "storeId", content, "mimeType") VALUES ($1, $2, $3, $4)', ['image-a', 'a', new Uint8Array([1, 2]), 'image/jpeg']);
    await db.query('INSERT INTO "ImageAnnouncementAsset" (id, "storeId", content, "mimeType") VALUES ($1, $2, $3, $4)', ['image-b', 'b', new Uint8Array([3]), 'image/jpeg']);
    expect((await db.query('SELECT * FROM "Store"')).rows).toHaveLength(2);
    await db.query('DELETE FROM "Store" WHERE id=$1', ['a']);
    expect((await db.query('SELECT * FROM "ImageAnnouncementSet"')).rows).toHaveLength(0);
    expect((await db.query('SELECT id FROM "ImageAnnouncementAsset"')).rows).toEqual([{ id: 'image-b' }]);
  } finally { await db.close(); }
});
it("hosted review branch stops before database work", () => {
  for (const key of ['VERCEL_GIT_COMMIT_REF', 'WORKERS_CI_BRANCH', 'CF_PAGES_BRANCH']) {
    const result = spawnSync(process.execPath, ['scripts/ci-migrate.mjs'], { env: { ...process.env, [key]: 'feat/image-announcements' }, encoding: 'utf8' });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('Image announcements review cannot deploy or execute migrations');
  }
});
