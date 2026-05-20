"use client";

import { useEffect, useState } from "react";
import { initLiff, isInLineClient, LiffInitError } from "@/lib/liff/client";

type State =
  | { status: "loading" }
  | { status: "ready"; inClient: boolean }
  | { status: "error"; message: string };

export function LiffShell({
  storeName,
  storeSlug,
  liffId,
}: {
  storeName: string;
  storeSlug: string;
  liffId: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initLiff(liffId);
        if (cancelled) return;
        setState({ status: "ready", inClient: isInLineClient() });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof LiffInitError
            ? err.message
            : err instanceof Error
              ? err.message
              : "LIFF 初始化失敗";
        setState({ status: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">LINE Mini App</p>
        <h1 className="mt-2 text-2xl font-semibold text-earth-900">{storeName}</h1>
        <p className="mt-1 text-xs text-earth-500">/s/{storeSlug}/liff</p>
      </header>

      {state.status === "loading" && <LoadingBlock />}
      {state.status === "error" && <ErrorBlock message={state.message} />}
      {state.status === "ready" && <ReadyBlock inClient={state.inClient} />}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-8 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
        aria-hidden
      />
      <p className="text-sm text-earth-600">LIFF 初始化中…</p>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-900">
      <p className="font-medium">LIFF 無法載入</p>
      <p className="text-xs text-red-700 break-words">{message}</p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
        className="self-start rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
      >
        重新載入
      </button>
    </div>
  );
}

function ReadyBlock({ inClient }: { inClient: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-earth-200 bg-white px-4 py-4 text-xs text-earth-600">
        {inClient
          ? "已在 LINE App 內開啟。"
          : "目前不在 LINE 內，部分功能（登入、關閉視窗）將無法使用。"}
      </div>

      <DisabledCta label="預約體驗" hint="即將開放" />
      <DisabledCta label="我的資料" hint="即將開放" />

      <p className="px-1 text-xs text-earth-500">
        LIFF MVP 階段：此入口僅驗證 SDK 初始化。預約、會員、綁定流程將於後續版本陸續上線。
      </p>
    </div>
  );
}

function DisabledCta({ label, hint }: { label: string; hint: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      className="flex w-full items-center justify-between rounded-xl border border-earth-200 bg-earth-100 px-4 py-3 text-left text-earth-500"
    >
      <span className="text-base font-medium">{label}</span>
      <span className="text-xs">{hint}</span>
    </button>
  );
}
