"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

/** Closing removes local panel URL state without refetching the background page. */
export function useSettingsPanelDismissal(searchString: string) {
  const [state, setState] = useState({ searchString, dismissed: false });
  const hasPanel = new URLSearchParams(searchString).has("panel");
  const [urlManaged] = useState(hasPanel);
  const dismissed = (urlManaged && !hasPanel) || (state.searchString === searchString && state.dismissed);
  if (state.searchString !== searchString) setState({ searchString, dismissed });
  const dismiss = useCallback((href: string) => {
    window.history.replaceState(null, "", href);
    setState({ searchString, dismissed: true });
  }, [searchString]);
  return { dismissed, dismiss };
}

export type SettingsPanelState = { dirty: boolean; pending: boolean };
export type SettingsPanelReader = (href: string) => Promise<void> | null;
/** Only the active panel may register a narrow, authenticated data reader. */
export function useSettingsPanelReaderHost() {
  const reader = useRef<SettingsPanelReader | null>(null);
  const registerReader = useCallback((next: SettingsPanelReader) => {
    reader.current = next;
    return () => { if (reader.current === next) reader.current = null; };
  }, []);
  return { reader, registerReader };
}
export const SettingsPanelContext = createContext<{
  report: (id: string, state: SettingsPanelState | null) => void;
  navigate: (href: string) => void;
  registerReader?: (reader: SettingsPanelReader) => () => void;
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
