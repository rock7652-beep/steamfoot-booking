# Messenger Production runbook

The Messenger integration is intentionally fail-closed: invalid webhook signatures receive `401`, and all credentials are server-only environment variables.

## Deploy configuration

The existing runtime configuration is store-aware: set `MESSENGER_PAGE_ID_<STORE>` and `MESSENGER_PAGE_ACCESS_TOKEN_<STORE>` for each active store, where `<STORE>` is the upper-case store slug with non-alphanumeric characters replaced by `_`. `MESSENGER_VERIFY_TOKEN` and `MESSENGER_APP_SECRET` are shared webhook credentials. `MESSENGER_WEBHOOK_URL` must be the public production URL ending in `/api/messenger/webhook`; do not use a preview deployment.

The Page access token must be issued for the exact `MESSENGER_PAGE_ID`. The app access token is used only by the production audit/configuration tool and is not used to send messages at runtime.

## Verify and repair

Run the following with Production variables injected in a secure shell:

```bash
npm run audit:messenger-production -- --store=zhubei
```

It verifies the Meta app, that the Page token resolves to the configured Page, the Page webhook callback and subscribed fields, and that the Page is attached to the app (`subscribed_apps`). It is read-only and exits with code 2 when a setting is missing or drifted.

After reviewing its output, apply only the two reversible Graph configuration writes with:

```bash
npm run audit:messenger-production -- --store=zhubei --apply
npm run audit:messenger-production -- --store=zhubei
```

`--apply` updates the app's `page` subscription to `messages`, `messaging_postbacks`, `messaging_optins`, and `messaging_referrals`, then attaches the configured Page to the app. It does not grant permissions, submit the app for review, or alter Page roles; those require the appropriate Meta administrator in Business Manager.

To test actual Send API delivery, temporarily set `MESSENGER_SMOKE_TEST_PSID` to a consenting test user's Page-scoped ID and run `npm run audit:messenger-production -- --store=zhubei --send-smoke`. This is the only audit mode that sends a message.

## Runtime checks

Use Meta's webhook verification against `GET /api/messenger/webhook`. A valid verification request returns exactly `hub.challenge`. Incoming `POST` deliveries are authenticated with `X-Hub-Signature-256`; the route does not log message content or PSIDs. The existing `sendMessengerMessages()` adapter is the Send API entry point and uses each store's Page token.
