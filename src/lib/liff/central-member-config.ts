export const CENTRAL_MEMBER_LIFF_ID = "2010761154-duGBs1Ng";
export const RETIRED_CENTRAL_MEMBER_LIFF_ID = "2009711308-47Ffoh9r";
export const CENTRAL_MEMBER_LINE_LOGIN_CHANNEL_ID = "2010761154";

export const CENTRAL_MEMBER_LIFF_ID_BY_STORE: Readonly<Record<string, string>> = {
  zhubei: CENTRAL_MEMBER_LIFF_ID,
  hsinchu: "2010761154-SWaHxZqg",
  taichung: "2010761154-D24uwxIB",
};

/**
 * Each official account opens the member LIFF whose endpoint is already scoped
 * to that store. All three apps belong to the same LINE Login channel, so the
 * verified LINE subject remains compatible while the URL store stays explicit.
 */
export function resolveCentralMemberLiffIdForStore(
  storeSlug: string | null | undefined,
): string | null {
  if (!storeSlug) return null;
  return CENTRAL_MEMBER_LIFF_ID_BY_STORE[storeSlug] ?? null;
}

/**
 * LIFF 的 idToken 必須用其所屬 LINE Login channel 驗證，不能沿用網頁版
 * OAuth channel。環境變數只供日後遷移覆寫；公開 channel ID 不是密鑰。
 */
export function resolveCentralMemberLineLoginChannelId(): string {
  return (
    process.env.CENTRAL_MEMBER_LINE_LOGIN_CHANNEL_ID?.trim() ||
    CENTRAL_MEMBER_LINE_LOGIN_CHANNEL_ID
  );
}

export function replaceRetiredCentralMemberLiffId(
  liffId: string | null,
): string {
  return !liffId || liffId === RETIRED_CENTRAL_MEMBER_LIFF_ID
    ? CENTRAL_MEMBER_LIFF_ID
    : liffId;
}
