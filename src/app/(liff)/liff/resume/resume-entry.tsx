"use client";

import { useEffect, useState } from "react";
import { closeWindow, getIDToken, initLiff, isInLineClient } from "@/lib/liff/client";
import { refreshLiffSession } from "@/lib/liff/session-refresh";

type State =
  | { kind: "checking" | "expired" | "unavailable" }
  | { kind: "login"; login: () => void }
  | { kind: "review"; referenceId?: string };

export function LiffResumeEntry({ liffId, storeSlug, target, primary }: {
  liffId: string;
  storeSlug: string;
  target: string;
  primary: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const deadline = window.setTimeout(() => {
      controller.abort();
      setState({ kind: "unavailable" });
    }, 12_000);
    const { signal } = controller;

    async function resume() {
      try {
        const sdk = await initLiff(liffId);
        // At the primary redirect the SDK takes the browser to /resume.
        if (signal.aborted || primary) return;
        if (!isInLineClient() && !sdk.isLoggedIn()) {
          setState({ kind: "login", login: () => sdk.login({ redirectUri: window.location.href }) });
          return;
        }

        const result = await refreshLiffSession({ storeSlug, idToken: getIDToken() ?? "" }, undefined, signal);
        if (signal.aborted) return;
        if (result.status === "session_created") {
          window.location.replace(target);
        } else if (result.status === "need_onboarding") {
          window.location.replace(`/s/${storeSlug}/liff/onboarding`);
        } else if (result.status === "identity_review_required") {
          setState({ kind: "review", referenceId: result.referenceId });
        } else {
          setState({ kind: result.status === "expired" ? "expired" : "unavailable" });
        }
      } catch {
        if (!signal.aborted) setState({ kind: "unavailable" });
      } finally {
        if (!primary) window.clearTimeout(deadline);
      }
    }
    void resume();
    return () => {
      controller.abort();
      window.clearTimeout(deadline);
    };
  }, [liffId, primary, retry, storeSlug, target]);

  const actionClass = "min-h-11 rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white";
  return (
    <section className="mx-auto grid w-full max-w-md gap-3 px-4 py-12 text-center">
      {state.kind === "checking" && <p role="status">正在確認 LINE 身分…</p>}
      {state.kind === "login" && <>
        <p>請使用 LINE 驗證身分，完成後會回到原頁。</p>
        <button className={actionClass} type="button" onClick={() => {
          try { state.login(); } catch { setState({ kind: "unavailable" }); }
        }}>用 LINE 驗證</button>
      </>}
      {state.kind === "expired" && <>
        <p role="status">LINE 尚未完成驗證。請關閉此頁，再從 LINE 選單開啟會員中心。</p>
        <button className={actionClass} type="button" onClick={closeWindow}>關閉頁面</button>
      </>}
      {state.kind === "unavailable" && <>
        <p role="status">暫時無法確認會員身分，請再試一次。</p>
        <button className={actionClass} type="button" onClick={() => {
          if (primary) {
            window.location.reload();
          } else {
            setState({ kind: "checking" });
            setRetry((count) => count + 1);
          }
        }}>再試一次</button>
      </>}
      {state.kind === "review" && <p role="status">請聯繫店家確認會員身分。{state.referenceId && ` 查核編號：${state.referenceId}`}</p>}
    </section>
  );
}
