/** Public routing only: never accept a redirect URL from query parameters. */
export function courseMemberReturnPath(slug: string, search: string): string {
  const params = new URLSearchParams(search);
  const state = params.get("liff.state");
  const nested = state ? new URLSearchParams(state.includes("?") ? state.slice(state.indexOf("?") + 1) : state) : new URLSearchParams();
  const date = params.get("courseDate") ?? nested.get("courseDate");
  const view = params.get("courseView") ?? nested.get("courseView");
  const target = new URLSearchParams();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { target.set("date", date); target.set("month", date.slice(0, 7)); }
  if (view && ["bookings", "plans", "shop", "schedule"].includes(view)) target.set("view", view);
  const bookingId = params.get("courseBookingId") ?? nested.get("courseBookingId");
  const action = params.get("courseAction") ?? nested.get("courseAction");
  if (bookingId && /^[a-zA-Z0-9:_-]{1,100}$/.test(bookingId) && action && ["confirm", "reschedule", "cancel"].includes(action)) {
    target.set("bookingId", bookingId); target.set("action", action); target.set("view", "bookings");
  }
  const query = target.toString();
  return "/s/" + encodeURIComponent(slug) + "/book" + (query ? "?" + query : "");
}
