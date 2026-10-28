"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  acknowledgeCoursePurchaseIntent,
  cancelCoursePurchaseIntent,
  getCoursePurchaseIntent,
  getPendingCoursePurchaseIntent,
  prepareCoursePurchaseIntent,
} from "@/server/actions/course-purchase-intent";
import { createPurchaseIntentCoordinator, type PurchaseIntentTransport, type PurchaseRecoveryState } from "@/lib/purchase-intent-coordinator";
import { CHECKOUT_OUTCOME_UNCONFIRMED, type MusicMutationResult } from "@/lib/music-checkout-transport";

export type CheckoutInput = Record<string, unknown> & { customerId: string; requestKey: string };
type Scope = { enabled: boolean; storeId: string; family?: string; transport?: PurchaseIntentTransport<CheckoutInput> };
const PurchaseIntentScope = createContext<Scope>({ enabled: false, storeId: "" });

/** The server chooses the rollout state and selected store; the browser cannot enable it. */
export function CoursePurchaseIntentProvider({ enabled, storeId, family, transport, children }: Scope & { children?: React.ReactNode }) {
  return <PurchaseIntentScope.Provider value={{ enabled, storeId, family, transport }}>{children}</PurchaseIntentScope.Provider>;
}

type Controller = ReturnType<typeof createPurchaseIntentCoordinator<CheckoutInput>>;
type ViewState = PurchaseRecoveryState | { kind: "checking" } | { kind: "inactive" };

