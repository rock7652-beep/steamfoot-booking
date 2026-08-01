# LINE identity namespaces

## Meaning

| Storage | Meaning | Write policy |
| --- | --- | --- |
| `Account.provider = "line"` | Auth.js OAuth provider record | Auth.js only; never a Messaging recipient source |
| `CustomerIdentityLink.provider = "line_login"` | Verified LINE Login identity for one store Customer | PR 2 |
| `CustomerIdentityLink.provider = "line_messaging"` | Verified store Messaging API recipient identity | PR 3 |
| `CustomerIdentityLink.provider = "line"` | Legacy, unclassified historical record | Read only; no new writes |
| `Customer.lineUserId` | Legacy transitional Messaging recipient field | Read by current notification flows until PR 3 |

`line_login` and `line_messaging` are separate namespaces. Code must never
fallback between them, infer one from the other, or write one into the other's
storage. The existing database unique constraints already allow both rows for
one Customer because `provider` is part of every identity-link uniqueness key.

## PR 1 boundary

PR 1 adds `createVerifiedCustomerIdentityLink` and typed readers. The new
writer permits only `phone`, `google`, `line_login`, and `line_messaging`;
`line` returns `LEGACY_PROVIDER_READ_ONLY`. It does not update `Customer` or
`Account`, so it cannot write `Customer.lineUserId` or `Account(provider="line")`.

The pre-existing `upsertCustomerIdentityLink` remains transitional in this PR
to avoid changing current runtime behavior. No new code may call it. Existing
`provider: "line"` writers are deliberately not reclassified here.

## Transitional inventory

Current `upsertCustomerIdentityLink({ provider: "line" })` writers are:

- `src/lib/auth.ts` (four Auth.js/OAuth activation branches)
- `src/server/actions/oauth-confirm.ts` (two phone/password confirmation branches)
- `src/server/queries/customer-completion.ts`
- `src/app/(liff)/liff/onboarding/actions.ts`
- `src/app/api/line-oauth/taichung/complete/route.ts`

`src/server/actions/profile.ts` also directly creates `provider: "line"`.
Identity-consolidation services contain additional direct legacy link writes.
This is an inventory, not authorization to add further callers.

PR 2 migrates LINE Login callback, confirmation, LIFF, and Auth.js-facing
paths to `line_login`. PR 3 migrates verified Messaging webhook, recipient,
notification, and rebind paths to `line_messaging`, retaining
`Customer.lineUserId` only as a transitional reader. PR 4 supplies a read-only
classification and dry-run report; legacy rows are never automatically
reclassified from value equality alone.
