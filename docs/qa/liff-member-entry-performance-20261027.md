# LIFF entry timing and parallel home reads

## Evidence and scope

Read-only production probes before this change are saved in `/workspace/reports/member-login-performance-20261027/public-timings.json`. First sampled public-entry TTFB was zhubei 3.609s, ido-banqiao 3.490s and silverlily 2.466s; second samples were 1.339–1.909s. These include network/connection time from the cloud probe, not isolated server CPU, actual phone login time or proven cold-start samples. The zhubei announcement list was 0.445–0.472s; image downloads were not measured in this batch.

Installed Next.js guidance (`07-mutating-data.md` and `backend-for-frontend.md`) confirms client Server Actions are queued. Previously native home dispatched two access readers, then up to four summary readers from client Promise.all, creating queued round trips. Course entry additionally redirects to its authenticated portal; its full data loader remains in use.

## Implementation

- Two staged read actions replace up to six browser-dispatched actions: access first, then lazy summary. Each action starts the existing authorized readers concurrently inside its server request. No caller-supplied customer/store identity or global private-result cache. Health still uses its original server feature/membership gate; the requested boolean only skips unnecessary health reading.
- Layout and LIFF entry share React.cache request-local public context keyed by store slug, removing repeated module/feature work for the same render. Missing stores, unsupported modules and feature gates retain closed behavior. No cross-request permission TTL is introduced.
- Fixed-label OperationTiming records public entry context, exchange verification/config/membership/session mint, both home read batches and course portal account/metadata/cards/history/member reads. Exchange additionally emits numeric Server-Timing headers. Both LINE token-verification boundaries and session creation stay intact.
- Browser Performance entries record SDK init, exchange, access and summary phases without values, member/store IDs, token strings or extra telemetry requests. Unsupported timing APIs cannot block authentication. These local entries are not central real-user monitoring.
- Private summaries remain after session verification; announcements remain independent of the summary. Existing store-change cancellation, work routing, onboarding and read-only previews remain in place. No visual layout change.

## Validation and remaining measurement

15 targeted files / 179 tests pass: deferred-reader concurrency, no cache reuse across calls, denied/failure outcomes, optional health, authentication-before-reads, announcements while summary pending, unsupported timing API, numeric/private-data-free Server-Timing, original exchange/membership/wallet/booking/profile and music entitlement behavior. Changed-file ESLint and TypeScript are checked separately; full CI is recorded at release.

This is not proof of a specific number of seconds saved on a phone. After release, compare the same public probes and inspect the new fixed-label timings on actual LINE visits. SDK/device/network time and authenticated home data need that visit's evidence. Existing full course portal queries/navigation are instrumented, not rewritten or represented as optimized by this batch.

No schema/migration, credential update, membership/permission relinking, notification send or test transaction. Channel secret recovery remains separately pending the Channel ID; secret values must not be supplied in chat. Automatic branch deployment is disabled.