// Timeouts only stop waiting: late server operations may still complete.
// Never automatically retry a mutation or treat a timeout as a rollback.
const REQUEST_TIMEOUT_MS = 8_000;
function boundedRequest<T>(request: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("purchase request timed out")), REQUEST_TIMEOUT_MS);
    Promise.resolve().then(request).then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export function useCoursePurchaseRecovery(customerId: string | undefined, active: boolean) {
  const scope = useContext(PurchaseIntentScope);
  const enabled = scope.enabled && active;
  const scopeKey = JSON.stringify([enabled, scope.family ?? "course", scope.storeId, customerId ?? ""]);
  const [confirmedScope, setConfirmedScope] = useState("");
  const confirmed = enabled && confirmedScope === scopeKey;
  const [rendered, setRendered] = useState<{ key: string; value: ViewState }>({ key: "", value: { kind: "checking" } });
  const view: ViewState = !enabled ? { kind: "inactive" } : rendered.key === scopeKey ? rendered.value : { kind: "checking" };
  const [busy, setBusy] = useState(false);
  const controller = useRef<Controller | null>(null);
  const currentView = useRef<ViewState>(view);
  currentView.current = view;
  const generation = useRef(0);
  const running = useRef(false);
  const currentScope = useRef({ enabled, storeId: scope.storeId, customerId, family: scope.family, transport: scope.transport });
  currentScope.current = { enabled, storeId: scope.storeId, customerId, family: scope.family, transport: scope.transport };
  const setState = useCallback((next: ViewState) => { currentView.current = next; setRendered({ key: scopeKey, value: next }); }, [scopeKey]);

  useEffect(() => {
    const generationRef = generation;
    const version = ++generationRef.current;
    controller.current = null;
    running.current = false;
    setBusy(false);
    if (!enabled) { setState({ kind: "inactive" }); return; }
    if (!scope.storeId || !customerId) { setState({ kind: "checking" }); return; }
    setState({ kind: "checking" });
    let coordinator: Controller;
    try {
      const transport: PurchaseIntentTransport<CheckoutInput> = scope.transport ?? {
          prepare: async (input, requestKey) => {
            const result = await prepareCoursePurchaseIntent({ ...input, requestKey });
            return result.success && !result.data ? { success: false, error: "購買狀態尚未確認" } : result;
          },
          get: (id, requestKey) => getCoursePurchaseIntent({ customerId: id, requestKey }),
          getPending: id => getPendingCoursePurchaseIntent({ customerId: id }),
          cancel: async (id, requestKey) => {
            const result = await cancelCoursePurchaseIntent({ customerId: id, requestKey });
            return result.success && !result.data ? { success: false, error: "購買狀態尚未確認" } : result;
          },
          acknowledge: async (id, requestKey) => {
            const result = await acknowledgeCoursePurchaseIntent({ customerId: id, requestKey });
            return result.success && !result.data ? { success: false, error: "購買狀態尚未確認" } : result;
          },
        };
      coordinator = createPurchaseIntentCoordinator<CheckoutInput>({
        family: scope.family ?? "course", storeId: scope.storeId, customerId,
        storage: window.sessionStorage, randomUUID: () => crypto.randomUUID(),
        transport: {
          prepare: (input, key) => boundedRequest(() => transport.prepare(input, key)),
          get: (id, key) => boundedRequest(() => transport.get(id, key)),
          getPending: id => boundedRequest(() => transport.getPending(id)),
          cancel: (id, key) => boundedRequest(() => transport.cancel(id, key)),
          acknowledge: (id, key) => boundedRequest(() => transport.acknowledge(id, key)),
        },
      });
    } catch { setState({ kind: "uncertain", reason: "storage" }); return; }
    controller.current = coordinator;
    void coordinator.inspect().then(next => { if (version === generation.current) setState(next); });
    return () => { ++generationRef.current; controller.current = null; };
  }, [active, customerId, enabled, scope.family, scope.storeId, scope.transport, setState]);

  const execute = useCallback(async (work: (item: Controller) => Promise<PurchaseRecoveryState>) => {
    const item = controller.current;
    if (!item || running.current) return null;
    running.current = true;
    const version = generation.current;
    setBusy(true);
    try {
      const next = await work(item);
      if (version !== generation.current) return null;
      setState(next);
      return next;
    } finally {
      if (version === generation.current) { running.current = false; setBusy(false); }
    }
  }, [setState]);

  const prepare = useCallback(async (input: CheckoutInput): Promise<CheckoutInput | null> => {
    if (!enabled) return input;
    if (!customerId || input.customerId !== customerId) return null;
    const expected = generation.current;
    const previous = currentView.current;
    if (previous.kind === "checking" || previous.kind === "inactive" || previous.kind === "uncertain" || (previous.kind === "intent" && previous.intent.status !== "PREPARED")) return null;
    const next = await execute(item => previous.kind === "none-known" ? item.start(input) : item.retry(input));
    if (expected !== generation.current || !currentScope.current.enabled || currentScope.current.customerId !== input.customerId || currentScope.current.storeId !== scope.storeId || currentScope.current.family !== scope.family || currentScope.current.transport !== scope.transport) return null;
    if (next?.kind !== "intent" || next.intent.status !== "PREPARED") return null;
    return { ...input, requestKey: next.intent.requestKey };
  }, [customerId, enabled, execute, scope.family, scope.storeId, scope.transport]);

  const inspect = useCallback(() => execute(item => item.inspect()), [execute]);
  const cancel = useCallback(() => execute(item => item.cancel()), [execute]);
  const acknowledge = useCallback((status: "COMMITTED" | "CANCELLED") => execute(item => item.acknowledge(status)), [execute]);
  const submit = useCallback(async (input: CheckoutInput, send: (input: CheckoutInput) => Promise<MusicMutationResult>): Promise<MusicMutationResult & { discarded?: boolean }> => {
    const version = generation.current;
    const sameScope = () => version === generation.current && currentScope.current.enabled && currentScope.current.customerId === input.customerId && currentScope.current.storeId === scope.storeId && currentScope.current.family === scope.family && currentScope.current.transport === scope.transport;
    const prepared = await prepare(input);
    if (!prepared) return enabled && !sameScope() ? { success: false, discarded: true } : { success: false, error: CHECKOUT_OUTCOME_UNCONFIRMED };
    if (!enabled) return send(prepared);
    if (!sameScope()) return { success: false, discarded: true };
    let result: MusicMutationResult;
    try { result = await boundedRequest(() => send(prepared)); }
    catch { result = { success: false, error: CHECKOUT_OUTCOME_UNCONFIRMED }; }
    if (!sameScope()) return { success: false, discarded: true };
    if (result.success) {
      // Keep the server blocker until the operator sees and acknowledges the
      // completed purchase. A lost response must never release another device.
      setConfirmedScope(scopeKey);
      // The server has already confirmed the transaction. Show the receipt
      // immediately while rechecking its durable state in the background; the
      // confirmed scope keeps the form blocked until explicit acknowledgement.
      void inspect().catch(() => {});
      return sameScope() ? result : { success: false, discarded: true };
    }
    const state = await inspect();
    if (!sameScope()) return { success: false, discarded: true };
    if (state?.kind === "intent" && state.intent.status === "COMMITTED") {
      setConfirmedScope(scopeKey);
      return { success: true };
    }
    // Even a readable business error does not establish whether a late request
    // can still commit. Preserve the useful error without implying rollback.
    const detail = result.error?.trim();
    return { success: false, error: detail && detail !== CHECKOUT_OUTCOME_UNCONFIRMED ? `${detail} ${CHECKOUT_OUTCOME_UNCONFIRMED}` : CHECKOUT_OUTCOME_UNCONFIRMED };
  }, [enabled, inspect, prepare, scope.family, scope.storeId, scope.transport, scopeKey]);
  const blocked = enabled && (!customerId || busy || confirmed || view.kind === "checking" || view.kind === "uncertain" || (view.kind === "intent" && view.intent.status !== "PREPARED"));

  const finishAcknowledgement = useCallback(async (status: "COMMITTED" | "CANCELLED") => {
    const result = await acknowledge(status);
    if (result?.kind === "none-known") setConfirmedScope("");
    return result;
  }, [acknowledge]);
  return { enabled, view, busy, blocked, confirmed, submit, inspect, cancel, acknowledge: finishAcknowledgement };
}

