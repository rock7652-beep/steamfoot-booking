"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

type Operation = "toggle" | "form";

/** Independent preferences can save together; only duplicate writes to one key are blocked. */
export function useKeyedReminderMutation() {
  const locks = useRef(new Set<string>());
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mounted = useRef(false);
  const [, start] = useTransition();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function run(key: string, action: () => Promise<unknown>, onSuccess: () => void, optimistic?: () => () => void) {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setPendingKeys([...locks.current]);
    setErrors(current => ({ ...current, [key]: "" }));
    start(async () => {
      const rollback = optimistic?.();
      const fail = (message: string) => {
        start(() => rollback?.());
        setErrors(current => ({ ...current, [key]: message }));
        toast.error(message);
      };
      try {
        const result = await action();
        if (!mounted.current) return;
        if (result && typeof result === "object" && "success" in result && result.success === true) onSuccess();
        else fail(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "尚未確認儲存結果，請稍後再試。");
      } catch {
        if (mounted.current) fail("尚未確認儲存結果，請稍後再試。");
      } finally {
        locks.current.delete(key);
        if (mounted.current) setPendingKeys([...locks.current]);
      }
    });
  }
  return { run, pending: pendingKeys.length > 0, pendingKeys, isPending: (key: string) => pendingKeys.includes(key), errors };
}

/** Local to each card: serialize writes without conflating their feedback. */
export function useReminderSettingMutation() {
  const [operation, setOperation] = useState<Operation | null>(null);
  const [errors, setErrors] = useState({ toggle: "", form: "" });
  const busy = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function run(kind: Operation, action: () => Promise<unknown>, onSuccess: () => void, optimistic?: () => () => void) {
    // React has not necessarily rendered the disabled control on a second click.
    if (busy.current) return;
    busy.current = true;
    setOperation(kind);
    setErrors(current => ({ ...current, [kind]: "" }));
    const rollback = optimistic?.();

    const unknownResult = kind === "toggle"
      ? "尚未確認開關儲存結果，請稍後再試。"
      : "尚未確認儲存結果，輸入內容已保留，請稍後再試。";
    const reportError = (message: string) => {
      rollback?.();
      setErrors(current => ({ ...current, [kind]: message }));
      toast.error(message);
    };

    try {
      const result = await action();
      // The enclosing store/account scope remounts cards. Ignore its old reply.
      if (!mounted.current) return;
      if (result && typeof result === "object" && "success" in result) {
        if (result.success === true) {
          onSuccess();
          return;
        }
        if (result.success === false && "error" in result && typeof result.error === "string" && result.error.trim()) {
          reportError(result.error);
          return;
        }
      }
      reportError(unknownResult);
    } catch {
      if (mounted.current) reportError(unknownResult);
    } finally {
      busy.current = false;
      if (mounted.current) setOperation(null);
    }
  }

  return {
    run,
    pending: operation !== null,
    togglePending: operation === "toggle",
    formPending: operation === "form",
    toggleError: errors.toggle,
    formError: errors.form,
  };
}

export function ReminderSettingToggle({ enabled, pending, disabled, label, onToggle }: {
  enabled: boolean;
  pending: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span role="status" aria-live="polite" className="w-16 shrink-0 whitespace-nowrap text-right text-sm text-earth-500">
        {pending ? "儲存中…" : enabled ? "開啟" : "關閉"}
      </span>
      <button
        type="button"
        onClick={event => { event.preventDefault(); onToggle(); }}
        disabled={disabled}
        aria-label={label}
        aria-busy={pending}
        role="switch"
        aria-checked={enabled}
        className="flex min-h-11 w-12 shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden="true" className={`relative h-7 w-12 rounded-full ${enabled ? "bg-primary-600" : "bg-earth-300"}`}>
          <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : ""}`} />
        </span>
      </button>
      <span aria-hidden="true" className="text-earth-400 transition group-open:rotate-180">⌄</span>
    </div>
  );
}
