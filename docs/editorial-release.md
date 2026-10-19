# Fixed editorial release lane

This lane is for one explicitly approved public article at a time. It does not approve future copy, enable automatic publication, change main auto-deployment, or bypass website/network/deployment protection.

## Fixed boundaries

- Repository: `rock7652-beep/steamfoot-booking`; review branch: `content/editorial-preview` only. No `content/*` wildcard.
- After this initial setup, ordinary article PRs change only `src/content/editorial-guides.json`. JSON is validated as article data, not executable TypeScript. Links must remain within the approved public Steamfoot destinations. Legacy article data and application/security code cannot change in this lane.
- The preflight requires an ancestor base and exact clean head checkout, one requested slug, regular non-executable files, no deletion/symlink, no other article changes, and no collision with legacy IDs. CI runs the policy scripts from the PR base, not candidate scripts. A missing base policy is allowed only for the explicitly reviewed initial base `7ddfeed6b8b0611b1669df067c4580e5b9481323`, with a fixed setup file list and separate review of that setup. CI never creates deployment approval or writes credentials/settings.
- Existing approved-manuscript locks remain in tests. Editing an already locked article may require a separately reviewed test change; do not weaken the content-only check to force it through.
- The fixed branch remains `deploymentEnabled:false`; main remains false. Use an explicit deployment for a reviewed SHA only.
- Preview requires full Vercel repository/branch provenance and `VERCEL_GIT_COMMIT_SHA` equal to the full `EDITORIAL_PREVIEW_APPROVED_COMMIT`. `EDITORIAL_PREVIEW_BASE_COMMIT` must be a distinct full SHA. These are non-secret, branch-scoped Preview approval pins, set only after the corresponding preflight, CI and manuscript approval. They must never be project-wide or Production variables. A new commit does not inherit approval: an old pin fails closed.
- Once matched, the existing guide UI mode disables all three DB clients before construction/cache reuse, skips migrations, rejects non-GET/HEAD and API/auth/private routes, blocks outbound notifications, and serves noindex/empty sitemap. Do not add credentials or broaden allowed routes to obtain a Preview.

## Per-article sequence

1. Read current main and open PRs; continue the one open editorial PR if present. Start the fixed branch at current main without reverting others; coordinate branch reuse with its current writer. Never force-push someone else's work.
2. Preserve approved copy and record the requested slug/date. Use one JSON record; do not put SEO worksheets or editorial notes in the body. Check current production trial conditions using an already authorized read-only route; a blocked network route remains a separate release gate.
3. Run focused tests, TypeScript and changed-file lint. Push one draft PR. Require the exact head CI and `Editorial scope review` to pass; review bootstrap source separately on the first PR. For local verification:

   `node scripts/editorial-release-preflight.mjs --base <full-main-sha> --head <full-head-sha> --repository rock7652-beep/steamfoot-booking --branch content/editorial-preview --slug <approved-slug>`

   Only the first, explicitly approved setup uses `--bootstrap` and the fixed original base. Keep the emitted base/head/slug/content digest with the release evidence.
4. After manuscript approval and exact-head checks, update only the fixed branch's two non-secret Preview pins to the verified pair. Use existing Vercel permissions to request a Preview from that exact commit. Do not alter project build commands, main policy, credentials, or protection. Confirm the deployment's repository, branch, SHA, target, READY state and isolation logs.
5. Inspect the protected Preview through an already authorized path: 360/390px and desktop, full body, CTA hrefs, mobile navigation, article index/return anchor and noindex. Static SSR fixtures are useful but do not replace hosted Preview acceptance. Do not create bypass links or grant access to overcome a refusal.
6. Recheck main/PR head and required checks. If main moved, integrate the new base and repeat the preflight/approval pins/affected verification. Merge only the reviewed head with expected-head protection. User publication authorization must cover this article; it never extends to unreviewed future content.
7. Keep main auto-deployment disabled. Deploy the reviewed merged main SHA explicitly using the existing project/team and Production target. Do not set a migration target for an article release. Check that this main SHA contains no unrelated unapproved release work. Do not promote the isolated no-DB preview to Production.
8. Read the real production URL, canonical, copy, CTA destination, list and sitemap. READY/CI alone are not production-content verification. Record PR, head, merge commit, deployment and observed production URL, or the exact remaining blocker.

## Bootstrap scope (this PR)

The setup additionally changes the article template to support approved inline CTA links and data-selected public feature links, imports the JSON collection into the existing registry, adds the content validator/preflight/CI and exact Preview predicate, adds only the fixed branch auto-deploy exclusion, tests these boundaries, and documents the lane. No member, booking, payment, customer records, schema, migration, global guard or main auto-deploy behavior changes.
