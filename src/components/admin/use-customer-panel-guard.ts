"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { SettingsPanelState } from "./settings-panel-context";

/** Collect the existing note, attribution and LINE guards in a customer workspace. */
export function useCustomerPanelGuard() {
  const states = useRef(new Map<string, SettingsPanelState>());
  const [summary, setSummary] = useState({ dirty: false, pending: false });
  const report = useCallback((id: string, state: SettingsPanelState | null) => {
    if (state) states.current.set(id, state);
    else states.current.delete(id);
    const rows = [...states.current.values()];
    const next = { dirty: rows.some(row => row.dirty), pending: rows.some(row => row.pending) };
    setSummary(old => old.dirty === next.dirty && old.pending === next.pending ? old : next);
  }, []);
  const allowLeave = useCallback(() => {
    const rows = [...states.current.values()];
    return !rows.some(row => row.pending) &&
      (!rows.some(row => row.dirty) || window.confirm("尚有未儲存的修改，確定離開？"));
  }, []);
  const context = useMemo(() => ({ report, navigate: () => {} }), [report]);
  return { ...summary, context, allowLeave };
}
