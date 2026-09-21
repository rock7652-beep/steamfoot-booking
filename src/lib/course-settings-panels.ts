export const COURSE_SETTINGS_PANELS = {
  hours: { title: "營業、公休與預約開放", section: "booking", href: "/dashboard/courses/hours", width: 1040 },
  duty: { title: "值班聯動", section: "booking", href: "/dashboard/settings/duty", width: 760 },
  trial: { title: "體驗設定", section: "payment", href: "/dashboard/settings/trial", width: 880 },
  unassigned: { title: "未指派方案提醒", section: "notifications", href: "/dashboard/courses/unassigned-plans", width: 880 },
  reminders: { title: "提醒管理", section: "notifications", href: "/dashboard/courses/reminders", width: 1040 },
  care: { title: "顧客關懷", section: "notifications", href: "/dashboard/growth", width: 1040 },
  referral: { title: "推薦分享", section: "notifications", href: "/dashboard/settings/referral-share", width: 1040 },
  butler: { title: "數位管家", section: "notifications", href: "/dashboard/settings/digital-butler", width: 1040 },
} as const;
export type CourseSettingsPanel = keyof typeof COURSE_SETTINGS_PANELS;
export function isCourseSettingsPanel(value?: string | null): value is CourseSettingsPanel {
  return !!value && Object.hasOwn(COURSE_SETTINGS_PANELS, value);
}
export function courseSettingsPanelHref(href: string): string {
  const [path, query] = href.split("?");
  const entry = Object.entries(COURSE_SETTINGS_PANELS).find(([, panel]) => panel.href === path);
  if (!entry) return href;
  const params = new URLSearchParams({ view: "settings", section: entry[1].section, panel: entry[0] });
  if (query) params.set("panelQuery", query);
  return `/dashboard/courses?${params}`;
}
