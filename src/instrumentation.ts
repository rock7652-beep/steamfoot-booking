/** Module startup checks; retired SPA clients are never loaded. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL_GIT_COMMIT_REF === "feat/store-member-link-workorder-line-20261012") {
    const { verifyStoreMemberWorkorderSchema } = await import("../scripts/store-member-workorder-review-gate.mjs");
    await verifyStoreMemberWorkorderSchema(process.env);
  }
}
