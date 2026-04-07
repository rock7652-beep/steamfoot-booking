import { handlers } from "@/lib/auth";
import { NextRequest } from "next/server";

// Wrap GET to log the raw callback request from OAuth providers
const originalGET = handlers.GET;

async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Log callback requests (LINE/Google OAuth callback)
  if (pathname.includes("/callback/")) {
    console.log("[auth-route] OAuth callback received:", {
      url: req.url,
      host: req.headers.get("host"),
      // OAuth params
      code: url.searchParams.has("code") ? "(present)" : "(missing)",
      state: url.searchParams.has("state") ? "(present)" : "(missing)",
      error: url.searchParams.get("error"),
      error_description: url.searchParams.get("error_description"),
      error_uri: url.searchParams.get("error_uri"),
    });
  }

  return originalGET(req);
}

export { GET };
export const { POST } = handlers;