export function CoursePurchaseRecoveryNotice({ recovery, disabled, onCommitted }: {
  recovery: ReturnType<typeof useCoursePurchaseRecovery>; disabled: boolean; onCommitted: () => void;
}) {
  if (!recovery.enabled || recovery.view.kind === "inactive" || recovery.view.kind === "none-known") return null;
  if (recovery.view.kind === "checking") return <p role="status" className="rounded-lg bg-earth-50 p-3 text-sm">正在確認購買狀態…</p>;
  const state = recovery.view;
  const pending = disabled || recovery.busy;
  const button = "min-h-11 rounded-lg border border-earth-300 px-3 py-2 text-sm disabled:opacity-50";
  if (recovery.confirmed && (state.kind !== "intent" || state.intent.status !== "COMMITTED")) return <section role="status" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>購買已完成，狀態仍在核對中，請勿再次收款。</p><button type="button" className={button} disabled={pending} onClick={() => void recovery.inspect()}>重新核對</button></section>;
  if (state.kind === "uncertain") return <section role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>{state.reason === "storage" ? "無法讀取原購買請求，請勿再次收款並聯絡管理員核對。" : "購買結果尚未確認。查無紀錄不代表失敗，請勿再次收款；可重新核對或安全取消原請求。"}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={pending} onClick={() => void recovery.inspect()}>重新核對</button>{state.reason !== "storage" && <button type="button" className={button} disabled={pending} onClick={() => void recovery.cancel()}>安全取消原請求</button>}</div></section>;
  if (state.intent.status === "PREPARED") return <section role="status" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>此學員有一筆待確認購買。請先核對，勿再次收款；也可安全取消原請求，或重新填寫原資料以相同請求核對後送出。</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={pending} onClick={() => void recovery.inspect()}>重新核對</button><button type="button" className={button} disabled={pending} onClick={() => void recovery.cancel()}>安全取消原請求</button></div></section>;
  const committed = state.intent.status === "COMMITTED";
  return <section role="status" className="space-y-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-900"><p>{committed ? "這筆購買已完成，請勿再次收款。" : "原購買請求已安全取消。"}</p><button type="button" className={button} disabled={pending} onClick={() => void recovery.acknowledge(committed ? "COMMITTED" : "CANCELLED").then(next => { if (committed && next?.kind === "none-known") onCommitted(); })}>{committed ? "確認完成並繼續購買" : "確認取消"}</button></section>;
}
