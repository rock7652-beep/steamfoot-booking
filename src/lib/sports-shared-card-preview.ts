import "server-only";
import {
  assertSportsSharedCardPreviewEnvironment,
  isSportsSharedCardMockedUnitTest,
} from "../../scripts/sports-shared-card-preview-scope.mjs";

/** Validate before either constructing a client or reusing a global singleton. */
export function guardedSportsSharedCardPreviewClient<T>(cached: T | undefined, create: () => T): T {
  if (isSportsSharedCardMockedUnitTest(process.env)) return cached ?? create();
  assertSportsSharedCardPreviewEnvironment(process.env);
  // A cached client may have been initialized before these branch overrides.
  // This temporary Preview-only checkout never trusts globals from another
  // environment. A production release must explicitly convert this guard.
  return create();
}
