import { Prisma } from "@prisma/client";
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

// Check during an active request, never during Vercel module instrumentation.
// The same full catalog check still precedes every first database operation.
let schemaReady: Promise<void> | undefined;
export async function ensureMusicOpeningRuntimeSchema() {
  if (process.env.NODE_ENV === "test" && process.env.VERCEL !== "1") return;
  if (process.env.VERCEL_GIT_COMMIT_REF !== MUSIC_OPENING_BRANCH) return;
  assertMusicOpeningPreviewEnvironment(process.env);
  return schemaReady ??= import("../../scripts/music-opening-schema-check.mjs")
    .then(({ runMusicOpeningSchemaPreflight }) => runMusicOpeningSchemaPreflight())
    .catch(error => { schemaReady = undefined; throw error; });
}
/** Covers model and raw queries; no business query can run before readiness. */
export function withMusicOpeningRuntimeSchema<T extends object>(client: T): T {
  if (process.env.NODE_ENV === "test" && process.env.VERCEL !== "1") return client;
  if (process.env.VERCEL_GIT_COMMIT_REF !== MUSIC_OPENING_BRANCH) return client;
  return (client as unknown as { $extends(extension: object): T }).$extends({
    name: "music-preview-schema-readiness",
    query: {
      async $allOperations({ model, args, query }: { model?: string; args: unknown; query: (args: unknown) => unknown }) {
        await ensureMusicOpeningRuntimeSchema();
        // Prisma query extensions clone Sql instances from another generated
        // runtime as plain objects. Restore the tag without interpolating values.
        const raw = args as { strings?: unknown; values?: unknown } | null;
        if (!model && raw && !Array.isArray(args) && Array.isArray(raw.strings) &&
            raw.strings.every(part => typeof part === "string") && Array.isArray(raw.values) &&
            raw.strings.length === raw.values.length + 1)
          return query(Prisma.sql(raw.strings as unknown as TemplateStringsArray, ...raw.values));
        return query(args);
      },
    },
  });
}
