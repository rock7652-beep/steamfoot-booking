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

The paths are not equivalent for all legacy records: web signIn requires
Customer.userId to equal the explicit link owner, while LIFF token authorization
uses the link's User even when Customer.userId is null. Web legacy fallback
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
