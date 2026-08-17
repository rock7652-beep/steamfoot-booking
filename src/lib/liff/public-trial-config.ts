/**
 * Public LINE identifiers are intentionally scoped to the Zhubei public-trial
 * bridge. This LINE Login channel lives under the same LINE provider as the
 * Zhubei Messaging API channel, so both channels issue the same user subject.
 *
 * Do not replace the shared member-login channel with these values: existing
 * member LIFF and NextAuth flows continue to use their current configuration.
 */
export const ZHUBEI_PUBLIC_TRIAL_LINE_LOGIN_CHANNEL_ID = "2011147985";
export const ZHUBEI_PUBLIC_TRIAL_LIFF_ID = "2011147985-tQ5wrAdH";
export const ZHUBEI_PUBLIC_TRIAL_LIFF_URL =
  `https://liff.line.me/${ZHUBEI_PUBLIC_TRIAL_LIFF_ID}`;
