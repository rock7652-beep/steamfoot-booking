/** Opt-in local development only; no deployment metadata or remote DB allowed. */
export function assertSportsLiveFlowQaEnvironment(env) {
  if (env.SPORTS_LIVE_FLOW_QA !== "1" || env.NODE_ENV !== "development" ||
      ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"].some(key => Boolean(env[key])) ||
      !["http://127.0.0.1:3107", "http://localhost:3107"].includes(env.NEXTAUTH_URL ?? "") || env.AUTH_URL !== env.NEXTAUTH_URL) {
    throw new Error("Sports live-flow QA requires explicit local development without deployment metadata.");
  }
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    try {
      const url = new URL(env[key] ?? "");
      if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55438" ||
          url.pathname !== "/sports_live_flow_test" || url.username !== "postgres" || url.password || url.search || url.hash ||
          /[\s\\\u0000-\u001f\u007f]/.test(env[key] ?? "")) throw new Error();
    } catch {
      throw new Error("Sports live-flow QA requires its dedicated loopback database for both connections.");
    }
  }
}
