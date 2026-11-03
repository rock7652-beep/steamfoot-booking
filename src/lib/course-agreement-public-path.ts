/** Only capability routes bypass dashboard/store authentication. */
export function isCourseAgreementPublicPath(path: string) {
  return /^\/course-agreements\/(?:receipt\/)?[A-Za-z0-9_-]{43}\/?$/.test(path);
}
export const COURSE_AGREEMENT_PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};
