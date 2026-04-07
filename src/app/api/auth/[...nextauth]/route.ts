import { handlers } from "@/lib/auth";
import { NextRequest } from "next/server";

// Wrap GET to log the raw callback request from OAuth providers
const originalGET = handlers.GET;

async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  const isCallback = pathname.includes("/callback/");

  // Log callback requests (LINE/Google OAuth callback)
  if (isCallback) {
    console.log("[auth-route] OAuth callback received:", {
      url: req.url,
      host: req.headers.get("host"),
      code: url.searchParams.has("code") ? "(present)" : "(missing)",
      state: url.searchParams.has("state") ? "(present)" : "(missing)",
      error: url.searchParams.get("error"),
      error_description: url.searchParams.get("error_description"),
      error_uri: url.searchParams.get("error_uri"),
    });

    // Log relevant cookies for state debugging
    const cookieHeader = req.headers.get("cookie") ?? "";
    const hasStateCookie = cookieHeader.includes("authjs.state");
    const hasSessionCookie = cookieHeader.includes("authjs.session-token");
    console.log("[auth-route] callback cookies:", {
      hasStateCookie,
      hasSessionCookie,
      cookieNames: cookieHeader
        .split(";")
        .map((c) => c.trim().split("=")[0])
        .filter((n) => n.includes("authjs"))
        .join(", "),
    });
  }

  try {
    const response = await originalGET(req);

    // Log callback response details to see where it redirects
    if (isCallback) {
      const location = response.headers.get("location");
      console.log("[auth-route] callback response:", {
        status: response.status,
        location: location?.substring(0, 300),
      });
    }

    return response;
  } catch (error: unknown) {
    // Auth.js AuthError subclasses are re-thrown silently (no logging).
    // Catch and log them here so we can see what went wrong.
    if (isCallback) {
      const err = error as Error;
      console.error("[auth-route] callback ERROR:", {
        name: err?.name,
        message: err?.message,
        type: (err as any)?.type,
        cause: err?.cause instanceof Error
          ? { name: err.cause.name, message: err.cause.message }
          : err?.cause,
      });
    }
    throw error; // Re-throw so Auth.js/Next.js handles it normally
  }
}

export { GET };
export const { POST } = handlers;
