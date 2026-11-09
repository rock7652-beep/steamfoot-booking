import {ReminderSettingsScope} from "./reminder-settings-list";
import type { ReactNode } from "react";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { ReminderTabs } from "@/app/(dashboard)/dashboard/reminders/reminder-tabs";
import { ReminderScheduleNote } from './reminder-schedule-note';

/** One center; each module supplies its authorized content and delivery state. */
export function ReminderCenter({ storeId, active, explicit, baseHref, returnHref, subtitle, enabled, blockedMessage, coach, music, beauty, before, children, timingNote }: {
  storeId: string; active: string; explicit: boolean; baseHref: string; returnHref: string;
  subtitle: string; enabled: boolean; blockedMessage?: string; coach?: boolean; music?: boolean; beauty?: boolean;
  before?: ReactNode; children: ReactNode;
  timingNote?: string;
}) {
  return <ReminderSettingsScope key={storeId}><PageShell>
    <PageHeader title="提醒管理" subtitle={subtitle} actions={<DashboardLink href={returnHref}>返回設定</DashboardLink>} />
    {before}
    {!enabled ? <p className="rounded-xl border border-earth-200 bg-white p-4">此店家尚未開通 LINE 提醒功能，請聯絡有權限的管理者調整店家功能。</p> : <div className="min-w-0 space-y-2">
      <ReminderScheduleNote note={timingNote}/>
      <ReminderTabs active={active} explicit={explicit} storeId={storeId} baseHref={baseHref} coach={coach} music={music} beauty={beauty} />
      {blockedMessage && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{blockedMessage}</p>}
      {children}
    </div>}
  </PageShell></ReminderSettingsScope>;
}
