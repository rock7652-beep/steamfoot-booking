import { assertMusicOpeningPreviewEnvironment } from "../../scripts/music-opening-preview-scope.mjs";

/** This unmerged feature must never connect to another deployment target. */
export function assertMusicOpeningRuntimeIsolation() {
  // The repository's mocked unit suite does not start a deployed server.
  if (process.env.NODE_ENV === "test" && process.env.VERCEL !== "1") return;
  assertMusicOpeningPreviewEnvironment(process.env);
}
