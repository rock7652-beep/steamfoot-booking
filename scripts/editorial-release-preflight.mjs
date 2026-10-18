import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseEditorialGuides } from "./editorial-content.mjs";
import { EDITORIAL_PREVIEW_BRANCH, EDITORIAL_REPOSITORY } from "./editorial-preview-scope.mjs";

const contentPath = "src/content/editorial-guides.json";
const bootstrapBase = "7ddfeed6b8b0611b1669df067c4580e5b9481323";
const bootstrapFiles = new Set([
  contentPath, "src/lib/public-guides.ts", "src/app/pricing/guides/[slug]/page.tsx",
  "scripts/editorial-content.mjs", "scripts/editorial-content.d.mts",
  "scripts/editorial-preview-scope.mjs", "scripts/editorial-preview-scope.d.mts",
  "scripts/editorial-release-preflight.mjs", "scripts/guide-ui-preview-scope.mjs",
  "src/__tests__/public-guides.test.ts", "src/__tests__/guide-ui-preview-isolation.test.ts",
  "src/__tests__/editorial-release.test.ts", ".github/workflows/editorial-review.yml",
  "docs/editorial-release.md", "vercel.json",
]);
const sha = /^[0-9a-f]{40}$/;
function reject(reason) { throw new Error(`Editorial preflight rejected: ${reason}`); }

export function validateEditorialChange({ base, head, repository, branch, slug, files, before, after, bootstrap = false }) {
  if (repository !== EDITORIAL_REPOSITORY || branch !== EDITORIAL_PREVIEW_BRANCH || !sha.test(base) || !sha.test(head) || base === head)
    reject("exact repository, branch and distinct commit pair required");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? "")) reject("one reviewed article slug required");
  if (bootstrap && base !== bootstrapBase) reject("bootstrap is restricted to the original reviewed base");
  if (!files.length || !files.includes(contentPath) || files.some(path => bootstrap ? !bootstrapFiles.has(path) : path !== contentPath))
    reject("changes outside the article data scope");
  parseEditorialGuides(before); parseEditorialGuides(after);
  if (JSON.stringify(before.filter(item => item.id !== slug)) !== JSON.stringify(after.filter(item => item.id !== slug)))
    reject("unrelated article changed or removed");
  const article = after.find(item => item.id === slug);
  if (!article || JSON.stringify(before.find(item => item.id === slug)) === JSON.stringify(article)) reject("reviewed article is missing or unchanged");
  return { repository, branch, base, head, slug, mode: bootstrap ? "one-time-bootstrap-review" : "article-only", files,
    articleSha256: createHash("sha256").update(JSON.stringify(article)).digest("hex") };
}

export function verifyEditorialGit({ base, head, repository, branch, slug, bootstrap = false }, cwd = process.cwd()) {
  if (!sha.test(base ?? "") || !sha.test(head ?? "")) reject("full commit SHAs required");
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }).trim();
  if (git("rev-parse", "HEAD") !== head || git("status", "--porcelain", "--untracked-files=no")) reject("head checkout must be exact and clean");
  git("merge-base", "--is-ancestor", base, head);
  const files = git("diff", "--name-only", "--no-renames", base, head).split("\n").filter(Boolean);
  for (const path of files) if (!git("ls-tree", head, "--", path).startsWith("100644 blob ")) reject("deletions, symlinks and executable files are not content");
  const read = ref => JSON.parse(git("show", `${ref}:${contentPath}`));
  const before = bootstrap ? [] : read(base);
  const after = read(head);
  const result = validateEditorialChange({ base, head, repository, branch, slug, files, before, after, bootstrap });
  // Legacy content remains outside the JSON lane; reject collisions without
  // executing any code from the proposed commit.
  const legacy = git("show", `${base}:src/lib/public-guides.ts`);
  const legacyIds = new Set([...legacy.matchAll(/"id":\s*"([a-z0-9-]+)"/g)].map(match => match[1]));
  if (after.some(article => legacyIds.has(article.id))) reject("article ID collides with legacy content");
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let i = 2; i < process.argv.length; i++) {
      const key = process.argv[i];
      if (key === "--bootstrap") options.bootstrap = true;
      else if (["--base", "--head", "--repository", "--branch", "--slug"].includes(key) && process.argv[i + 1]) options[key.slice(2)] = process.argv[++i];
      else reject("unknown argument");
    }
    console.log(JSON.stringify(verifyEditorialGit(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Editorial preflight failed");
    process.exitCode = 1;
  }
}
