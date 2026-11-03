/** Module startup checks; retired SPA clients are never loaded. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL_GIT_COMMIT_REF === "feat/store-member-link-workorder-line-20261012") {
    const { verifyStoreMemberWorkorderSchema } = await import("../scripts/store-member-workorder-review-gate.mjs");
    await verifyStoreMemberWorkorderSchema(process.env);
    return;
  }
  if (process.env.VERCEL_GIT_COMMIT_REF === "feat/music-opening-state-20261007" && (process.env.NODE_ENV !== "test" || process.env.VERCEL === "1")) {
    const { assertMusicOpeningPreviewEnvironment } = await import("../scripts/music-opening-preview-scope.mjs");
    assertMusicOpeningPreviewEnvironment(process.env);
  }

}
