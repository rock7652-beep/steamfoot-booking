import "server-only";
import {
  assertSportsSharedCardPreviewEnvironment,
  isSportsSharedCardMockedUnitTest,
  isSportsSharedCardProductionRelease,
} from "../../scripts/sports-shared-card-preview-scope.mjs";

/** Validate before either constructing a client or reusing a global singleton. */
export function guardedSportsSharedCardPreviewClient<T>(cached: T | undefined, create: () => T): T {
  if (isSportsSharedCardMockedUnitTest(process.env) || isSportsSharedCardProductionRelease(process.env)) return cached ?? create();
  assertSportsSharedCardPreviewEnvironment(process.env);
  // A cached client may have been initialized before these branch overrides.
  // Preview never trusts globals from another environment. Only the positively
  // identified production main path above restores ordinary singleton reuse.
  return create();
}
