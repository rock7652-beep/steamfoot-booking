"use client";

import { useEffect, useState } from "react";
import {
  getIDToken,
  initLiff,
  isInLineClient,
} from "@/lib/liff/client";

type BridgeState = "loading" | "expired" | "unavailable";

export function PublicTrialLiffBridge({
  liffId,
  storeSlug,
  storeName,
  contactUrl,
}: {
  liffId: string;
  storeSlug: string;
  storeName: string;
  contactUrl: string;
}) {
  const [state, setState] = useState<BridgeState>("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await initLiff(liffId);
        if (cancelled) return;
        if (!isInLineClient()) {
          setState("unavailable");
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
          const destination = new URL(
            `/pricing/experience/${storeSlug}/book`,
            window.location.origin,
          );
          destination.searchParams.set("entry", body.entry);
          destination.hash = "booking-form";
          window.location.replace(destination.toString());
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
              {state === "expired" ? "LINE 登入已逾時" : "體驗預約暫時無法開啟"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-earth-600">
              {state === "expired" ? "請重新整理後再試一次。" : `請稍後再試，或直接聯繫${storeName}協助預約。`}
            </p>
            <div className="mt-5 grid gap-3">
              <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl bg-primary-600 px-4 text-sm font-bold text-white">
                重新嘗試
              </button>
              <a href={contactUrl} className="flex min-h-11 items-center justify-center rounded-xl border border-earth-200 px-4 text-sm font-semibold text-earth-700">
                聯繫{storeName}
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
