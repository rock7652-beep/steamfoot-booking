# Central web LINE login rollout

The web LINE provider reads WEB_LINE_LOGIN_CHANNEL_ID and WEB_LINE_LOGIN_CHANNEL_SECRET in src/lib/auth.ts. LIFF independently resolves channel 2010761154 in src/lib/liff/central-member-config.ts. The previous Taichung button bypassed the global web provider and used a separate coordinator.

This change sends Taichung through the same Auth.js provider as other stores, preserving oauth-store-slug and the store return URL. Existing signed Taichung callbacks remain available for in-flight attempts. LIFF configuration and database data are unchanged.

## Required deployment configuration

Before releasing this commit, set WEB_LINE_LOGIN_CHANNEL_ID to 2010761154 and WEB_LINE_LOGIN_CHANNEL_SECRET to the matching central Login channel secret in the target environment. Do not reuse an old channel secret or a Messaging API secret. The central callback https://www.steamfoot.com/api/auth/callback/line was saved by the owner on 2026-09-10. Preview requires its own approved callback host. Never commit secrets.

## Acceptance gate

Verify newly generated authorization URLs for /s/Zhubei, /s/hsinchu and /s/taichung use the central client ID. Complete real browser OAuth and confirm the original store session, existing Customer, plans, bookings and health records. Verify no duplicate member creation and no cross-store access. Recheck all three existing LIFF entries. Authorization-page success alone is insufficient. This commit is not a production fix until configuration and end-to-end verification are complete.

Add these as new variables scoped to Preview branch fix/central-web-line-login. Preserve all existing LINE_LOGIN_CHANNEL_*, CENTRAL_MEMBER_*, LIFF and Messaging API values. Missing web credentials do not fall back to legacy credentials. Do not merge production until configured and accepted.

## Membership parity audit

Both web OAuth and LIFF token authorization first query the same explicit
CustomerIdentityLink key: provider=line + verified subject + target store.
The three-store synthetic callback tests establish equal central User,
Customer and store IDs when that mapping exists, even if the legacy User
relation points to another store. They do not exercise live OAuth signIn,
LINE token verification, database history queries or the complete LIFF UI.

The identity-link-only mismatch is now fixed: web signIn re-reads the exact
link in a Serializable transaction and reuses its active CUSTOMER User when
Customer.userId is null. Conflicting Account ownership, legacy ownership,
store drift and merged Customers are rejected. Only a missing OAuth Account
is created; no Customer, history, notification ID or legacy owner is changed.
LIFF behavior is unchanged. Web legacy fallback
uses the verified Account owner; LIFF retains a legacy lineUserId lookup.
Do not copy the LIFF fallback into web OAuth or match by display name to hide
missing links. These cases need targeted owner-consistency verification before
production acceptance.

Live Preview logs for the owner's test showed need_onboarding and a missing
membership for store-zhubei-preview. This is not evidence of missing production
history. Live same-member two-entry verification remains pending: use a dedicated
Preview member with a verified LINE identity link, verify identical Customer IDs
and booking/plan records from both entry points, and verify no duplicate member.
Do not point Preview at production data or claim this audit completes that gate.

## Restricted production pilot

Production web LINE sign-in fails closed unless WEB_LINE_LOGIN_MODE is explicitly
`pilot` or `all`. Preview retains its existing default when the mode is absent.
For the owner-only pilot set mode `pilot`, WEB_LINE_LOGIN_PILOT_USER_ID to the
verified production central User ID, and WEB_LINE_LOGIN_PILOT_STORE_ID to the
verified production store ID. These are server-only environment variables; no
personal identifiers are committed. Both WEB channel credentials must also be
configured for Production before deployment.

The gate runs after verified LINE OAuth and before any signIn identity writes,
including account-link handshakes. It requires the exact subject/store identity
link, the specified active CUSTOMER user, unmerged store membership, and no
conflicting legacy owner. LIFF credentials bypass this OAuth-only gate. This is
an access restriction, not a simulated identity or a copied production database.
The existing store page remains the entry; only the allowed identity can finish
web LINE sign-in during the pilot. Other web LINE identities are rejected.

Disable by setting mode `disabled` and redeploying, or roll back the deployment.
Do not enable `all` until actual web/LIFF member history comparison passes.
No production deployment, credential changes, or real-user acceptance has been
performed as part of this pilot preparation.
