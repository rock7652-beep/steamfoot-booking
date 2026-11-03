import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { $queryRaw: transport.read } }));
import { sportsNativePreview } from '@/lib/sports-native-preview';
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE TABLE "Store" (id text PRIMARY KEY, "industryModule" text);
    CREATE TABLE "StoreFeatureEntitlement" ("storeId" text, "featureKey" text, status text);
    INSERT INTO "Store" VALUES ('fitness','COURSE'),('music','COURSE'),('both','COURSE'),('beauty','BEAUTY'),('disabled','COURSE');
    INSERT INTO "StoreFeatureEntitlement" VALUES ('fitness','business.fitness','ENABLED'),('music','business.music','ENABLED'),('both','business.fitness','ENABLED'),('both','business.music','ENABLED'),('beauty','business.fitness','ENABLED'),('disabled','business.fitness','DISABLED');`);
  transport.read.mockImplementation(async (parts: TemplateStringsArray, ...params: unknown[]) => {
    const sql = parts.reduce((result, part, index) => result + (index ? `$${index}` : '') + part, '');
    return (await db.query(sql, params)).rows;
  });
});
beforeEach(() => {
  for (const [key, value] of Object.entries({ VERCEL: '1', VERCEL_ENV: 'production', NODE_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_REPO_OWNER: 'rock7652-beep', VERCEL_GIT_REPO_SLUG: 'steamfoot-booking', DATABASE_URL: 'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres', DIRECT_URL: 'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres' })) vi.stubEnv(key, value);
  for (const key of ['SPORTS_REDESIGN_STORE_IDS','SPORTS_REDESIGN_PRODUCTION','SPORTS_REDESIGN_STAGING','SPORTS_REDESIGN_PREVIEW','SPORTS_LIVE_FLOW_QA','WORKERS_CI_BRANCH','CF_PAGES_BRANCH']) vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.close());
it('evaluates actual entitlement SQL without applying fitness to music or other modules', async () => {
  expect(await sportsNativePreview('fitness')).toBe(true);
  for (const id of ['music','both','beauty','missing']) expect(await sportsNativePreview(id)).toBe(false);
  await expect(sportsNativePreview('disabled')).rejects.toThrow('請先開通');
});
it('a newly created store uses native sports immediately after module activation', async () => {
  await db.exec(`INSERT INTO "Store" VALUES ('created-after-deployment','COURSE')`);
  await expect(sportsNativePreview('created-after-deployment')).rejects.toThrow('請先開通');
  await db.exec(`INSERT INTO "StoreFeatureEntitlement" VALUES ('created-after-deployment','business.fitness','ENABLED')`);
  expect(await sportsNativePreview('created-after-deployment')).toBe(true);
});
