"use client";
import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";

/** Closing removes local panel URL state without refetching the background page. */
export function useSettingsPanelDismissal(searchString: string) {
  const [state, setState] = useState({ searchString, dismissed: false });
  const dismissed = state.searchString === searchString ? state.dismissed : state.dismissed && !new URLSearchParams(searchString).has("panel");
  if (state.searchString !== searchString) setState({ searchString, dismissed });
  const dismiss = useCallback((href: string) => {
    window.history.replaceState(null, "", href);
    setState({ searchString, dismissed: true });
  }, [searchString]);
  return { dismissed, dismiss };
}

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
