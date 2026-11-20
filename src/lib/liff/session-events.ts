export const LIFF_MEMBER_SESSION_EXPIRED = "liff-member-session-expired";

export function reportLiffMemberSessionExpired(storeSlug?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LIFF_MEMBER_SESSION_EXPIRED, { detail: storeSlug }));
  }
}
