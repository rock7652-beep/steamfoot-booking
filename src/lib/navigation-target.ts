/** Preserve proxy-backed dashboard scope for programmatic navigation as for links. */
export function scopedNavigationHref(href: string, pathname: string): string {
  if (!/^\/dashboard(?:[/?#]|$)/.test(href)) return href;
  const prefix = pathname.match(/^(\/s\/[^/]+\/admin|\/hq)(?=\/dashboard(?:\/|$))/)?.[1] ?? "";
  return prefix + href;
}

export function navigationTarget(href: string, current: string) {
  const from = new URL(current);
  const scoped = scopedNavigationHref(href, from.pathname);
  const to = new URL(scoped, from);
  return {
    href: scoped,
    unchanged: to.href === from.href,
    preserveScroll: to.origin === from.origin && to.pathname === from.pathname && to.search !== from.search && to.hash === from.hash,
  };
}
