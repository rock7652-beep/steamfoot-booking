"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ContextType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import { InfoList } from "@/components/desktop";
import { COURSE_SETTINGS_SECTIONS, courseSettingsSection, type CourseSettingsSection, type CourseSettingsSectionInput } from "@/lib/course-settings-sections";
import { CourseSettingsSectionEditor } from "./settings-section-editor";
import type { UsageMetric } from "@/server/queries/usage";
import { courseSettingsPanelHref, isCourseSettingsPanel } from "@/lib/course-settings-panels";
import { CourseSettingsPanel } from "./settings-panel";

import { SettingsPanelContext, type SettingsPanelState } from "@/components/admin/settings-panel-context";
import { BookableUntilForm } from "../settings/hours/bookable-until-form";
import { DutySchedulingToggle } from "../settings/duty/duty-toggle";
import { TrialSettingsForm } from "../settings/trial/trial-form";
import { saveCourseTrialSettings } from "@/server/actions/course-trial";
import type { TrialSettings } from "@/lib/shop-config";
import { CourseWaitlistSettings } from "./course-waitlist-settings";

type Props = {
  music?:boolean;
  today?: string; trialSettings?: TrialSettings;
  panelContent?: ReactNode;
  storeId: string; name: string; planLabel: string; address: string; mapUrl: string; lineOfficialUrl: string;
  bankName: string; bankCode: string; bankAccountNumber: string; bookingLeadMinutes: number; cancellationLeadMinutes: number;
  canEdit: boolean; canPayment: boolean; canStaff: boolean; canPlans: boolean;
  canTrial?: boolean; canHours?: boolean; canDutyRead?: boolean; canDutyManage?: boolean; canReminders?: boolean; canCare?: boolean;
  canDigitalButler?: boolean; canReferralShare?: boolean; canUnassignedPlans?: boolean; subscriptionSummary?: string;
  bookingWindowDays?: number; bookableUntilDate?: string | null; dutyEnabled?: boolean;
  trialEnabled?: boolean; trialPrice?: number; usageMetrics?: UsageMetric[];
  waitlistFeatureAvailable?: boolean;
  waitlistSettings?: { enabled: boolean; defaultLimit: number; autoPromoteStopMinutes: number };
};
function Row({
  title,
  summary,
  href,
  action = "設定",
  controls,
  expanded,
  onEdit,
  children,
}: {
  title: string;
  summary: string;
  href?: string;
  action?: string;
  controls?: ReactNode;
  expanded?: boolean;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  const showChildren = expanded === undefined ? true : expanded;
  return <section className="min-w-0 border-b border-earth-100 last:border-0">
    <div className="grid min-h-14 items-center gap-2 py-2.5 md:grid-cols-[minmax(140px,0.72fr)_minmax(220px,1.28fr)_auto]">
      <h3 className="text-sm font-semibold text-primary-900">{title}</h3>
      <p className="min-w-0 break-words text-sm text-earth-600">{summary}</p>
      <div className="flex items-center justify-end gap-2">
        {controls}
        {onEdit && !expanded && <button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50">修改</button>}
        {href && <DashboardLink href={courseSettingsPanelHref(href)} scroll={false} prefetch={false} aria-label={`開啟${title}`} className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50">{action}</DashboardLink>}
      </div>
    </div>
    {showChildren && children ? <div className="border-t border-earth-100 pb-3 pt-3">{children}</div> : null}
  </section>;
}
function SectionGuard({ section, context, children }: { section: string; context: NonNullable<ContextType<typeof SettingsPanelContext>>; children: ReactNode }) {
  const report = context.report;
  const navigate = context.navigate;
  const scopedReport = useCallback((id: string, state: SettingsPanelState | null) => report(`${section}:${id}`, state), [section, report]);
  const scoped = useMemo(() => ({ report: scopedReport, navigate }), [scopedReport, navigate]);
  return <SettingsPanelContext.Provider value={scoped}>{children}</SettingsPanelContext.Provider>;
}
const lead = (minutes: number) => {
  if (!minutes) return "上課開始前";
  if (minutes % 60 === 0) return `${minutes / 60} 小時前`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分前`;
  return `${minutes} 分鐘前`;
};

export function CourseSettingsWorkspace(props: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();
  const active = courseSettingsSection(search.get("section"));
  const panel = search.get("panel");
  const [status, setStatus] = useState<Record<string, { dirty: boolean; pending: boolean }>>({});
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const allowLeave = useRef(false);
  const hasDirty = Object.values(status).some(value => value.dirty);
  const sectionDirty = (section: string) => Object.entries(status).some(([key, state]) => (key === section || key.startsWith(section + ":")) && state.dirty);
  const pending = Object.values(status).some(value => value.pending);
  const onStatus = useCallback((section: CourseSettingsSectionInput["section"], dirty: boolean, saving: boolean) => {
    setStatus(previous => previous[section]?.dirty === dirty && previous[section]?.pending === saving ? previous : { ...previous, [section]: { dirty, pending: saving } });
  }, []);
  const report = useCallback((id: string, state: SettingsPanelState | null) => {
    setStatus(previous => {
      if (state && previous[id]?.dirty === state.dirty && previous[id]?.pending === state.pending) return previous;
      const next = { ...previous }; if (state) next[id] = state; else delete next[id]; return next;
    });
  }, []);
  const context = useMemo(() => ({ report, navigate: (href: string) => router.push(href) }), [report, router]);
  useEffect(() => {
    if (!hasDirty && !pending) return;
    function intercept(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (!/^https?:$/.test(url.protocol)) return;
      if (url.origin === window.location.origin && url.pathname === pathname && url.searchParams.get("view") === "settings") return;
      if (link.closest("[data-course-settings-panel]") && courseSettingsPanelHref(url.pathname.replace(/^\/s\/[^/]+\/admin(?=\/dashboard)|^\/hq(?=\/dashboard)/, "") + url.search).includes("view=settings")) return;
      event.preventDefault(); event.stopPropagation(); setLeaveHref(url.href);
    }
    function unload(event: BeforeUnloadEvent) { if (!allowLeave.current) { event.preventDefault(); event.returnValue = ""; } }
    document.addEventListener("click", intercept, true);
    window.addEventListener("beforeunload", unload);
    return () => { document.removeEventListener("click", intercept, true); window.removeEventListener("beforeunload", unload); };
  }, [hasDirty, pending, pathname]);
  function openRow(id: string) {
    if (pending) return;
    if (hasDirty && !window.confirm("目前有尚未儲存的修改，要捨棄並開啟其他設定嗎？")) return;
    setExpandedRow(id);
  }
  function select(section: CourseSettingsSection) {
    if (hasDirty || pending) return;
    setExpandedRow(null);
    const params = new URLSearchParams(search.toString()); params.set("view", "settings"); params.set("section", section);
    window.history.replaceState(null, "", pathname + "?" + params.toString());
  }
  const editor = (initial: CourseSettingsSectionInput, allowed: boolean) => allowed ? <CourseSettingsSectionEditor initial={initial} onStatus={onStatus} /> : <p className="mt-2 text-xs text-earth-500">僅供查看；修改請聯絡有權限的店長。</p>;
  return <SettingsPanelContext.Provider value={context}><div className="grid min-w-0 gap-3 md:grid-cols-[170px_minmax(0,1fr)]">
    <nav aria-label="設定分類" className="min-w-0">
      <label className="block text-sm md:hidden">設定分類<select value={active} onChange={event => select(courseSettingsSection(event.target.value))} className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3">{COURSE_SETTINGS_SECTIONS.map(section => <option key={section.id} value={section.id}>{section.label}{sectionDirty(section.id) ? " · 未儲存" : ""}</option>)}</select></label>
      <div className="sticky top-4 hidden space-y-1 rounded-xl border border-earth-200 bg-white p-2 md:block">{COURSE_SETTINGS_SECTIONS.map(section => <button type="button" key={section.id} aria-current={active === section.id ? "page" : undefined} onClick={() => select(section.id)} className={"min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm " + (active === section.id ? "bg-primary-50 font-semibold text-primary-800" : "text-earth-600 hover:bg-earth-50")}>{section.label}{sectionDirty(section.id) && <span className="ml-1 text-xs text-amber-700">未儲存</span>}</button>)}</div>
    </nav>
    <div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4 py-1 sm:px-5">
      <p className="border-b border-earth-100 py-2.5 text-sm text-earth-500">{props.name} · 課程模組{hasDirty ? " · 有未儲存修改" : ""}</p>
      <section hidden={active !== "store"} aria-label="店家資料">
        <Row title="店家資料" summary={props.name + (props.address ? "・" + props.address : "")} expanded={expandedRow === "store"} onEdit={props.canEdit ? () => openRow("store") : undefined}>{!props.canEdit && <InfoList density="compact" items={[{ label: "店家名稱", value: props.name }, { label: "地址", value: props.address || "尚未填寫" }, { label: "地圖", value: props.mapUrl ? "已設定" : "尚未設定" }, { label: "官方 LINE", value: props.lineOfficialUrl ? "已設定" : "尚未設定" }]} />} {props.canEdit && editor({ section: "store", name: props.name, address: props.address, mapUrl: props.mapUrl, lineOfficialUrl: props.lineOfficialUrl }, true)}</Row>
      </section>
      <section hidden={active !== "booking"} aria-label="營業與預約"><SectionGuard section="booking" context={context}>
        {props.today && <BookableUntilForm course direct initialDate={props.bookableUntilDate ?? null} initialDays={props.bookingWindowDays ?? 14} today={props.today} canManage={props.canEdit} />}
        <Row title="營業與公休" summary="每週營業時間・特殊公休" controls={props.canHours ? <><DashboardLink href={courseSettingsPanelHref("/dashboard/courses/hours?tab=weekly")} scroll={false} className="inline-flex min-h-10 items-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700">營業時間</DashboardLink><DashboardLink href={courseSettingsPanelHref("/dashboard/courses/hours?tab=special")} scroll={false} className="inline-flex min-h-10 items-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700">特殊公休</DashboardLink></> : undefined} />
        <Row title="預約與取消截止" summary={"預約 " + lead(props.bookingLeadMinutes) + "・取消 " + lead(props.cancellationLeadMinutes)} expanded={expandedRow === "booking-cutoff"} onEdit={props.canEdit ? () => openRow("booking-cutoff") : undefined}>
          {editor({ section: "booking", bookingLeadMinutes: props.bookingLeadMinutes, cancellationLeadMinutes: props.cancellationLeadMinutes }, props.canEdit)}
          <details className="mt-2 text-sm text-earth-500"><summary className="min-h-10 cursor-pointer py-2">扣堂規則</summary><p className="leading-6">{props.music ? "預約先保留堂數，報到即出席並扣 1 堂；曠課扣 1 堂。自組班請假保留補課資格，團體班請假記錄並扣 1 堂。音樂教室沒有補課券。" : "自由預約：先保留額度，出席扣點／扣堂；取消或未到釋放占用。固定期課：未到仍扣堂，不提供補課券。截止後請聯絡店長處理。"}</p></details>
        </Row>
        {props.waitlistFeatureAvailable && props.waitlistSettings && (
          <Row
            title="候補"
            summary={props.waitlistSettings.enabled ? `開啟・${props.waitlistSettings.defaultLimit} 人・${props.waitlistSettings.autoPromoteStopMinutes === 0 ? "不停止" : `${props.waitlistSettings.autoPromoteStopMinutes / 60} 小時前停止`}` : "關閉"}
            expanded={expandedRow === "waitlist"}
            onEdit={props.canEdit ? () => openRow("waitlist") : undefined}
          >
            <CourseWaitlistSettings initial={props.waitlistSettings} canEdit={props.canEdit} />
          </Row>
        )}
        <Row title="值班聯動" summary={props.dutyEnabled ? "已啟用・排課需符合值班" : "未啟用"} href={props.canDutyManage ? "/dashboard/settings/duty" : undefined} action="值班設定" controls={props.canDutyManage ? <DutySchedulingToggle enabled={props.dutyEnabled ?? false} course compact /> : undefined} />
      </SectionGuard></section>
      <section hidden={active !== "payment"} aria-label="收款與體驗"><SectionGuard section="payment" context={context}>
        {props.canPayment ? <Row title="銀行轉帳資訊" summary={props.bankAccountNumber ? "已設定" : "尚未設定"} expanded={expandedRow === "payment-bank"} onEdit={() => openRow("payment-bank")}>
          {editor({ section: "payment", bankName: props.bankName, bankCode: props.bankCode, bankAccountNumber: props.bankAccountNumber }, true)}
          <p className="mt-2 text-sm text-earth-500">付款聯繫：{props.lineOfficialUrl ? "沿用店家官方 LINE" : "尚未設定官方 LINE"} <button type="button" className="min-h-10 px-2 text-primary-700 underline" onClick={() => select("store")}>前往店家資料</button></p>
        </Row> : <p className="py-5 text-sm text-earth-500">目前帳號沒有付款設定權限。</p>}
        {props.canTrial && props.trialSettings ? <Row
          title="體驗設定"
          summary={`${props.trialSettings.trialEnabled ? "開啟" : "關閉"}・預設 NT$ ${props.trialSettings.trialDefaultPrice}・調價 ${props.trialSettings.trialAllowPriceEdit ? `NT$ ${props.trialSettings.trialMinPrice}–${props.trialSettings.trialMaxPrice}` : "關閉"}`}
          expanded={expandedRow === "trial"}
          onEdit={() => openRow("trial")}
        ><TrialSettingsForm storeId={props.storeId} initial={props.trialSettings} saveAction={saveCourseTrialSettings} courseMode compact forceExpanded /></Row> : props.canTrial && <Row title="體驗設定" summary={(props.trialEnabled ? "已啟用" : "未啟用") + " · 預設體驗價 NT$ " + (props.trialPrice ?? 0) + "；收款與出席分開。"} href="/dashboard/settings/trial" />}
      </SectionGuard></section>
      <section hidden={active !== "notifications"} aria-label="通知與顧客經營">
        {props.canUnassignedPlans && <Row title="未指派方案提醒" summary="站內待辦：查看尚無方案紀錄的顧客；排除待核帳、已加入共用方案及到期／用完的方案。本階段不自動傳送 LINE。" action="查看待辦名單" href="/dashboard/courses/unassigned-plans" />}
        {props.canReminders && <Row title="提醒管理" summary="選擇要管理的提醒或查看發送結果。"><div className="mt-3 flex flex-wrap gap-2">{[["customer", "顧客提醒"], ["manager", "人員通知"], ["logs", "發送紀錄"]].map(([tab, label]) => <DashboardLink key={tab} href={courseSettingsPanelHref(`/dashboard/courses/reminders?tab=${tab}`)} scroll={false} className="inline-flex min-h-9 items-center rounded-lg border px-3 text-xs font-medium text-primary-700">{label}</DashboardLink>)}</div></Row>}
        {props.canCare && <Row title="顧客關懷" summary="查看生日、未回課與方案關懷名單；清單不等同自動發訊。" action="查看關懷名單" href="/dashboard/growth" />}
        {props.canReferralShare && <Row title="推薦分享" summary="已開通；編輯學員分享給朋友的文案。" action="編輯分享文案" href="/dashboard/settings/referral-share" />}
        {props.canDigitalButler && <Row title="數位管家" summary="已開通；互動流程是否啟用，請進入查看。" action="管理互動流程" href="/dashboard/settings/digital-butler" />}
        {!props.canUnassignedPlans && !props.canReminders && !props.canCare && !props.canReferralShare && !props.canDigitalButler && <p className="py-5 text-sm text-earth-500">目前沒有可使用的通知設定，請聯絡有權限的管理者。</p>}
      </section>
      <section hidden={active !== "subscription"} aria-label="系統方案與用量">
        <Row title="店家系統方案" summary={props.planLabel + " · 這是店家使用蒸管家的方案，不是販售給學員的課程方案。"}>{props.subscriptionSummary && <p className="mt-3 text-sm text-earth-600">{props.subscriptionSummary}</p>}<p className="mt-2 text-xs text-earth-500">續約或調整系統方案請聯絡總部。</p></Row>
        {props.usageMetrics && <Row title="目前用量" summary="本月預約按台灣時間的建立日期計算，取消仍計入已建立筆數。"><InfoList density="compact" items={props.usageMetrics.map(metric => ({ label: metric.label, value: metric.current.toLocaleString("zh-TW") + " / " + (metric.limit === null ? "不限" : metric.limit.toLocaleString("zh-TW")) }))} /></Row>}
      </section>
    </div>
    {leaveHref && <RightSheet presentation="centered" open compact width={480} onClose={() => setLeaveHref(null)} labelledById="course-settings-leave-title"><header className="p-4"><h2 id="course-settings-leave-title" className="font-semibold">{pending ? "設定仍在儲存" : "尚有未儲存的修改"}</h2></header><div className="p-4"><p>{pending ? "請等儲存完成後再離開。" : "離開將捨棄尚未儲存內容；切換左側設定分類則會保留。"}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded border px-4" onClick={() => setLeaveHref(null)}>繼續編輯</button>{!pending && <button type="button" className="min-h-11 rounded bg-primary-700 px-4 text-white" onClick={() => { allowLeave.current = true; window.location.assign(leaveHref); }}>捨棄修改並離開</button>}</div></div></RightSheet>}
    {isCourseSettingsPanel(panel) && <CourseSettingsPanel key={panel} panel={panel}>{props.panelContent}</CourseSettingsPanel>}
  </div></SettingsPanelContext.Provider>;
}
