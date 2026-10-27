# Native LIFF profile logout and announcement start

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

- Add the existing store-scoped `logoutAction` form and shared pending-aware `LogoutButton` to the native LIFF profile's ready state. This clears the application session through the established action; it does not sign the user out of the LINE app or unlink the member.
- Keep one stable announcement reader outside the private-summary content. It starts while the summary is pending and remains usable if that summary fails. Current-store, preview authorization, publication timing, image order, horizontal carousel and no-store behavior stay unchanged.

## Acceptance limits

Seven targeted test files pass (67 tests), including announcement reader availability while private summaries are pending or failed, no duplicated reader when summaries are ready, profile/session-refresh behavior, store-specific logout destinations and existing announcement API boundaries. Changed-file ESLint and diff checks pass. React review kept the announcement reader as one stable mount, reused the pending-aware logout control, and retained store/preview boundaries.

No database/schema, account linkage, publication data, role permissions or notification changes. This is not a claim that image API latency or bytes were reduced. The change removes the prerequisite wait before those requests start.

Affected UI: native LIFF profile and native LIFF member home. Logout uses a 48px minimum touch target and the existing page spacing. 360px/390px phone, actual logout/cookie behavior, post-change cold/warm login timing and carousel swipes still require connected-browser/real-device acceptance. Unit/component tests do not substitute for that acceptance.

Automatic branch deployment is disabled. No production release has been performed for this PR.
