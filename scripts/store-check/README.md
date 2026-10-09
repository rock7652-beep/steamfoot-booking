# Store check receiver deployment

The website posts to `/pricing/submit`. With `CONSULTATION_HQ_ENABLED` unset, the existing Sheet-only flow is unchanged. When separately approved schema and the flag are enabled, HQ saves an independent consultation lead first and claims at most one Sheet POST; a durable HQ receipt remains successful if Sheet delivery is uncertain, and HQ displays that distinction. See `docs/consultation-hq-local-plan.md`. It reads the existing receiver's JSON acknowledgement; an HTTP 200 alone never counts as success. Legacy `ok: true` is supported because the existing receiver returns it only after `appendRow` and email delivery complete. Uncertain responses retain the form, disable repeat submission and ask the applicant to contact official LINE. No automatic POST retries occur.

## Apps Script update (separate from GitHub/Vercel)

`Code.gs` is a prepared replacement, **not automatically deployed by Vercel**.

1. Open the existing response spreadsheet, Extensions → Apps Script.
2. Replace the existing source with `Code.gs` and save.
3. Deploy → Manage deployments → edit the EXISTING Web App → New version → Deploy. Keep the existing `/exec` URL, execution identity and access settings.
4. Confirm GET on the deployment returns `version: 2`.
5. Submit one clearly marked synthetic application through the website. Confirm one saved row, a receipt and the new email at the fixed recipient. Do not create trial accounts or contact test leads.

The first 27 columns remain unchanged. AB–AD append request ID, notification status and content fingerprint; conflicting headers stop writes rather than overwrite data. V2 flushes and reads back the row before acknowledging success. Reusing the same request ID and identical payload returns the saved row without appending another; a changed payload using the same ID is rejected. Email failure keeps the application saved and marks the row for manual review. Email is not exactly-once: interrupted delivery or status writes may need manual review. The current browser does not automatically retry uncertain requests.

Email uses a single-column label-above-value layout, fixed recipient, escaped submitted text, and a plain-text alternative. Consultation/trial-interest submissions use `【蒸管家】店家需求諮詢／體驗意願｜店名`, distinct from the second-stage opening-data notification. This label change requires updating the existing Apps Script deployment; editing this file does not change live email.

Until V2 is deployed, legacy email formatting and legacy save-before-email failure behavior remain. Do not report these receiver changes as live before version and real receipt verification.
