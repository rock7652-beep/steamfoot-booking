import { expect, it } from 'vitest';
import { assertCourseAgreementsBuildConfiguration } from '../../../scripts/course-agreements-build-readiness.mjs';
it('keeps the optional feature off without requiring a secret', () => {
  expect(() => assertCourseAgreementsBuildConfiguration({})).not.toThrow();
});
it('rejects public signing without the backend feature', () => {
  expect(() => assertCourseAgreementsBuildConfiguration({ COURSE_AGREEMENTS_PUBLIC_ENABLED:'1' })).toThrow();
});
it('rejects a missing, short or incorrectly named signing key', () => {
  for (const config of [{}, {COURSE_AGREEMENT_LINK_SECRET:'short'}, {COURSE_AGREEMENTS_LINK_SECRET:'x'.repeat(48)}]) {
    expect(() => assertCourseAgreementsBuildConfiguration({COURSE_AGREEMENTS_ENABLED:'1',...config})).toThrow();
  }
});
it('accepts the server signing service key with sufficient entropy length', () => {
  expect(() => assertCourseAgreementsBuildConfiguration({COURSE_AGREEMENTS_ENABLED:'1',COURSE_AGREEMENTS_PUBLIC_ENABLED:'1',COURSE_AGREEMENT_LINK_SECRET:'x'.repeat(48)})).not.toThrow();
});
