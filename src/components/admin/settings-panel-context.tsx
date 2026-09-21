"use client";
import { createContext, useContext, useEffect, useId } from "react";

export type SettingsPanelState = { dirty: boolean; pending: boolean };
export const SettingsPanelContext = createContext<{
  report: (id: string, state: SettingsPanelState | null) => void;
  navigate: (href: string) => void;
} | null>(null);

/** Optional: standalone pages retain their original behavior. */
export function useSettingsPanelGuard(dirty: boolean, pending: boolean) {
  const context = useContext(SettingsPanelContext);
  const report = context?.report;
  const id = useId();
  useEffect(() => { report?.(id, { dirty, pending }); }, [report, id, dirty, pending]);
  useEffect(() => () => report?.(id, null), [report, id]);
}
export function useSettingsPanelNavigation() {
  return useContext(SettingsPanelContext)?.navigate;
}
