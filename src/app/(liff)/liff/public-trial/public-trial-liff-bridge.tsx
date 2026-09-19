"use client";

import { useEffect, useState } from "react";
import {
  getIDToken,
  initLiff,
  isInLineClient,
} from "@/lib/liff/client";

type BridgeState = "loading" | "expired" | "unavailable" | "open_line" | "store_chat" | "add_friend";

export function PublicTrialLiffBridge({
  liffId,
  storeSlug,
  storeName,
  contactUrl,
  chatBookingUrl,
}: {
  liffId: string;
  storeSlug: string;
  storeName: string;
  contactUrl: string;
  chatBookingUrl: string | null;
}) {
  const [state, setState] = useState<BridgeState>("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const liff = await initLiff(liffId);
        if (cancelled) return;
        if (!isInLineClient()) {
          setState("open_line");
          return;
        }

        const idToken = getIDToken();
        if (!idToken) {
          setState("expired");
          return;
        }

        const response = await fetch("/api/liff/public-trial-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, storeSlug }),
        });
        const body = (await response.json().catch(() => null)) as
          | { status: "ok"; entry: string }
          | { status: "error"; code: string }
          | null;
        if (cancelled) return;

        if (body?.status === "ok" && body.entry) {
          const friendship = await liff.getFriendship();
          if (cancelled) return;
          if (!friendship.friendFlag) {
            setState("add_friend");
            return;
          }
          const destination = new URL(
            `/pricing/experience/${storeSlug}/book`,
            window.location.origin,
          );
          destination.searchParams.set("entry", body.entry);
          destination.hash = "booking-form";
          window.location.replace(destination.toString());
          return;
        }

        // Never silently downgrade to an anonymous form. The store webhook
        // can issue a verified entry without sharing the LIFF Provider.
        if (
          body?.status === "error" &&
          body.code === "IDENTITY_SCOPE_MISMATCH"
        ) {
          setState("store_chat");
          return;
        }

        setState(
          body?.status === "error" &&
            (body.code === "ID_TOKEN_EXPIRED" || body.code === "ID_TOKEN_INVALID")
            ? "expired"
            : "unavailable",
        );
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId, storeSlug]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-earth-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary-700">{storeName}</p>
        {state === "loading" ? (
          <>
            <div className="mx-auto mt-5 h-9 w-9 animate-spin rounded-full border-2 border-earth-200 border-t-primary-600" aria-hidden />
            <h1 className="mt-4 text-xl font-bold text-earth-900">正在開啟體驗預約</h1>
            <p className="mt-2 text-sm text-earth-500">即將直接進入日期與時段選擇。</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold text-earth-900">
              {state === "expired" ? "LINE 登入已逾時" : state === "open_line" ? "請在 LINE 中繼續預約" : state === "add_friend" ? "先加入本店 LINE 好友" : "從本店 LINE 繼續預約"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-earth-600">
              {state === "expired" ? "請重新整理後再試一次。" : state === "add_friend" ? "加入好友後，回到這裡按重新嘗試。不用再輸入電話。" : "尚未完成通知身分確認。可開啟本店聊天室，送出「開始體驗預約」，再點專屬連結填表；不必先輸入電話。"}
            </p>
            <div className="mt-5 grid gap-3">
              {state === "open_line" ? <a href={`https://liff.line.me/${liffId}`} className="flex min-h-11 items-center justify-center rounded-xl bg-[#06C755] px-4 font-semibold text-white">使用 LINE 開啟</a> : null}
              {chatBookingUrl ? <a href={chatBookingUrl} className="flex min-h-11 items-center justify-center rounded-xl bg-[#06C755] px-4 font-semibold text-white">從本店 LINE 取得預約連結</a> : null}
              <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl bg-primary-600 px-4 text-sm font-bold text-white">
                重新嘗試
              </button>
              <a href={contactUrl || undefined} aria-disabled={!contactUrl} className="flex min-h-11 items-center justify-center rounded-xl border border-earth-200 px-4 text-sm font-semibold text-earth-700">
                聯繫{storeName}
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
