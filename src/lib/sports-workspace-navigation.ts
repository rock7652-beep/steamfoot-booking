export function sportsWorkspaceTab(view?: string | null) {
  return view === "catalog" ? "教學項目" : view === "plans" ? "收費方式" : "課表";
}
export function sportsWorkspaceView(tab: string) {
  return tab === "教學項目" ? "catalog" : tab === "收費方式" ? "plans" : "schedule";
}
