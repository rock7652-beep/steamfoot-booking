"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { requestCourseDraftLeave } from "@/components/admin/use-course-draft-guard";
import type { ActionResult } from "@/types";

type PendingStore = { name: string; uncertain: boolean };
type SwitchStore = (name: string, action: () => Promise<ActionResult<never>>) => boolean;
const Context = createContext<{ pending: boolean; switchStore: SwitchStore } | null>(null);

/** Lives inside the server's account/store/permission-keyed OperationScope.
 * Only a confirmed new server scope unlocks a successful switch. Never relabel
 * the old store's data or reuse its permissions while the redirect is loading.
 */
export function StoreViewTransitionProvider({ children }: { children?: ReactNode }) {
  const [pending, setPending] = useState<PendingStore | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const [, startTransition] = useTransition();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const switchStore: SwitchStore = (name, action) => {
    // The shared synchronous lock also covers two selectors/banner clicks in
    // the same tick, before React can disable or hide either control.
    if (locked.current || !requestCourseDraftLeave()) return false;
    locked.current = true;
    setPending({ name, uncertain: false });
    startTransition(async () => {
      try {
        const result = await action();
        if (!mounted.current) return;
        if (result?.success === false) {
          // This action returns a failure only before changing the cookie.
          locked.current = false;
          setPending(null);
          toast.error(result.error ?? "切換店舖失敗，已保留原店舖");
        }
        // A redirect/empty response is not permission to reveal the old scope.
      } catch (error) {
        // Server Action redirects are framework control flow, not failures.
        unstable_rethrow(error);
        if (!mounted.current) return;
        // A lost response may follow a committed cookie update. Do not restore
        // writable UI until a fresh server render confirms the current scope.
        setPending({ name, uncertain: true });
      }
    });
    return true;
  };

  return <Context.Provider value={{ pending: !!pending, switchStore }}>
    <div data-store-view-content hidden={!!pending} inert={!!pending} aria-hidden={pending ? true : undefined}
      style={{ display: pending ? "none" : "contents" }}>{children}</div>
    {pending && <StoreSwitchProgress pending={pending} />}
  </Context.Provider>;
}

function StoreSwitchProgress({ pending }: { pending: PendingStore }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    // A native modal also makes portaled drawers inert. A z-index overlay alone
    // would leave their keyboard controls and old-store actions reachable.
    element.showModal();
    // Inert does not disable old drawers' document-level Escape/shortcut
    // listeners. Isolate keys before even document capture handlers run, while
    // retaining native Tab/Enter/Space defaults for the confirmation button.
    const isolateKey = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      if (event.key === "Escape") event.preventDefault();
    };
    const keyEvents = ["keydown", "keyup", "keypress"] as const;
    keyEvents.forEach(type => window.addEventListener(type, isolateKey, true));
    return () => {
      keyEvents.forEach(type => window.removeEventListener(type, isolateKey, true));
      element.close();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby="store-switch-title" onCancel={event => event.preventDefault()}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-earth-50 p-6 text-earth-900 backdrop:bg-earth-50">
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-3 [overflow-wrap:anywhere]">
      <div role={pending.uncertain ? "alert" : "status"} aria-live="polite">
        <h2 id="store-switch-title" className="text-lg font-semibold">{pending.uncertain ? "尚未確認切換結果" : `正在切換至「${pending.name}」`}</h2>
        <p className="mt-2 text-sm leading-6 text-earth-600">{pending.uncertain
          ? "連線中斷，請重新載入確認目前店舖後再操作。"
          : "正在確認店舖權限並載入資料，請稍候。"}</p>
      </div>
      {pending.uncertain ? <button type="button" onClick={() => window.location.reload()}
        className="min-h-11 self-start rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white">重新載入確認</button>
        : <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
          <div className="h-3 w-2/3 rounded bg-earth-200" /><div className="h-24 rounded-lg bg-earth-100" />
        </div>}
    </div>
  </dialog>;
}

export function useStoreViewTransition() {
  const context = useContext(Context);
  if (!context) throw new Error("Store switch controls require OperationScope");
  return context;
}
