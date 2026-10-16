/** Same-origin invalidation only: no student, payment or account data is shared. */
export const MUSIC_FINANCE_SIGNAL = "music-preview:lubymusic:finance-v1";
const MUSIC_REVENUE_COMMIT_SIGNAL = "music-preview:lubymusic:revenue-commit-v1";
export function isMusicPreviewPage() {
  return process.env.NEXT_PUBLIC_BUILD_ENV === "staging" && typeof window !== "undefined" &&
    window.location.pathname.startsWith("/s/lubymusic/admin/");
}
export type MusicFinanceChange = "purchase" | "receipt" | "general";
function publishSignal(name: string, token: string) {
  if (!isMusicPreviewPage()) return;
  try { localStorage.setItem(name, token); } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new CustomEvent(name, { detail: token }));
  try { const channel = new BroadcastChannel(name); channel.postMessage(token); channel.close(); } catch { /* storage events remain available */ }
}
export function publishMusicFinanceChange(kind: MusicFinanceChange = "general", token = `${kind}:${crypto.randomUUID()}`) {
  publishSignal(MUSIC_FINANCE_SIGNAL, token);
}
/** Sent only after the server confirms commit, before optional student projections finish. */
export function publishMusicRevenueCommit(token: string) {
  publishSignal(MUSIC_REVENUE_COMMIT_SIGNAL, token);
}
export function subscribeMusicFinanceChange(refresh: (kind: MusicFinanceChange) => void, includeRevenueCommit = false) {
  const names = includeRevenueCommit ? [MUSIC_FINANCE_SIGNAL, MUSIC_REVENUE_COMMIT_SIGNAL] : [MUSIC_FINANCE_SIGNAL];
  const seen = new Set<string>();
  for (const name of names) { try { const token = localStorage.getItem(name); if (token) seen.add(token); } catch {} }
  const accept = (token: unknown) => {
    if (typeof token !== "string" || token.length > 100 || !token || seen.has(token)) return;
    seen.add(token);
    if (seen.size > 128) seen.delete(seen.values().next().value!);
    refresh(token.startsWith("purchase:") ? "purchase" : token.startsWith("receipt:") ? "receipt" : "general");
  };
  const storage = (event: StorageEvent) => { if (names.includes(event.key ?? "")) accept(event.newValue); };
  const local = (event: Event) => accept((event as CustomEvent).detail);
  const resume = () => {
    for (const name of names) { try { accept(localStorage.getItem(name)); } catch {} }
  };
  const channels: BroadcastChannel[] = [];
  for (const name of names) { try { const channel = new BroadcastChannel(name); channel.onmessage = event => accept(event.data); channels.push(channel); } catch {} }
  window.addEventListener("storage", storage);
  for (const name of names) window.addEventListener(name, local);
  window.addEventListener("focus", resume);
  document.addEventListener("visibilitychange", resume);
  return () => {
    channels.forEach(channel => channel.close());
    window.removeEventListener("storage", storage);
    for (const name of names) window.removeEventListener(name, local);
    window.removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", resume);
  };
}

/** Route allowlist; environment/store authorization remains separate. */
export function isMusicSyncRoute(pathname: string | null) {
  return !!pathname && /\/dashboard\/(?:courses(?:\/|$)|teachers(?:\/|$)|cashbook$|service-fee-calculator(?:\/|$))/.test(pathname);
}
