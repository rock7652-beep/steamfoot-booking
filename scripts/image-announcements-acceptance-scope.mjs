/** Dedicated, disposable local QA only. Never accepts deployed metadata or a remote database. */
export const IMAGE_ACCEPTANCE_DATABASE = "postgresql://postgres@127.0.0.1:55469/image_announcements_acceptance";
export const IMAGE_ACCEPTANCE_ORIGIN = "http://localhost:3169";
export function assertImageAnnouncementsAcceptance(env) {
  if (env.IMAGE_ANNOUNCEMENTS_ACCEPTANCE !== "1" || !(env.NODE_ENV === "development" || (env.NODE_ENV === "production" && env.IMAGE_ANNOUNCEMENTS_ACCEPTANCE_BUILD === "1")) ||
      ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"].some(key => Boolean(env[key])) ||
      env.NEXTAUTH_URL !== IMAGE_ACCEPTANCE_ORIGIN || env.AUTH_URL !== IMAGE_ACCEPTANCE_ORIGIN ||
      env.DATABASE_URL !== IMAGE_ACCEPTANCE_DATABASE || env.DIRECT_URL !== IMAGE_ACCEPTANCE_DATABASE) {
    throw new Error("Image announcement acceptance requires its exact disposable loopback database and local development origin, without deployment metadata.");
  }
}
