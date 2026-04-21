"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * useOneShotActionState
 *
 * 把 useActionState 成功/失敗結果轉成「每筆 state 只處理一次」的副作用。
 *
 * 為什麼要有它：
 * 直覺寫法 `useEffect(() => { if (state.success) toast.success(...); router.refresh(); }, [state, router, updateSession])`
 * 在呼叫 updateSession() / router.refresh() 後，SessionProvider 或 router 會 re-render，
 * 讓 deps 的 reference 改變；但 state.success 仍是 true，effect 會再次觸發，
 * 形成 toast + refresh + re-render + toast 的 feedback loop（曾在 /profile 炸出 30–50 次 toast）。
 *
 * 本 hook 用 `handledRef` 比對 state object reference，每筆 state 只 handle 一次。
 * 同時強制 toast 帶固定 id，交給 sonner 做 dedupe 作為第二道防線。
 *
 * 使用時機：
 *   ✅ useActionState + useEffect 監聽 state.success/error + router.refresh/push/replace/updateSession/window.location
 *   ✅ 任何在 effect 裡對成功/失敗事件做副作用的表單
 *   ❌ 把副作用寫在 useActionState 的 action body 內時（那種寫法本身就不會 loop，直接寫即可）
 */

export type OneShotActionState = {
  success?: boolean;
  error?: string | null;
};

type Options<S extends OneShotActionState> = {
  state: S;
  /** sonner toast id — 固定 id 讓重複觸發仍只有一則 toast 顯示 */
  successToastId?: string;
  errorToastId?: string;
  /** 直接由 hook 顯示 success toast；若要客製化 toast（含 dest、描述等），改用 onSuccess */
  successMessage?: string | ((state: S) => string);
  /** state.success === true 時執行；在此放 updateSession / router.refresh / redirect */
  onSuccess?: (state: S) => void | Promise<void>;
  /** state.error 有值時執行；預設會以 errorToastId 顯示 toast.error(state.error) */
  onError?: (error: string, state: S) => void | Promise<void>;
};

export function useOneShotActionState<S extends OneShotActionState>({
  state,
  successToastId,
  errorToastId,
  successMessage,
  onSuccess,
  onError,
}: Options<S>) {
  const handledRef = useRef<S | null>(null);

  useEffect(() => {
    // 同一個 state 物件只處理一次 — 即使 deps 因 router/updateSession/parent re-render
    // 讓 effect 重跑，也不會再觸發 toast 或 callback。
    if (handledRef.current === state) return;
    handledRef.current = state;

    if (state.success) {
      if (successMessage) {
        const msg =
          typeof successMessage === "function" ? successMessage(state) : successMessage;
        toast.success(msg, successToastId ? { id: successToastId } : undefined);
      }
      if (onSuccess) void onSuccess(state);
      return;
    }

    if (state.error) {
      if (onError) {
        void onError(state.error, state);
      } else {
        toast.error(state.error, errorToastId ? { id: errorToastId } : undefined);
      }
    }
    // 故意不把 callback / message 放進 deps — 它們通常每次 render 都是新 reference，
    // 會讓「state 尚未變但 effect 重跑」的狀況再次出現。state 本身 change 才是觸發條件。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
