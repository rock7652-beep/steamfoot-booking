# Revenue customer drawer

PR #970 Preview only. Revenue “查看顧客” opens the existing SPA customer account panel in place. No URL navigation, search reset, router refresh, or database mutation is triggered by viewing or closing. Closing restores trigger focus with preventScroll.

The panel immediately shows loading, supports retry/close on failure, and ignores a late response after closing. Each opening obtains a fresh, store-scoped profile and summaries. Account tabs require wallet.read and transaction.read; bookings require booking.read. The revenue viewer has no sale/refund/edit actions.

Validation: 10 customer drawer/profile tests, TypeScript and ESLint passed. Browser visual acceptance remains unavailable due to the existing CDP connection timeout; no browser acceptance is claimed.
