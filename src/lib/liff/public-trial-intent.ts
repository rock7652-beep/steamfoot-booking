export type PublicTrialPrimaryIntent =
  | { kind: "member" }
  | { kind: "invalid" }
  | { kind: "trial"; bookingStore?: string };

/** Select the trial initializer from LINE's primary redirect BEFORE mounting
 * a member shell. Store/channel authorization remains on the trial page. */
export function publicTrialPrimaryIntent(value: string | string[] | undefined): PublicTrialPrimaryIntent {
  if (value === undefined || value === "") return { kind: "member" };
  if (typeof value !== "string" || value.length > 2048) return { kind: "invalid" };
  let state = value;
  try {
    // Next normally decodes once. Support a still-encoded path without
    // repeatedly decoding arbitrary nested return URLs.
    if (/^%2f/i.test(state)) state = decodeURIComponent(state);
    if (state.startsWith("//") || state.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(state)) return { kind: "invalid" };
    if (/^public-trial(?:[/?#]|$)/.test(state)) state = `/${state}`;
    const url = new URL(state, "https://liff-intent.invalid");
    if (url.pathname !== "/public-trial" && url.pathname !== "/public-trial/") return { kind: "member" };
    const stores = url.searchParams.getAll("bookingStore");
    if (stores.length > 1 || stores.length === 1 && !/^[a-z0-9-]{1,100}$/.test(stores[0])) return { kind: "invalid" };
    return { kind: "trial", ...(stores.length ? { bookingStore: stores[0] } : {}) };
  } catch { return { kind: "invalid" }; }
}
