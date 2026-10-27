# Course member store switching

## Problem and flow

The customer layout resolves central memberships but returns early for course portals, omitting the general member header. The native LIFF shell redirects music/fitness members to that independent course portal before mounting its native store switcher. Consequently users can enter a course store from another module but have no switch-back control. The supplied course screenshot is Silverlily (music/dance); fitness shares this exact portal.

Reuse the already verified layout membership list through a request-rendered client provider keyed by user/current store. Course member and work headers render the existing CentralMemberStoreSwitcher in place of their static store subtitle when another verified membership exists. There is no additional membership request, operational lookup, registration, identity linking or entitlement change. Single/no-membership and read-only previews retain the static name.

The existing leave guard and pending state prevent leaving an in-progress operation. The shared switcher also blocks current-store and scripted disabled submissions. Selection still revalidates memberships in selectCentralMemberStoreAction and only changes the existing store selection cookie.

LINE-origin course entry adds an explicit memberEntry=liff routing hint. Course header forms forward it so selecting steamfoot/Beauty returns to the selected store's native LIFF shell, retaining its switch-back control. Browser entry retains /book. The action accepts only the exact liff enum and a server-verified store slug, never a client-provided URL. This hint grants no identity or permissions. Normal in-portal tabs/month navigation retains query state; unrelated deep-link return paths are not comprehensively changed or verified by this fix.

## Evidence and limits

- 13 selected files / 157 tests pass: real DOM course header with fitness/music member/work pages; exact selected slug and LINE entry submission; no switcher in read-only preview; disabled/leave-guard refusal; server action rejects unclaimed membership and non-customer sessions; fixed browser/LIFF destinations; existing LIFF membership isolation and resolution contracts.
- TypeScript and changed-file ESLint pass. No database write/migration, notification send or production release.
- Interactive static fixture: /workspace/reports/course-store-switch-preview-20261027/public/index.html. Uses the actual switcher, brand and account components with fake stores, a local event-only action and disabled logout. No account or operational data. Supports 360/390/768/1024px frame widths; this is a component preview, not actual LINE navigation or RWD acceptance.
- Menu uses at least 44px trigger / 48px rows, viewport-bounded width and 60dvh scrolling; full long names in the expanded list. Existing rightmost account/logout menu remains separate.
- Actual Safari/Chrome/LINE cross-module switching, phone long-name layout, iPad/desktop visual placement, full cookie transition and real store data isolation are pending connected-browser/device evidence. DOM and mocked server-action tests do not establish those results.
- Automatic deployment is disabled for this branch. Review/approval is required before merging to production under AGENTS.md and the UI framework.
