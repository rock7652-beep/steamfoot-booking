import "server-only";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";

/** Validate before even reading a cached global, or constructing a client. */
export function guardedSportsSharedCardPreviewClient<T>(readCached: () => T | undefined, create: () => T): T {
  const releaseMode = assertReviewedReleaseEnvironment(process.env);
  if (releaseMode === "mocked-unit-test" || releaseMode === "production") return readCached() ?? create();
  // No Preview may trust a client created before its isolated overrides.
  // Only positively identified production main restores ordinary cache reuse.
  return create();
}
