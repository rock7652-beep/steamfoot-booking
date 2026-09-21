import { Suspense } from "react";
import { isCourseSettingsPanel } from "@/lib/course-settings-panels";

/** Reuse the existing server pages, including each page's store/permission checks. */
export function CourseSettingsPanelContent({ panel, query }: { panel?: string; query?: string }) {
  if (!isCourseSettingsPanel(panel)) return null;
  return <Suspense key={`${panel}:${query ?? ""}`} fallback={<p role="status" className="p-6">正在讀取設定…</p>}><Content panel={panel} query={query} /></Suspense>;
}
async function Content({ panel, query }: { panel: string; query?: string }) {
  const searchParams = Promise.resolve(Object.fromEntries(new URLSearchParams(query)));
  switch (panel) {
    case "hours": { const { default: Page } = await import("./hours/page"); return <Page searchParams={searchParams} />; }
    case "duty": { const { default: Page } = await import("../settings/duty/page"); return <Page />; }
    case "trial": { const { default: Page } = await import("../settings/trial/page"); return <Page />; }
    case "unassigned": { const { default: Page } = await import("./unassigned-plans/page"); return <Page searchParams={searchParams} />; }
    case "reminders": { const { default: Page } = await import("./reminders/page"); return <Page searchParams={searchParams} />; }
    case "care": { const { default: Page } = await import("../growth/page"); return <Page searchParams={searchParams} />; }
    case "referral": { const { default: Page } = await import("../settings/referral-share/page"); return <Page />; }
    case "butler": { const { default: Page } = await import("../settings/digital-butler/page"); return <Page />; }
  }
}
