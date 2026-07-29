export type DigitalButlerLeadFilterKey = "status" | "staff" | "provider";

/**
 * Updates one lead-list filter without dropping store-scoped route prefixes or
 * unrelated query parameters (for example the selected lead deep link).
 */
export function digitalButlerLeadFilterHref(
  pathname: string,
  searchParams: URLSearchParams | string,
  key: DigitalButlerLeadFilterKey,
  value: string,
): string {
  const params = new URLSearchParams(searchParams);
  if (value) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
