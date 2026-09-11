/**
 * Public LINE identifiers are scoped to the public-trial bridges created in
 * the shared member-login channel. Each store still verifies that the LINE
 * subject is recognized by its own Messaging API before issuing an entry.
 *
 * Do not replace the shared member-login channel with these values: existing
 * member LIFF and NextAuth flows continue to use their current configuration.
 */
export const SHARED_PUBLIC_TRIAL_LINE_LOGIN_CHANNEL_ID = "2010761154";

export const ZHUBEI_PUBLIC_TRIAL_LINE_LOGIN_CHANNEL_ID =
  SHARED_PUBLIC_TRIAL_LINE_LOGIN_CHANNEL_ID;
export const ZHUBEI_PUBLIC_TRIAL_LIFF_ID = "2010761154-i4DO3oFO";
export const ZHUBEI_PUBLIC_TRIAL_LIFF_URL =
  `https://liff.line.me/${ZHUBEI_PUBLIC_TRIAL_LIFF_ID}`;

const PUBLIC_TRIAL_LIFF_ID_BY_STORE = {
  zhubei: ZHUBEI_PUBLIC_TRIAL_LIFF_ID,
  hsinchu: "2010761154-irZGuDty",
  taichung: "2010761154-mupiLvI6",
} as const;

export type PublicTrialStoreSlug = keyof typeof PUBLIC_TRIAL_LIFF_ID_BY_STORE;

export function resolvePublicTrialLiffConfig(storeSlug: string): {
  liffId: string;
  lineLoginChannelId: string;
} | null {
  if (!(storeSlug in PUBLIC_TRIAL_LIFF_ID_BY_STORE)) return null;
  const slug = storeSlug as PublicTrialStoreSlug;
  return {
    liffId: PUBLIC_TRIAL_LIFF_ID_BY_STORE[slug],
    lineLoginChannelId: SHARED_PUBLIC_TRIAL_LINE_LOGIN_CHANNEL_ID,
  };
}
