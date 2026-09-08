# Store check receiver deployment

The website now posts to `/pricing/submit`. It reads the existing receiver's JSON acknowledgement; an HTTP 200 alone never counts as success. Legacy `ok: true` is supported because the existing receiver returns it only after `appendRow` and email delivery complete. Uncertain responses retain the form, disable repeat submission and ask the applicant to contact official LINE. No automatic POST retries occur.

## Apps Script update (separate from GitHub/Vercel)

`Code.gs` is a prepared replacement, **not automatically deployed by Vercel**.

1. Open the existing response spreadsheet, Extensions → Apps Script.
2. Replace the existing source with `Code.gs` and save.
3. Deploy → Manage deployments → edit the EXISTING Web App → New version → Deploy. Keep the existing `/exec` URL, execution identity and access settings.
4. Confirm GET on the deployment returns `version: 2`.
5. Submit one clearly marked synthetic application through the website. Confirm one saved row, a receipt and the new email at the fixed recipient. Do not create trial accounts or contact test leads.

The first 27 columns remain unchanged. AB–AD append request ID, notification status and content fingerprint; conflicting headers stop writes rather than overwrite data. V2 flushes and reads back the row before acknowledging success. Reusing the same request ID and identical payload returns the saved row without appending another; a changed payload using the same ID is rejected. Email failure keeps the application saved and marks the row for manual review. Email is not exactly-once: interrupted delivery or status writes may need manual review. The current browser does not automatically retry uncertain requests.

Email uses a single-column label-above-value layout, fixed recipient, escaped submitted text, and a plain-text alternative. Trial applications use the subject `【蒸管家】新的體驗帳號申請｜店名`.

Until V2 is deployed, legacy email formatting and legacy save-before-email failure behavior remain. Do not report these receiver changes as live before version and real receipt verification.
