/** Same-origin invalidation only: no student, payment or account data is shared. */
export const MUSIC_FINANCE_SIGNAL = "music-preview:lubymusic:finance-v1";
export function isMusicPreviewPage() {
  return process.env.NEXT_PUBLIC_BUILD_ENV === "staging" && typeof window !== "undefined" &&
    window.location.pathname.startsWith("/s/lubymusic/admin/");
}
export function publishMusicFinanceChange() {
  if (!isMusicPreviewPage()) return;
  const token = crypto.randomUUID();
  try { localStorage.setItem(MUSIC_FINANCE_SIGNAL, token); } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new CustomEvent(MUSIC_FINANCE_SIGNAL, { detail: token }));
  try { const channel = new BroadcastChannel(MUSIC_FINANCE_SIGNAL); channel.postMessage(token); channel.close(); } catch { /* storage events remain available */ }
}
export function subscribeMusicFinanceChange(refresh: () => void) {
  let last = "";
  try { last = localStorage.getItem(MUSIC_FINANCE_SIGNAL) ?? ""; } catch {}
  const accept = (token: unknown) => {
    if (typeof token !== "string" || token.length > 100 || !token || token === last) return;
    last = token;
    refresh();
  };
  const storage = (event: StorageEvent) => { if (event.key === MUSIC_FINANCE_SIGNAL) accept(event.newValue); };
  const local = (event: Event) => accept((event as CustomEvent).detail);
  const resume = () => {
    try { accept(localStorage.getItem(MUSIC_FINANCE_SIGNAL)); } catch {}
  };
  let channel: BroadcastChannel | undefined;
  try { channel = new BroadcastChannel(MUSIC_FINANCE_SIGNAL); channel.onmessage = event => accept(event.data); } catch {}
  window.addEventListener("storage", storage);
  window.addEventListener(MUSIC_FINANCE_SIGNAL, local);
  window.addEventListener("focus", resume);
  document.addEventListener("visibilitychange", resume);
  return () => {
    channel?.close();
    window.removeEventListener("storage", storage);
    window.removeEventListener(MUSIC_FINANCE_SIGNAL, local);
    window.removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", resume);
  };
}

/** Route allowlist; environment/store authorization remains separate. */
export function isMusicSyncRoute(pathname: string | null) {
  return !!pathname && /\/dashboard\/(?:courses(?:\/|$)|teachers(?:\/|$)|service-fee-calculator(?:\/|$))/.test(pathname);
}
