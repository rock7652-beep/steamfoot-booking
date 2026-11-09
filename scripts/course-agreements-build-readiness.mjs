/** Configuration only. No connections, DDL, secret output or outbound calls. */
export function assertCourseAgreementsBuildConfiguration(env) {
  if (env.COURSE_AGREEMENTS_PUBLIC_ENABLED === '1' && env.COURSE_AGREEMENTS_ENABLED !== '1') {
    throw new Error('Course agreement public access requires the backend feature.');
  }
  if (env.BEAUTY_AGREEMENTS_PUBLIC_ENABLED === '1' && (env.BEAUTY_AGREEMENTS_ENABLED !== '1' || env.BEAUTY_MODULE_ENABLED !== '1')) throw new Error('Beauty agreement public access requires the beauty module and backend feature.');
  if (env.COURSE_AGREEMENTS_ENABLED !== '1' && env.BEAUTY_AGREEMENTS_ENABLED !== '1') return;
  if (!env.COURSE_AGREEMENT_LINK_SECRET || Buffer.byteLength(env.COURSE_AGREEMENT_LINK_SECRET, 'utf8') < 32) {
    throw new Error('Course agreement signing configuration is incomplete; no migration was run.');
  }
}
