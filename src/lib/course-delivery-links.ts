/** Public routing only: never accept a redirect URL from query parameters. */
export function courseMemberReturnPath(slug: string, search: string): string {
  const params = new URLSearchParams(search);
  const state = params.get("liff.state");
  const nested = state ? new URLSearchParams(state.includes("?") ? state.slice(state.indexOf("?") + 1) : state) : new URLSearchParams();
  const date = params.get("courseDate") ?? nested.get("courseDate");
  const view = params.get("courseView") ?? nested.get("courseView");
  const target = new URLSearchParams();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { target.set("date", date); target.set("month", date.slice(0, 7)); }
  if (view && ["bookings", "plans"].includes(view)) target.set("view", view);
  const query = target.toString();
  return "/s/" + encodeURIComponent(slug) + "/book" + (query ? "?" + query : "");
}
