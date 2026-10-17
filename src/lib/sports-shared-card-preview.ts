import "server-only";
import { verifyIsolatedDevelopmentDatabase } from "../../scripts/isolated-dev-scope.mjs";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";

/** Validate before even reading a cached global, or constructing a client. */
export function guardedSportsSharedCardPreviewClient<T>(readCached: () => T | undefined, create: () => T): T {
  const releaseMode = assertReviewedReleaseEnvironment(process.env);
  if (releaseMode === "mocked-unit-test" || releaseMode === "production") return readCached() ?? create();
  if (releaseMode === "isolated-development") {
    // Do not reuse pre-scope clients. Check the real endpoint before the first
    // model/raw query; the immutable connection URL belongs to this client.
    const client = create() as T & { $extends: (extension: object) => T };
    let verified: Promise<void> | undefined;
    const guarded = client.$extends({ query: { async $allOperations({ args, query }: {
      args: unknown; query: (args: unknown) => Promise<unknown>;
    }) {
      await (verified ??= verifyIsolatedDevelopmentDatabase(client));
      return query(args);
    } } });
    // $extends returns a new client; retain the existing audit-context transaction
    // wrapper rather than silently replacing it with Prisma's raw transaction.
    return new Proxy(guarded as object, {
      get(target, key, receiver) {
        if (key === "$transaction") return async (...args: unknown[]) => {
          await (verified ??= verifyIsolatedDevelopmentDatabase(client));
          return Reflect.get(client as object, key).apply(client, args);
        };
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as T;
  }
  // Neither Preview may trust a client created before its isolated overrides.
  // Only positively identified production main restores ordinary cache reuse.
  return create();
}
