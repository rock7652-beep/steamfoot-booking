"use client";
import { useSyncExternalStore } from "react";

export function sportsWorkspaceLocationView(search: string, hash: string) {
  const match = /^#sports-(schedule|catalog|plans)$/.exec(hash);
  return match?.[1] ?? new URLSearchParams(search).get("view") ?? "schedule";
}
function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}
export function useSportsWorkspaceView(initialView = "schedule") {
  return useSyncExternalStore(subscribe,
    () => sportsWorkspaceLocationView(window.location.search, window.location.hash),
    () => initialView);
}
export function selectSportsWorkspaceView(view: string) {
  // Native fragments keep the rewritten route and its server data intact.
  window.location.hash = `sports-${view}`;
}
export function sportsWorkspaceRouteQuery(query: string, view: string) {
  const params = new URLSearchParams(query);
  if (view === "schedule") params.delete("view");
  else params.set("view", view);
  return params.toString();
}
