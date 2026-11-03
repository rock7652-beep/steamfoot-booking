import { describe, expect, it, vi } from 'vitest';
import { isPreviewExternalIntegrationBlocked } from '../runtime-env';
import { assertCourseAgreementsPreviewEnvironment, COURSE_AGREEMENTS_PREVIEW_BRANCH, COURSE_AGREEMENTS_DISABLED_LINE_TOKEN } from '../../../scripts/course-agreements-preview-scope.mjs';
import { assertReviewedReleaseEnvironment } from '../../../scripts/consultation-preview-scope.mjs';

const isolated = 'postgresql://postgres.ttworfzgwejdeolegkxl:fixture@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';
const valid = { COURSE_AGREEMENTS_REVIEW: '1', VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: COURSE_AGREEMENTS_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: 'rock7652-beep', VERCEL_GIT_REPO_SLUG: 'steamfoot-booking', DATABASE_URL: isolated, DIRECT_URL: isolated };
describe('course agreement integration deployment boundary', () => {
  it('keeps outbound integrations blocked with an explicit disabled credential', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN', COURSE_AGREEMENTS_DISABLED_LINE_TOKEN);
    try { expect(isPreviewExternalIntegrationBlocked()).toBe(true); }
    finally { vi.unstubAllEnvs(); }
  });
  it('permits only the isolated opt-in rehearsal and dispatches its migration-free mode', () => {
    expect(assertCourseAgreementsPreviewEnvironment(valid)).toBe(true);
    expect(assertReviewedReleaseEnvironment(valid)).toBe('course-agreements-preview');
    expect(assertCourseAgreementsPreviewEnvironment({})).toBe(false);
    expect(assertCourseAgreementsPreviewEnvironment({ ...valid, LINE_CHANNEL_ACCESS_TOKEN: COURSE_AGREEMENTS_DISABLED_LINE_TOKEN })).toBe(true);
  });
  for (const change of [
    { VERCEL_ENV: 'production' }, { COURSE_AGREEMENTS_REVIEW: '' }, { VERCEL: '' },
    { VERCEL_GIT_COMMIT_REF: 'main' }, { VERCEL_GIT_REPO_OWNER: 'other' },
    { WORKERS_CI_BRANCH: COURSE_AGREEMENTS_PREVIEW_BRANCH }, { CF_PAGES_BRANCH: 'main' },
    { DATABASE_URL: isolated.replace('ttworfzgwejdeolegkxl', 'qijlnhtpbintanzpxkvf') },
    { DIRECT_URL: isolated.replace('ttworfzgwejdeolegkxl', 'qijlnhtpbintanzpxkvf') },
    { LINE_CHANNEL_ACCESS_TOKEN: 'fixture' }, { WEB_LINE_LOGIN_CHANNEL_SECRET: 'fixture' }, { PREVIEW_LINE_ACCEPTANCE_ENABLED: '1' },
  ]) it(`rejects unsafe provenance or connection: ${Object.keys(change)[0]}`, () => {
    expect(() => assertCourseAgreementsPreviewEnvironment({ ...valid, ...change })).toThrow();
  });
});
