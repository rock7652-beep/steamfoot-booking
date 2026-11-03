import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { $queryRaw: db.read } }));
import { sportsNativePreview } from '@/lib/sports-native-preview';
import { sportsStagingEnabled, requireSportsStaging } from '@/lib/sports-staging';

beforeEach(() => {
  db.read.mockReset();
  for (const [key, value] of Object.entries({ VERCEL: '1', VERCEL_ENV: 'production', NODE_ENV: 'production',
    VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_REPO_OWNER: 'rock7652-beep', VERCEL_GIT_REPO_SLUG: 'steamfoot-booking',
    DATABASE_URL: 'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres',
    DIRECT_URL: 'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres' })) vi.stubEnv(key, value);
  for (const key of ['SPORTS_REDESIGN_PRODUCTION','SPORTS_REDESIGN_STORE_IDS','SPORTS_REDESIGN_STAGING','SPORTS_REDESIGN_PREVIEW','SPORTS_LIVE_FLOW_QA','WORKERS_CI_BRANCH','CF_PAGES_BRANCH']) vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('native sports is the production default', () => {
  it('opens a newly entitled store without setting either historical rollout flag', async () => {
    db.read.mockResolvedValue([{ enabled: true }]);
    expect(await sportsNativePreview('brand-new-fitness-store')).toBe(true);
    expect(await sportsStagingEnabled('brand-new-fitness-store')).toBe(true);
    await expect(requireSportsStaging('brand-new-fitness-store')).resolves.toBeUndefined();
    const [strings, ...params] = db.read.mock.calls[0];
    expect(strings.join('?')).toContain("s.\"industryModule\"::text = 'COURSE'");
    expect(strings.join('?')).toContain("e.\"featureKey\" = 'business.fitness'");
    expect(strings.join('?')).toContain("e.\"featureKey\" = 'business.music'");
    expect(params).toContain('brand-new-fitness-store');
  });
  it('never turns music, another module or a disabled entitlement into sports', async () => {
    db.read.mockResolvedValue([{ enabled: false }]);
    for (const id of ['music-store','beauty-store','disabled-fitness','unknown-store']) {
      expect(await sportsNativePreview(id)).toBe(false);
      await expect(requireSportsStaging(id)).rejects.toThrow();
    }
  });
  it('does not silently fall back to legacy UI on a database failure', async () => {
    db.read.mockRejectedValue(new Error('lookup unavailable'));
    await expect(sportsNativePreview('fitness-store')).rejects.toThrow('lookup unavailable');
  });
  it('requires module activation instead of showing a legacy course workspace', async () => {
    db.read.mockResolvedValue([{ enabled: false, activationRequired: true }]);
    await expect(sportsNativePreview('unconfigured-course-store')).rejects.toThrow('請先開通');
  });
  it('does not query eligibility for a missing store or a non-production environment', async () => {
    expect(await sportsNativePreview()).toBe(false);
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(await sportsNativePreview('production-fitness-store')).toBe(false);
    expect(db.read).not.toHaveBeenCalled();
  });
});
