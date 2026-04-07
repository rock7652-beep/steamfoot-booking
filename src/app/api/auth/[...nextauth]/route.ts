import { handlers } from "@/lib/auth";
import { NextRequest } from "next/server";

// Wrap GET to log the raw callback request from OAuth providers
const originalGET = handlers.GET;

async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  const isCallback = pathname.includes("/callback/");

  // 將所有 pre-request 診斷合併到單一 console.log — Vercel 可能對同一 invocation 的多個 log 做 truncation
  if (isCallback) {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const authCookies = cookieHeader
      .split(";")
      .map((c) => c.trim().split("=")[0])
      .filter((n) => n.includes("authjs"));

    console.log("[auth-route] CALLBACK_DIAG_PRE:", JSON.stringify({
      host: req.headers.get("host"),
      code: url.searchParams.has("code"),
      state: url.searchParams.has("state"),
      error: url.searchParams.get("error"),
      hasStateCookie: cookieHeader.includes("authjs.state"),
      hasSessionCookie: cookieHeader.includes("authjs.session-token"),
      authCookieNames: authCookies,
      authCookieCount: authCookies.length,
      totalCookieLength: cookieHeader.length,
    }));
  }

  let response: Response;
  let caughtError: unknown = null;

  try {
    response = await originalGET(req);
  } catch (error: unknown) {
    caughtError = error;

    // 合併錯誤資訊到單一 log
    if (isCallback) {
      const err = error as Error;
      console.error("[auth-route] CALLBACK_DIAG_ERROR:", JSON.stringify({
        name: err?.name,
        message: err?.message?.substring(0, 500),
        type: (err as any)?.type,
        causeName: err?.cause instanceof Error ? err.cause.name : undefined,
        causeMessage: err?.cause instanceof Error ? err.cause.message?.substring(0, 500) : String(err?.cause ?? ""),
        stack: err?.stack?.substring(0, 800),
      }));
    }
    throw error;
  }

  // 合併 response 資訊到單一 log
  if (isCallback) {
    console.log("[auth-route] CALLBACK_DIAG_POST:", JSON.stringify({
      status: response.status,
      location: response.headers.get("location")?.substring(0, 500),
      setCookieCount: response.headers.getSetCookie?.()?.length ?? -1,
    }));
  }

  return response;
}

export { GET };
export const { POST } = handlers;
