"use client";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { SettingsPanelContext } from "@/components/admin/settings-panel-context";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { decodeReminderPanel } from "@/lib/reminder-panel-wire";
import type { ReminderPanelData } from "@/server/queries/reminder-panel";
import { SteamReminderView } from "./steam-reminder-view";
import { CourseReminderView } from "../courses/reminders/course-reminder-view";

/** Same scope as OperationScope, no persisted or completed-response caching. */
export function ReminderPanelReader({ initial }: { initial: ReminderPanelData }) {
  return <ReminderPanelSession key={`${initial.module}:${initial.storeId}:${initial.actorId}`} initial={initial} />;
}
function ReminderPanelSession({ initial }: { initial: ReminderPanelData }) {
  const [data, setData] = useState(initial);
  const [serverSnapshot, setServerSnapshot] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryHref, setRetryHref] = useState("");
  const latest = useRef(0);
  const register = useContext(SettingsPanelContext)?.registerReader;
  if (serverSnapshot !== initial) {
    setServerSnapshot(initial);
    // A late hydration/refresh of the old tab must not erase an in-flight read
    // or a newer local tab. Same-tab action refreshes still update server props.
    const current = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("panelQuery");
    const key = (params: Record<string, string | undefined>) => JSON.stringify(Object.entries(params).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)));
    if (!register || (!loading && current !== null && key(Object.fromEntries(new URLSearchParams(current))) === key(initial.params))) setData(initial);
  }
  const fetchData = useCallback(async (query: string) => {
    const params = new URLSearchParams({ module: initial.module, expectedStoreId: initial.storeId, expectedActorId: initial.actorId, query });
    const response = await fetch(`/api/settings/reminder-panel?${params}`, {
      credentials: "same-origin", cache: "no-store", headers: { "x-reminder-panel": "1" }, signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error ?? "提醒資料讀取失敗，請重試。");
    if (result.storeId !== initial.storeId || result.module !== initial.module || result.query !== query) throw new Error("店舖已變更，請重新開啟提醒管理。");
    const next = decodeReminderPanel<ReminderPanelData>(result.data);
    if (next.storeId !== initial.storeId || next.module !== initial.module || next.actorId !== initial.actorId) throw new Error("讀取結果不符，請重新開啟提醒管理。");
    return next;
  }, [initial.module, initial.storeId, initial.actorId]);
  const reader = usePanelReader("reminder-panel", fetchData, `${initial.module}:${initial.storeId}:${initial.actorId}`, 0);
  const read = useCallback((href: string): Promise<void> | null => {
    const target = new URL(href, window.location.origin), current = new URL(window.location.href);
    if (target.origin !== current.origin || target.pathname !== current.pathname || target.searchParams.get("panel") !== "reminders") return null;
    const query = target.searchParams.get("panelQuery") ?? "";
    const revision = ++latest.current;
    setLoading(true);
    setRetryHref(href);
    return reader.read(query).then(next => {
      if (revision !== latest.current) return;
      setError("");
      setData(next);
      window.history.replaceState(null, "", href);
    }).catch((failure: unknown) => {
      if (revision === latest.current) setError(failure instanceof Error ? failure.message : "提醒資料讀取失敗，請重試。");
    }).finally(() => { if (revision === latest.current) setLoading(false); });
  }, [reader]);
  useEffect(() => register?.(read), [register, read]);
  useEffect(() => () => { ++latest.current; reader.clear(); }, [reader]);
  if (error) return <div role="alert" className="p-4"><p>{error}</p><button type="button" disabled={loading} className="mt-3 min-h-11 rounded border px-4" onClick={() => { void read(retryHref); }}>{loading ? "正在重新讀取…" : "重新讀取"}</button></div>;
  return data.module === "course" ? <CourseReminderView key={JSON.stringify(data.params)} data={data} /> : <SteamReminderView key={JSON.stringify(data.params)} data={data} />;
}
