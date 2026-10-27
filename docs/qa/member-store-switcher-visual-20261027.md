# Member store switcher: use native LIFF presentation

The supplied course screenshot has a store control beneath the large logo, a switch badge and bordered menu buttons. The desired reference is the second/native LIFF screenshot: small logo on the left, store/caption on the right, a chevron trigger, plain menu rows and a pale green current-store row.

Cause: course and native entries rendered separate switchers, and broad course button/paragraph rules overrode Tailwind presentation. Prior component interaction tests and a static fixture did not establish actual device CSS acceptance.

## Implementation

- Share MemberStoreSwitcher presentation across the central/web and native LIFF adapters. Adapters retain separate server actions, server-verified membership lists and LINE return mode. No backend/session/membership, redirect or account-rule changes.
- Share MemberPortalHeader for the native LIFF and music/fitness course portal. Small 80px logo, right-side identity/chevron, account menu on the right; keep work/member role buttons and existing leave/pending guards. Member caption is consistently 會員中心. Read-only course previews retain a static store name.
- Scope shared control styles with CSS Modules and enough specificity to beat legacy course button/paragraph rules, including disabled opacity and aria-current backgrounds. Current store remains readable, borderless and green. Expandable lists are viewport bounded and scrollable; central web mobile keeps centered popover anchoring for its existing hamburger/header arrangement.
- Outside pointer and Escape dismiss the shared menu; Escape returns focus to its trigger. Preserve current-store and pending submission refusal.

## Verification and limitations

- 13 selected files / 151 tests pass, including identical trigger/menu/current-row classes between course/native adapters, 20 stores with long names, separate server actions and correct hidden fields, Escape/focus/outside interactions, member/work portal behavior, leave/pending guards, existing membership authorization and announcement startup.
- TypeScript, changed-file ESLint and diff checks pass. Full remote CI is recorded separately when available.
- Actual-component preview fixture: /workspace/reports/member-switcher-visual-preview-20261027/public/index.html. Switch between course and native entries, and 360/390/768/1024px frame widths. Uses fake data, local event-only selection and disabled logout; no database access or member API calls. A public logo asset is used.
- No connected browser/device is available. Actual CSS computed appearance, phone/iPad layout, touch/scroll and LINE navigation remain unverified; DOM interaction/class parity and component fixture are not real-device visual acceptance.
- No production merge/release, schema changes, account/financial writes or notifications. Automatic branch deployment disabled pending review.
