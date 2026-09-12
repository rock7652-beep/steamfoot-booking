import { refreshLiffSession } from "./session-refresh";
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
  const session = await refreshLiffSession(input, deps.exchange);
  if (session.status !== "session_created") return { status: session.status };
  try {
    return await (deps.loadHealth ?? fetchLiffHealthSummary)();
  } catch {
    return { status: "service_unavailable" };
  }
}
