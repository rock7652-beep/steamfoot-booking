import {
  fetchLiffHealthSummary,
  type FetchLiffHealthSummaryResult,
} from "@/server/actions/liff-health";

type SessionInput = { idToken: string; storeSlug: string };
type RecoveryResult = {
  status: "need_onboarding" | "expired" | "service_unavailable";
};

/** Verify the current LINE identity before any cookie-authenticated health read. */
export async function loadHealthWithSessionRefresh(
  input: SessionInput,
  deps: {
    exchange?: (input: SessionInput) => Promise<unknown>;
    loadHealth?: () => Promise<FetchLiffHealthSummaryResult>;
  } = {},
): Promise<FetchLiffHealthSummaryResult | RecoveryResult> {
  if (!input.idToken) return { status: "expired" };
  try {
    const exchange = deps.exchange ?? (async (payload: SessionInput) => {
      const response = await fetch("/api/liff/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();
      if (!response.ok && !(body && typeof body === "object" &&
        "status" in body && body.status === "error")) return null;
      return body;
    });
    const result = await exchange(input);
    if (!result || typeof result !== "object" || !("status" in result)) {
      return { status: "service_unavailable" };
    }
    if (result.status === "need_onboarding") return { status: "need_onboarding" };
    if (result.status === "error" && "code" in result &&
      (result.code === "ID_TOKEN_EXPIRED" || result.code === "ID_TOKEN_INVALID")) {
      return { status: "expired" };
    }
    // Unknown/malformed responses must never allow a stale cookie to read health data.
    if (result.status !== "session_created") return { status: "service_unavailable" };
    return await (deps.loadHealth ?? fetchLiffHealthSummary)();
  } catch {
    return { status: "service_unavailable" };
  }
}
