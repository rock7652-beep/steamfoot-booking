# Shared frontend account menu and independent LIFF announcements

## Evidence and scope

The user supplied a native LIFF profile screenshot with no logout control and these entry URLs:

- `https://liff.line.me/2010761154-duGBs1Ng/profile`
- `https://liff.line.me/2010761154-duGBs1Ng`

The native `ProfileView` rendered profile fields without a logout form. This is a separate entry from the course member portal, which already contains a logout control.

`WelcomeBack` mounted its announcement reader only after its private member summary resolved. That summary waits on wallets, bookings, optional health and referral reads. The public list and image then begin sequentially; both responses use `Cache-Control: no-store`. Every announcement image also repeats store/module/publication checks, which remain intact in this change.

Read-only direct HTTP measurements (not real-phone end-to-end timing):

- Supplied entry's built-in store mapping (`zhubei`): public list about 0.47s; first image about 0.87s / 307,230 bytes; four active announcements.
- Silverlily, three samples: list 0.44–0.86s; first image 0.57–1.12s / 261,785 bytes.
- The screenshot's displayed store was Warmwarm; its public `taichung` list returned no active announcements in three samples (0.67–0.89s). These store/entry observations must not be conflated or used to relink memberships.

Raw measurements are in `/workspace/reports/liff-logout-announcement-20261027/`. No precise phone login duration or saved-time figure was established.

## Change

- Use one shared `FrontendAccountMenu` in the top-right of native LIFF, course/music/fitness member and work portals, Beauty member and technician portals, and the general web member shell. Logout is the final menu item. Remove regular bottom/sidebar logout duplicates, retaining error-recovery escape controls. Existing income/refresh actions remain available. The read-only frontend preview uses the same menu with logout disabled, including native LIFF preview home and deep pages. This clears the application session through the existing `logoutAction`; it does not sign out of the LINE app or unlink the member.
- Keep one stable announcement reader outside the private-summary content. It starts while the summary is pending and remains usable if that summary fails. Current-store, preview authorization, publication timing, image order, horizontal carousel and no-store behavior stay unchanged.

## Acceptance limits

Thirteen targeted test files pass (113 tests). Targeted regression covers the shared menu, member/work role routing, Beauty data boundaries, native profile/session refresh, logout destinations, public announcement boundaries and independence from pending/error summaries. Interactive DOM tests verify menu order, current-store form scope, Escape/focus return, outside dismissal, preview blocking, and preservation of draft state when an existing leave guard cancels logout. TypeScript, changed-file ESLint and diff checks pass. React review retains a stable announcement reader and reuses the pending-aware logout control. No form is nested inside another form.

No database/schema, account linkage, publication data, role permissions or notification changes. This is not a claim that image API latency or bytes were reduced. The change removes the prerequisite wait before those requests start.

Affected UI: native LIFF home and deep pages, music/fitness/course member and teacher/coach pages, Beauty member/technician pages, and general web member desktop/mobile shell. Mobile uses a compact three-dot trigger; available account names are shown in full in the expanded panel. Native deep headers use a generic account label rather than expose a name from a potentially stale application session before LINE identity verification. Trigger targets are at least 44px, logout at least 48px, and the panel is bounded to the viewport. Existing draft/pending guards remain active; preview logout is disabled. 360px/390px phone, desktop/iPad visual layout, actual logout/cookie behavior, post-change cold/warm login timing and carousel swipes remain unverified without a connected browser/real device. DOM/source tests do not substitute for that acceptance.

Automatic branch deployment is disabled. No production release has been performed for this PR.
