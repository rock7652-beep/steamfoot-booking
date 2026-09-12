export type LiffSessionInput = { idToken: string; storeSlug: string };
export type LiffSessionResult =
  | { status: "session_created"; displayName: string | null }
  | { status: "need_onboarding"; displayName: string | null }
  | { status: "expired" }
  | { status: "service_unavailable" };

/** Every LIFF entry verifies the current LINE identity before using cookies.
 * No success cache: another entry or account may have replaced the session.
 */
export async function refreshLiffSession(
  input: LiffSessionInput,
  exchange?: (input: LiffSessionInput) => Promise<unknown>,
): Promise<LiffSessionResult> {
  if (!input.idToken) return { status: "expired" };
  try {
    const body = await (exchange ?? (async (payload: LiffSessionInput) => {
      const response = await fetch("/api/liff/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const value: unknown = await response.json();
      if (!response.ok && !(value && typeof value === "object" &&
          "status" in value && value.status === "error")) return null;
      return value;
    }))(input);
    if (!body || typeof body !== "object" || !("status" in body)) {
      return { status: "service_unavailable" };
    }
    if (body.status === "session_created" || body.status === "need_onboarding") {
      return { status: body.status, displayName:
        "displayName" in body && typeof body.displayName === "string" ? body.displayName : null };
    }
    if (body.status === "error" && "code" in body &&
        (body.code === "ID_TOKEN_EXPIRED" || body.code === "ID_TOKEN_INVALID")) {
      return { status: "expired" };
    }
    return { status: "service_unavailable" };
  } catch {
    return { status: "service_unavailable" };
  }
}
