import { describe, it, expect, vi } from 'vitest';
import { reviewedBeautyNotificationWorker, beautyNotificationActivationAt } from '../../scripts/beauty-notification-release-scope.mjs';
import { beautyDatabaseSelection } from '../../scripts/beauty-database-scope.mjs';
import { validateBeautyProductionRelease, beautyNotificationWorkerPreflight } from '../../scripts/beauty-production-release-preflight.mjs';
const env = { NODE_ENV: 'test' as const, VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_REPO_OWNER: 'rock7652-beep', VERCEL_GIT_REPO_SLUG: 'steamfoot-booking', DATABASE_URL: 'postgresql://postgres.qijlnhtpbintanzpxkvf:synthetic@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres', BEAUTY_MODULE_ENABLED: '1', BEAUTY_DATABASE_MODE: 'dedicated', BEAUTY_DATABASE_ROLE: 'steamfoot_beauty_prod_20261025', BEAUTY_DATABASE_PASSWORD: 'a'.repeat(64), BEAUTY_NOTIFICATION_WORKER_MODE: 'shared-main-v1', BEAUTY_NOTIFICATIONS_ACTIVATED_AT: '2026-10-25T15:00:00.000Z', BEAUTY_NOTIFICATIONS_ENABLED: '1' };
describe('reviewed Beauty notification release', () => {
    it('opens only the exact production repository, connection and worker profile', () => {
        expect(reviewedBeautyNotificationWorker(env)).toBe(true);
        expect(() => validateBeautyProductionRelease(env)).not.toThrow();
        expect(new URL(beautyDatabaseSelection(env)!).username).toBe('steamfoot_beauty_prod_20261025.qijlnhtpbintanzpxkvf');
    });
    it.each([{ VERCEL_ENV: 'preview' }, { VERCEL_GIT_COMMIT_REF: 'other' }, { VERCEL_GIT_REPO_OWNER: 'someone' }, { BEAUTY_DATABASE_MODE: 'legacy' }, { BEAUTY_NOTIFICATION_WORKER_MODE: undefined }, { BEAUTY_NOTIFICATION_WORKER_MODE: 'anything' }, { BEAUTY_NOTIFICATIONS_ACTIVATED_AT: undefined }, { BEAUTY_NOTIFICATIONS_ACTIVATED_AT: 'invalid' }, { BEAUTY_NOTIFICATIONS_ACTIVATED_AT: '2026-02-30T00:00:00.000Z' }, { PRODUCTION_MIGRATION_TARGET: 'unrelated' }, { BEAUTY_RELEASE_QA: '1' }, { DATABASE_URL: env.DATABASE_URL.replace('qijlnhtpbintanzpxkvf', 'otherproject') }])('rejects unreviewed activation %j', patch => expect(reviewedBeautyNotificationWorker({ ...env, ...patch })).toBe(false));
    it('keeps the off release usable without worker configuration', async () => {
        const factory = vi.fn();
        expect(await beautyNotificationWorkerPreflight({ ...env, BEAUTY_NOTIFICATIONS_ENABLED: '0', BEAUTY_NOTIFICATION_WORKER_MODE: undefined }, factory)).toEqual({ notifications: false });
        expect(factory).not.toHaveBeenCalled();
    });
    it('uses the existing main connection in one read-only transaction, without granting permissions', async () => {
        const execute = vi.fn(), query = vi.fn().mockResolvedValueOnce([{ role: 'postgres', database: 'postgres' }]).mockResolvedValueOnce([{ allowed: true }]).mockResolvedValue([]), disconnect = vi.fn();
        const factory = vi.fn(async () => ({ $connect: vi.fn(), $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ $executeRawUnsafe: execute, $queryRawUnsafe: query }), $disconnect: disconnect }));
        expect(await beautyNotificationWorkerPreflight(env, factory)).toMatchObject({ notifications: true, readonly: true, worker: 'shared-main-v1' });
        expect(factory).toHaveBeenCalledWith({ datasources: { db: { url: env.DATABASE_URL } }, log: [] });
        expect(execute).toHaveBeenCalledExactlyOnceWith('SET TRANSACTION READ ONLY');
        expect(query.mock.calls.every(([sql]) => /^SELECT /.test(sql))).toBe(true);
        expect(disconnect).toHaveBeenCalledOnce();
    });
    it.each(['identity', 'privileges', 'connection'])('fails closed on %s and never exposes credentials', async (problem) => {
        const query = vi.fn().mockResolvedValueOnce([{ role: problem === 'identity' ? 'other' : 'postgres', database: 'postgres' }]).mockResolvedValueOnce([{ allowed: problem !== 'privileges' }]), disconnect = vi.fn();
        const factory = vi.fn(async () => ({ $connect: problem === 'connection' ? vi.fn().mockRejectedValue(Error(env.DATABASE_URL)) : vi.fn(), $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ $executeRawUnsafe: vi.fn(), $queryRawUnsafe: query }), $disconnect: disconnect }));
        await expect(beautyNotificationWorkerPreflight(env, factory)).rejects.toThrow('preflight failed; no notification sent');
        expect(disconnect).toHaveBeenCalledOnce();
    });
    it('parses only canonical UTC activation boundaries', () => {
        expect(beautyNotificationActivationAt(env)).toEqual(new Date(env.BEAUTY_NOTIFICATIONS_ACTIVATED_AT));
        expect(beautyNotificationActivationAt({ NODE_ENV: "test" })).toBeNull();
        expect(beautyNotificationActivationAt({ NODE_ENV: 'test', BEAUTY_NOTIFICATIONS_ACTIVATED_AT: 'nonsense' })).toBeNull();
    });
});
