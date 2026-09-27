"use client";

import { useRef, useState } from "react";

type Result = { success: boolean; error?: string };
export type SaveState = { phase: "saving" | "saved" | "error" | "unknown"; message: string };

/** Per-row synchronous lock; an interrupted response must never be retried blindly. */
export function useResponsiveAction() {
  const locks = useRef(new Set<string>());
  const [states, setStates] = useState<Record<string, SaveState>>({});
  async function run(key: string, action: () => Promise<Result>, callbacks: {
    apply: () => void;
    rollback: () => void;
    confirmed?: () => void;
  }) {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    const state = (phase: SaveState["phase"], message: string) =>
      setStates(previous => ({ ...previous, [key]: { phase, message } }));
    state("saving", "儲存中…");
    callbacks.apply();
    let result: Result;
    try {
      result = await action();
    } catch {
      callbacks.rollback();
      state("unknown", "結果待確認，請重新開啟此頁核對後再操作；輸入內容已保留。");
      return; // Retain the lock: the server may already have committed.
    }
    if (!result.success) {
      callbacks.rollback();
      state("error", result.error || "未儲存，請重試");
    } else {
      state("saved", "已儲存");
      callbacks.confirmed?.();
    }
    locks.current.delete(key);
  }
  return { states, run, isBlocked: (key: string) => locks.current.has(key) };
}
