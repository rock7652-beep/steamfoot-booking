/** Same-origin invalidation only: no student, payment or account data is shared. */
export const MUSIC_FINANCE_SIGNAL = "music-preview:lubymusic:finance-v1";
const MUSIC_REVENUE_COMMIT_SIGNAL = "music-preview:lubymusic:revenue-commit-v1";
export function isMusicPreviewPage() {
  return process.env.NEXT_PUBLIC_BUILD_ENV === "staging" && typeof window !== "undefined" &&
    window.location.pathname.startsWith("/s/lubymusic/admin/");
}
export type MusicFinanceChange = "purchase" | "receipt" | "general";
export type MusicFinanceContext = { calendarRefreshOwned: true };
// Local-event metadata only: another tab must still invalidate its own page.
const CALENDAR_REFRESH_OWNED = Symbol("local-calendar-refresh-owned");
type FinanceEvent = CustomEvent<string> & { [CALENDAR_REFRESH_OWNED]?: true };
function publishSignal(name: string, token: string, context?: MusicFinanceContext) {
  if (!isMusicPreviewPage()) return;
  try { localStorage.setItem(name, token); } catch { /* Storage may be disabled. */ }
  const event = new CustomEvent(name, { detail: token }) as FinanceEvent;
  if (context?.calendarRefreshOwned) event[CALENDAR_REFRESH_OWNED] = true;
  window.dispatchEvent(event);
  try { const channel = new BroadcastChannel(name); channel.postMessage(token); channel.close(); } catch { /* storage events remain available */ }
}
export function publishMusicFinanceChange(kind: MusicFinanceChange = "general", token = `${kind}:${crypto.randomUUID()}`, context?: MusicFinanceContext) {
  publishSignal(MUSIC_FINANCE_SIGNAL, token, context);
}
/** Sent only after the server confirms commit, before optional student projections finish. */
export function publishMusicRevenueCommit(token: string) {
  publishSignal(MUSIC_REVENUE_COMMIT_SIGNAL, token);
}
export function subscribeMusicFinanceChange(refresh: (kind: MusicFinanceChange, context?: MusicFinanceContext) => void, includeRevenueCommit = false) {
  const names = includeRevenueCommit ? [MUSIC_FINANCE_SIGNAL, MUSIC_REVENUE_COMMIT_SIGNAL] : [MUSIC_FINANCE_SIGNAL];
  const seen = new Set<string>();
  for (const name of names) { try { const token = localStorage.getItem(name); if (token) seen.add(token); } catch {} }
  const accept = (token: unknown, calendarRefreshOwned = false) => {
    if (typeof token !== "string" || token.length > 100 || !token || seen.has(token)) return;
    seen.add(token);
    if (seen.size > 128) seen.delete(seen.values().next().value!);
    const kind = token.startsWith("purchase:") ? "purchase" : token.startsWith("receipt:") ? "receipt" : "general";
    if (calendarRefreshOwned) refresh(kind, { calendarRefreshOwned: true });
    else refresh(kind);
  };
  const storage = (event: StorageEvent) => { if (names.includes(event.key ?? "")) accept(event.newValue); };
  const local = (event: Event) => accept((event as FinanceEvent).detail, (event as FinanceEvent)[CALENDAR_REFRESH_OWNED] === true);
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
