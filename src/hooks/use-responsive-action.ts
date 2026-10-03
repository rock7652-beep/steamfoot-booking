"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Result = { success: boolean; error?: string };
export type SaveState = { phase: "saving" | "checking" | "saved" | "error" | "unknown"; message: string };
export type SaveOutcome = "saved" | "error" | "unknown" | "ignored";
type Callbacks = {
  timingLabel?: "complete" | "revert";
  apply: () => void;
  rollback: () => void;
  confirmed?: () => void;
  /** Read-only. A stale/unchanged snapshot is NOT proof the write failed. */
  reconcile?: (signal: AbortSignal) => Promise<boolean>;
  recovered?: () => void;
};
const UNKNOWN = "暫時無法確認，請查看最新狀態。";

/** Shared per-row lock. Recovery can read the server, but never replays a write. */
export function useResponsiveAction() {
  const timings = useRef(new Map<string, { operation: "complete" | "revert"; started: number; responseMs?: number }>());
  const locks = useRef(new Set<string>());
  const recoveries = useRef(new Map<string, Callbacks>());
  const checks = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const [states, setStates] = useState<Record<string, SaveState>>({});

  // Runs after React commits the state that removes the row's saving indicator.
  // This measures a DOM commit, not an exact display-paint timestamp.
  useEffect(() => {
    for (const [key, timing] of timings.current) {
      const state = states[key];
      if (!state || state.phase === "saving" || state.phase === "checking") continue;
      timings.current.delete(key);
      const payload = {
        operation: timing.operation,
        outcome: state.phase,
        responseMs: Math.round(timing.responseMs ?? performance.now() - timing.started),
        committedMs: Math.round(performance.now() - timing.started),
      };
      // Diagnostics must never hold up or retry a booking write.
      void fetch("/api/bookings/client-timing", {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }, [states]);

  const check = useCallback(async (key: string): Promise<SaveOutcome> => {
    const callbacks = recoveries.current.get(key);
    if (!callbacks?.reconcile || checks.current.has(key) || !mounted.current) return "ignored";
    const controller = new AbortController();
    checks.current.set(key, controller);
    setStates(previous => ({ ...previous, [key]: { phase: "checking", message: "正在確認最新狀態…" } }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bound waiting, including when a read request itself never returns.
      const timeout = new Promise<boolean>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(false); }, 8000);
      });
      const confirmed = await Promise.race([callbacks.reconcile(controller.signal), timeout]);
      if (!mounted.current) return "ignored";
      if (confirmed && !controller.signal.aborted) {
        callbacks.recovered?.();
        recoveries.current.delete(key);
        locks.current.delete(key);
        setStates(previous => ({ ...previous, [key]: { phase: "saved", message: "已確認最新狀態" } }));
        return "saved";
      }
    } catch {
      // Keep the lock. A failed read says nothing about whether the write committed.
    } finally {
      clearTimeout(timer);
      controller.abort();
      checks.current.delete(key);
    }
    if (mounted.current) setStates(previous => ({ ...previous, [key]: { phase: "unknown", message: UNKNOWN } }));
    return "unknown";
  }, []);

  useEffect(() => {
    mounted.current = true;
    const onOnline = () => {
      for (const key of recoveries.current.keys()) void check(key);
    };
    window.addEventListener("online", onOnline);
    const controllers = checks.current;
    return () => {
      mounted.current = false;
      window.removeEventListener("online", onOnline);
      for (const controller of controllers.values()) controller.abort();
    };
  }, [check]);

  async function run(key: string, action: () => Promise<Result>, callbacks: Callbacks): Promise<SaveOutcome> {
    if (locks.current.has(key)) return "ignored";
    if (callbacks.timingLabel) timings.current.set(key, {
      operation: callbacks.timingLabel, started: performance.now(),
    });
    locks.current.add(key);
    setStates(previous => ({ ...previous, [key]: { phase: "saving", message: "儲存中…" } }));
    callbacks.apply();
    let result: Result;
    try {
      result = await action();
      const timing = timings.current.get(key);
      if (timing) timing.responseMs = performance.now() - timing.started;
      if (typeof result?.success !== "boolean") throw new Error("結果待確認");
    } catch {
      const timing = timings.current.get(key);
      if (timing) timing.responseMs = performance.now() - timing.started;
      if (!mounted.current) return "ignored";
      callbacks.rollback();
      if (callbacks.reconcile) {
        recoveries.current.set(key, callbacks);
        return check(key);
      }
      setStates(previous => ({ ...previous, [key]: { phase: "unknown", message: "結果待確認，請重新開啟此頁核對後再操作；輸入內容已保留。" } }));
      return "unknown";
    }
    if (!mounted.current) return "ignored";
    locks.current.delete(key);
    if (!result.success) {
      callbacks.rollback();
      setStates(previous => ({ ...previous, [key]: { phase: "error", message: result.error || "未儲存，請重試" } }));
      return "error";
    }
    setStates(previous => ({ ...previous, [key]: { phase: "saved", message: "已儲存" } }));
    callbacks.confirmed?.();
    return "saved";
  }
  return { states, run, check, isBlocked: (key: string) => locks.current.has(key) };
}
