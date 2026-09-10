# Central web LINE login rollout

The web LINE provider reads WEB_LINE_LOGIN_CHANNEL_ID and WEB_LINE_LOGIN_CHANNEL_SECRET in src/lib/auth.ts. LIFF independently resolves channel 2010761154 in src/lib/liff/central-member-config.ts. The previous Taichung button bypassed the global web provider and used a separate coordinator.

This change sends Taichung through the same Auth.js provider as other stores, preserving oauth-store-slug and the store return URL. Existing signed Taichung callbacks remain available for in-flight attempts. LIFF configuration and database data are unchanged.

## Required deployment configuration

Before releasing this commit, set WEB_LINE_LOGIN_CHANNEL_ID to 2010761154 and WEB_LINE_LOGIN_CHANNEL_SECRET to the matching central Login channel secret in the target environment. Do not reuse an old channel secret or a Messaging API secret. The central callback https://www.steamfoot.com/api/auth/callback/line was saved by the owner on 2026-09-10. Preview requires its own approved callback host. Never commit secrets.

## Acceptance gate

Verify newly generated authorization URLs for /s/Zhubei, /s/hsinchu and /s/taichung use the central client ID. Complete real browser OAuth and confirm the original store session, existing Customer, plans, bookings and health records. Verify no duplicate member creation and no cross-store access. Recheck all three existing LIFF entries. Authorization-page success alone is insufficient. This commit is not a production fix until configuration and end-to-end verification are complete.

Add these as new variables scoped to Preview branch fix/central-web-line-login. Preserve all existing LINE_LOGIN_CHANNEL_*, CENTRAL_MEMBER_*, LIFF and Messaging API values. Missing web credentials do not fall back to legacy credentials. Do not merge production until configured and accepted.
