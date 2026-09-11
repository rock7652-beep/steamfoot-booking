/**
 * POST /api/liff/exchange — LIFF idToken → NextAuth session bootstrap (PR-B)
 *
 * 接 LIFF client `liff.getIDToken()` 取得的 idToken，後端執行：
 *   1. zod body 驗證
 *   2. LINE `/oauth2/v2.1/verify` 驗 idToken (aud / exp / iss)
 *   3. resolveStoreBySlug(slug) → storeId
 *   4. 查 CustomerIdentityLink(provider+lineUserId+storeId)，legacy fallback 查 Customer(storeId, lineUserId)
 *      - 有 → signIn("liff-token", { idToken, storeSlug }) 寫 session cookie
 *             → 200 { status: "session_created", storeSlug, customerId, displayName }
 *      - 無 → 200 { status: "need_onboarding", lineUserId, displayName, storeSlug }
 *
 * Note: 為深度防禦，authorize() 內會 *再做一次* verify。
 *       LINE verify 是 stateless GET ~150ms，再一次的成本可接受。
 *
 * 不在此 PR 範圍：
 *   - need_onboarding 後的補手機 / 建 Customer (PR-C)
 *   - 預約 (PR-D)
 *
 * 路由公開：proxy.ts 對 /api/* 一律放行 (line 238-240)。
 */

import { z } from "zod";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  LiffIdTokenError,
  verifyLiffIdToken,
} from "@/lib/liff/verify-id-token";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { logLineBindEvent } from "@/lib/line-bind-log";
import { resolveCentralMemberLineLoginChannelId } from "@/lib/liff/central-member-config";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
  storeSlug: z.string().min(1, "storeSlug is required"),
});

type ResponseBody =
  | {
      status: "session_created";
      storeSlug: string;
      customerId: string;
      displayName: string | null;
    }
  | {
      status: "need_onboarding";
      storeSlug: string;
      lineUserId: string;
      displayName: string | null;
    }
  | {
      status: "error";
      code:
        | "INVALID_BODY"
        | "MISSING_CHANNEL_CONFIG"
        | "STORE_NOT_FOUND"
        | "ID_TOKEN_INVALID"
        | "ID_TOKEN_EXPIRED"
        | "ID_TOKEN_AUD_MISMATCH"
        | "ID_TOKEN_ISS_MISMATCH"
        | "VERIFY_NETWORK"
        | "SESSION_MINT_FAILED"
        | "INTERNAL";
      message: string;
    };

function json(body: ResponseBody, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(req: Request): Promise<Response> {
  // ── 1. Parse + validate body ──
  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    parsed = BodySchema.parse(raw);
  } catch (err) {
    return json(
      {
        status: "error",
        code: "INVALID_BODY",
        message: err instanceof z.ZodError ? err.issues[0]?.message ?? "invalid body" : "invalid body",
      },
      400
    );
  }
  const { idToken, storeSlug } = parsed;

  // ── 2. Config check ──
  const expectedChannelId = resolveCentralMemberLineLoginChannelId();

  // ── 3. Verify idToken ──
  let verified;
  try {
    verified = await verifyLiffIdToken(idToken, expectedChannelId);
  } catch (err) {
    if (err instanceof LiffIdTokenError) {
      const code =
        err.code === "EXPIRED"
          ? "ID_TOKEN_EXPIRED"
          : err.code === "AUD_MISMATCH"
            ? "ID_TOKEN_AUD_MISMATCH"
            : err.code === "ISS_MISMATCH"
              ? "ID_TOKEN_ISS_MISMATCH"
              : err.code === "NETWORK"
                ? "VERIFY_NETWORK"
                : "ID_TOKEN_INVALID";
      const status = err.code === "NETWORK" ? 502 : 401;
      logLineBindEvent({
        path: "liff-exchange",
        status: "verify_failed",
        storeSlug,
        errorCode: code,
      });
      return json({ status: "error", code, message: err.message }, status);
    }
    console.error("[liff/exchange] unexpected verify error", err);
    logLineBindEvent({
      path: "liff-exchange",
      status: "unexpected_error",
      storeSlug,
      errorCode: "VERIFY_THREW",
    });
    return json({ status: "error", code: "INTERNAL", message: "verify failed" }, 500);
  }

  // ── 4. Resolve store ──
  const store = await resolveStoreBySlug(storeSlug);
  if (!store) {
    logLineBindEvent({
      path: "liff-exchange",
      status: "store_not_found",
      storeSlug,
      lineUserId: verified.lineUserId,
    });
    return json(
      {
        status: "error",
        code: "STORE_NOT_FOUND",
        message: `store not found: ${storeSlug}`,
      },
      404
    );
  }

  // ── 5. Customer lookup ──
  const identityLink = await prisma.customerIdentityLink.findUnique({
    where: {
      uq_customer_identity_provider_store: {
        provider: "line",
        providerAccountId: verified.lineUserId,
        storeId: store.id,
      },
    },
    select: {
      userId: true,
      customer: { select: { id: true, name: true, lineName: true } },
    },
  });
  const customer = identityLink
    ? { ...identityLink.customer, userId: identityLink.userId }
    : await prisma.customer.findFirst({
        where: { storeId: store.id, lineUserId: verified.lineUserId },
        select: { id: true, userId: true, name: true, lineName: true },
      });

  if (!customer || !customer.userId) {
    // 沒 customer 或 customer 還沒綁 user → 走 onboarding 補手機 (PR-C)
    logLineBindEvent({
      path: "liff-exchange",
      status: "need_onboarding",
      storeId: store.id,
      storeSlug: store.slug,
      lineUserId: verified.lineUserId,
      customerId: customer?.id ?? null,
    });
    return json(
      {
        status: "need_onboarding",
        storeSlug: store.slug,
        lineUserId: verified.lineUserId,
        displayName: verified.displayName ?? customer?.lineName ?? customer?.name ?? null,
      },
      200
    );
  }

  // ── 6. Mint session via Credentials provider ──
  // authorize() 會 *再做一次* verify + Customer 查詢，這是 NextAuth 端的安全邊界。
  try {
    await signIn("liff-token", {
      idToken,
      storeSlug: store.slug,
      redirect: false,
    });
  } catch (err) {
    // authorize() 返回 null 會被 NextAuth 包成 CredentialsSignin AuthError
    logLineBindEvent({
      path: "liff-exchange",
      status: "session_mint_failed",
      storeId: store.id,
      storeSlug: store.slug,
      lineUserId: verified.lineUserId,
      customerId: customer.id,
      userId: customer.userId,
      errorCode: err instanceof Error ? err.name : "Unknown",
    });
    return json(
      {
        status: "error",
        code: "SESSION_MINT_FAILED",
        message: "failed to mint session",
      },
      401
    );
  }

  logLineBindEvent({
    path: "liff-exchange",
    status: "session_created",
    storeId: store.id,
    storeSlug: store.slug,
    lineUserId: verified.lineUserId,
    customerId: customer.id,
    userId: customer.userId,
  });

  return json(
    {
      status: "session_created",
      storeSlug: store.slug,
      customerId: customer.id,
      displayName: verified.displayName ?? customer.lineName ?? customer.name ?? null,
    },
    200
  );
}
