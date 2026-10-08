# HQ intake list and public profile visibility

## Scope

- `/hq/dashboard/trial-applications`: compact six-field rows for both consultation and formal-setup stages. Store, contact, need, status, suggested next step, and original submission time remain visible while details and edits are collapsed.
- Keyword filtering is debounced 250 ms and IME-aware. Stage/status changes apply immediately, and reset pagination/detail selection. Filtering remains in the server Prisma query and count, before pagination; the client never filters only the loaded page.
- URL navigation, Back/Forward, empty-state resets, rapid consecutive changes, delayed server responses, and unmount cancellation preserve the intended filter draft.
- Consultation and formal-progress drafts use the existing account-scoped retained form state. A live-filter navigation announces retained unsaved edits. Stage boundaries, authorization, manual association, and server mutation rules are unchanged.
- `/apply`: the existing optional website/Facebook/Instagram fields are now always visible. Existing validation, HQ persistence, original payload, and Sheet mapping are retained.

## Deliberate boundaries

No schema change, production write, historical import, notification, automatic trial creation, or automatic identity matching is included. Historical Sheet data remains in its original source until a separately reviewed import plan is applied. The historical-source notice stays truthful and compact.

Test records with explicit operational no-contact markers are labeled and do not expose contact shortcuts. They are not deleted or relabeled as real inquiries. "Next step" is guidance from current status, not fabricated contact history.

## Verification

- Automated tests cover all-data query/count consistency, page boundaries, collapsed-row fields, original Taipei time display, permission/preview gates, contact validation, no-contact handling, stages, manual relationships, retained drafts and live-filter navigation races.
- Public-form tests exercise actual payload construction with mocked transport, then verify existing HQ dedicated fields/originalPayload and Sheet mapping. No real form submission is used.
- The synthetic density fixture renders the real components with 20 rows and a 43-row count, including long content and an empty state. It contains no real contacts.
- Required visual matrix: 1366 and wide desktop; 1024×768 and 768×1024 iPad; 360/390 narrow widths; both sidebar sizes; collapsed/expanded/empty states; no document-level horizontal overflow; reachable controls. The local fixture alone does not establish real-device or logged-in business-flow acceptance.
- The full local Vitest run completed 8,102 passing tests and 129 skips, but four PGlite/SQL workers exited unexpectedly; this is not a full-suite pass. A sequential retry passed two of those files (12 tests), while two SQL workers still failed. The targeted UI/service suite is separate from those environment-blocked SQL checks.
- Local full TypeScript attempts were terminated by memory limits. A smaller-heap attempt also exhausted memory. Exact-head CI is required before readiness.
- The cloud browser could not connect to this task's local server. Native desktop input was blocked by an unavailable AT-SPI provider. New layout screenshots and deployment Preview acceptance remain pending; no visual pass is claimed.

Publication and merging require the user's authorization. A local test pass does not authorize deployment or production import.
