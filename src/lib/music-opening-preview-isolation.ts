import { assertMusicOpeningPreviewEnvironment, MUSIC_OPENING_BRANCH } from "../../scripts/music-opening-preview-scope.mjs";

/** Compose this feature's exact Preview gate with the existing shared client guard. */
export function assertMusicOpeningRuntimeIsolation() {
  // The repository's mocked unit suite does not start a deployed server.
  if (process.env.NODE_ENV === "test" && process.env.VERCEL !== "1") return;
  // Other deployment scopes are validated by the existing shared client guard.
  // A music claim in any provider must still satisfy the exact music tuple.
  if ([process.env.VERCEL_GIT_COMMIT_REF, process.env.WORKERS_CI_BRANCH, process.env.CF_PAGES_BRANCH].includes(MUSIC_OPENING_BRANCH)) {
    assertMusicOpeningPreviewEnvironment(process.env);
  }
}
