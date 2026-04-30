import { NextResponse, type NextRequest } from "next/server";
import { verifyStageToken } from "@/lib/oauth-stage-token";
import { setOAuthTempSession } from "@/lib/server/oauth-temp-session";

/**
 * /api/oauth-line-stage — 把簽章 token 換成 OAuth temp session cookie，再 redirect 到 /oauth-confirm。
 *
 * 為什麼要這支 route？
 *   auth.ts signIn callback 不能直接 setOAuthTempSession（會把 next/headers 打進
 *   middleware / client bundle，build 失敗）。改為 sign payload + redirect 到本
 *   route handler；本檔自然 server-only，可安全寫 cookie。詳見 docs/identity-flow.md。
 *
 * 安全：
 *   - HMAC 驗章（NEXTAUTH_SECRET）
 *   - 90s TTL（短到只夠 redirect 一次）
 *   - 失敗一律回 redirect /oauth-confirm（無 cookie），讓 page 顯示「session 已過期」
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const confirmUrl = new URL("/oauth-confirm", req.url);

  const payload = await verifyStageToken(token);
  if (!payload) {
    // 驗章失敗 → 直接導 /oauth-confirm，page 自會偵測沒 cookie 顯示過期提示
    return NextResponse.redirect(confirmUrl);
  }

  await setOAuthTempSession(payload);
  return NextResponse.redirect(confirmUrl);
}
