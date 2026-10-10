"use client";

import { trialSettingsRevision } from "@/lib/shop-settings-save";
import { useConfirmedSettingsRows } from "@/components/admin/use-confirmed-settings-rows";
import { courseDisplayText } from "@/lib/course-display-text";
import { FeatureEntry } from "@/components/feature-presentation";
import { FEATURES } from "@/lib/feature-flags";
import { CustomerLabelsSettings } from "@/components/customer-labels";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ContextType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import { InfoList } from "@/components/desktop";
import { COURSE_SETTINGS_SECTIONS, courseSettingsSectionRevision,courseSettingsSection, type CourseSettingsSection, type CourseSettingsSectionInput } from "@/lib/course-settings-sections";
import { CourseSettingsSectionEditor } from "./settings-section-editor";
import type { UsageMetric } from "@/server/queries/usage";
import { courseSettingsPanelHref, isCourseSettingsPanel } from "@/lib/course-settings-panels";
import { CourseSettingsPanel } from "./settings-panel";

import { SettingsPanelContext, type SettingsPanelState } from "@/components/admin/settings-panel-context";
import { BookableUntilForm } from "../settings/hours/bookable-until-form";
import { DutySchedulingToggle } from "../settings/duty/duty-toggle";
import { TrialSettingsForm } from "../settings/trial/trial-form";
import type { TrialSettings } from "@/lib/shop-config";
import { CourseSelfBookingSettings } from "./course-self-booking-settings";
import {waitlistRevision} from "@/lib/course-waitlist-save";
import { CourseWaitlistSettings } from "./course-waitlist-settings";
import { SettingsListRow, SettingsWorkspaceFrame, SettingsWorkspaceNav } from "@/components/settings";

type Props = {
  music?:boolean; shopPhone?:string; lineOfficialId?:string;
  today?: string; trialSettings?: TrialSettings;
  panelContent?: ReactNode;
  storeId: string; name: string; planLabel: string; address: string; mapUrl: string; lineOfficialUrl: string;
  bankName: string; bankCode: string; bankAccountNumber: string; bookingLeadMinutes: number; cancellationLeadMinutes: number;
  canEdit: boolean; canPayment: boolean; canStaff: boolean; canPlans: boolean;
  canTrial?: boolean; canHours?: boolean; canDutyRead?: boolean; canDutyManage?: boolean; canReminders?: boolean; canCare?: boolean;
  canDigitalButler?: boolean; canReferralShare?: boolean; canUnassignedPlans?: boolean; subscriptionSummary?: string;
  bookingWindowDays?: number; bookableUntilDate?: string | null; dutyEnabled?: boolean;
  trialEnabled?: boolean; trialPrice?: number; usageMetrics?: UsageMetric[];
  selfBookingEnabled?: boolean; selfBookingRevision?: number;
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
  return (
    <SettingsListRow
      title={title}
      summary={summary}
      href={href ? courseSettingsPanelHref(href) : undefined}
      action={action}
      controls={controls}
      expanded={expanded}
      keepMounted
      onEdit={onEdit}
    >
      {children}
    </SettingsListRow>
  );
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

export function CourseSettingsWorkspace(sourceProps: Props) {
  type SectionRow={id:string;values:CourseSettingsSectionInput|TrialSettings};
  const sources=useMemo<SectionRow[]>(()=>[
    {id:"store",values:{section:"store",name:sourceProps.name,address:sourceProps.address,mapUrl:sourceProps.mapUrl,lineOfficialUrl:sourceProps.lineOfficialUrl,shopPhone:sourceProps.shopPhone??"",lineOfficialId:sourceProps.lineOfficialId??""}},
    {id:"booking",values:{section:"booking",bookingLeadMinutes:sourceProps.bookingLeadMinutes,cancellationLeadMinutes:sourceProps.cancellationLeadMinutes}},
    {id:"payment",values:{section:"payment",bankName:sourceProps.bankName,bankCode:sourceProps.bankCode,bankAccountNumber:sourceProps.bankAccountNumber}},
    ...(sourceProps.trialSettings?[{id:"trial",values:sourceProps.trialSettings}]:[]),
  ],[sourceProps]);
  const confirmed=useConfirmedSettingsRows(sources,row=>"section" in row.values?courseSettingsSectionRevision(row.values):trialSettingsRevision(row.values));
  const sections=confirmed.rows.filter(row=>row.id!=="trial").map(row=>row.values);
  const waitlistSource=useMemo(()=>sourceProps.waitlistSettings?[{id:"waitlist",values:sourceProps.waitlistSettings}]:[],[sourceProps.waitlistSettings]);
  const confirmedWaitlist=useConfirmedSettingsRows(waitlistSource,row=>waitlistRevision(row.values));
  const props:Props={...sourceProps,...Object.assign({},...sections),waitlistSettings:confirmedWaitlist.rows[0]?.values,trialSettings:confirmed.rows.find(row=>row.id==="trial")?.values as TrialSettings|undefined};
  const onSaved=(row:CourseSettingsSectionInput)=>confirmed.confirm({id:row.section,values:row});
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
    setExpandedRow(id);
  }
  function select(section: CourseSettingsSection) {
    if (pending) return;
    setExpandedRow(null);
    const params = new URLSearchParams(search.toString()); params.set("view", "settings"); params.set("section", section);
    window.history.replaceState(null, "", pathname + "?" + params.toString());
  }
  const editor = (initial: CourseSettingsSectionInput, allowed: boolean) => allowed ? <CourseSettingsSectionEditor storeId={props.storeId} initial={initial} onStatus={onStatus} onSaved={onSaved} /> : <p className="mt-2 text-xs text-earth-500">僅供查看；修改請聯絡有權限的店長。</p>;
  return <SettingsPanelContext.Provider value={context}><SettingsWorkspaceFrame
    nav={<>
      <label className="block text-sm md:hidden">設定分類<select value={active} onChange={event => select(courseSettingsSection(event.target.value))} className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3">{COURSE_SETTINGS_SECTIONS.map(section => <option key={section.id} value={section.id}>{section.label}{sectionDirty(section.id) ? " · 未儲存" : ""}</option>)}</select></label>
      <SettingsWorkspaceNav
        items={COURSE_SETTINGS_SECTIONS.map(section => ({ id: section.id, label: section.label, status: sectionDirty(section.id) ? "未儲存" : undefined }))}
        activeId={active}
        onSelect={id => select(courseSettingsSection(id))}
      />
    </>}
    header={<>{props.name} · 課程模組{hasDirty ? " · 有未儲存修改" : ""}</>}
  >
      <section hidden={active !== "store"} aria-label="店家資料">
        <Row title="店家資料" summary={props.name + (props.address ? "・地址已設定" : "・地址未設定")} expanded={expandedRow === "store"} onEdit={props.canEdit ? () => openRow("store") : undefined}>{!props.canEdit && <InfoList density="compact" items={[{ label: "店家名稱", value: props.name }, { label: "電話", value: props.shopPhone || "尚未填寫" }, { label: "地址", value: props.address || "尚未填寫" }, { label: "地圖", value: props.mapUrl ? "已設定" : "尚未設定" }, { label: "官方 LINE ID", value: props.lineOfficialId || "尚未填寫" }, { label: "官方 LINE", value: props.lineOfficialUrl ? "已設定" : "尚未設定" }]} />} {props.canEdit && editor({ section: "store", name: props.name, shopPhone: props.shopPhone ?? "", lineOfficialId: props.lineOfficialId ?? "", address: props.address, mapUrl: props.mapUrl, lineOfficialUrl: props.lineOfficialUrl }, true)}</Row>
      </section>
      <section hidden={active !== "booking"} aria-label="營業與預約"><SectionGuard section="booking" context={context}>
        <CourseSelfBookingSettings storeId={props.storeId} music={props.music} key={props.storeId} initialEnabled={props.selfBookingEnabled ?? true} initialRevision={props.selfBookingRevision ?? 0} canEdit={props.canEdit} expanded={expandedRow === "self-booking"} onEdit={() => openRow("self-booking")} onClose={() => setExpandedRow(current => current === "self-booking" ? null : current)} />
        {props.today && <BookableUntilForm course direct initialDate={props.bookableUntilDate ?? null} initialDays={props.bookingWindowDays ?? 14} today={props.today} canManage={props.canEdit} />}
        <Row title="營業與公休" summary="每週營業時間・特殊公休" controls={props.canHours ? <><DashboardLink href={courseSettingsPanelHref("/dashboard/courses/hours?tab=weekly")} scroll={false} className="inline-flex min-h-10 min-w-20 items-center justify-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50">營業時間</DashboardLink><DashboardLink href={courseSettingsPanelHref("/dashboard/courses/hours?tab=special")} scroll={false} className="inline-flex min-h-10 min-w-20 items-center justify-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50">特殊公休</DashboardLink></> : undefined} />
        <Row title="預約與取消截止" summary={"預約 " + lead(props.bookingLeadMinutes) + "・取消 " + lead(props.cancellationLeadMinutes)} expanded={expandedRow === "booking-cutoff"} onEdit={props.canEdit ? () => openRow("booking-cutoff") : undefined}>
          {editor({ section: "booking", bookingLeadMinutes: props.bookingLeadMinutes, cancellationLeadMinutes: props.cancellationLeadMinutes }, props.canEdit)}
          <details className="mt-2 text-sm text-earth-500"><summary className="min-h-10 cursor-pointer py-2">扣堂規則</summary><p className="leading-6">{props.music ? "預約先保留堂數，報到即出席並扣 1 堂；曠課扣 1 堂。自組班請假保留補課資格，團體班請假記錄並扣 1 堂。音樂教室沒有補課券。" : "自由預約：先保留額度，出席扣點／扣堂；取消或未到釋放占用。固定期課：未到仍扣堂，不提供補課券。截止後請聯絡店長處理。"}</p></details>
        </Row>
        <FeatureEntry feature={FEATURES.COURSE_WAITLIST} label="候補">
        {props.waitlistFeatureAvailable && props.waitlistSettings && (
          <Row
            title="候補"
            summary={props.waitlistSettings.enabled ? `開啟・${props.waitlistSettings.defaultLimit} 人・${props.waitlistSettings.autoPromoteStopMinutes === 0 ? "不停止" : `${props.waitlistSettings.autoPromoteStopMinutes / 60} 小時前停止`}` : "關閉"}
            expanded={expandedRow === "waitlist"}
            onEdit={props.canEdit ? () => openRow("waitlist") : undefined}
          >
            <CourseWaitlistSettings key={props.storeId} storeId={props.storeId} initial={props.waitlistSettings} canEdit={props.canEdit} onSaved={values=>confirmedWaitlist.confirm({id:"waitlist",values})} />
          </Row>
        )}
        </FeatureEntry>
        <Row title="值班聯動" summary={props.dutyEnabled ? "已啟用・排課需符合值班" : "未啟用"} href={props.canDutyManage ? "/dashboard/settings/duty" : undefined} action="值班設定" controls={props.canDutyManage ? <DutySchedulingToggle enabled={props.dutyEnabled ?? false} course compact /> : undefined} />
      </SectionGuard></section>
      <section hidden={active !== "payment"} aria-label="收款與體驗"><SectionGuard section="payment" context={context}>
        {props.canPayment ? <Row title="銀行轉帳資訊" summary={props.bankAccountNumber ? `${props.bankName || "銀行帳戶"}・末四碼 ${props.bankAccountNumber.slice(-4)}` : "未設定"} expanded={expandedRow === "payment-bank"} onEdit={() => openRow("payment-bank")}>
          {editor({ section: "payment", bankName: props.bankName, bankCode: props.bankCode, bankAccountNumber: props.bankAccountNumber }, true)}
          <p className="mt-2 text-sm text-earth-500">付款聯繫：{props.lineOfficialUrl ? "沿用店家官方 LINE" : "尚未設定官方 LINE"} <button type="button" className="min-h-10 px-2 text-primary-700 underline" onClick={() => select("store")}>前往店家資料</button></p>
        </Row> : <p className="py-5 text-sm text-earth-500">目前帳號沒有付款設定權限。</p>}
        {props.canTrial && props.trialSettings ? <Row
          title="體驗設定"
          summary={`${props.trialSettings.trialEnabled ? "開啟" : "關閉"}・預設 NT$ ${props.trialSettings.trialDefaultPrice}・調價 ${props.trialSettings.trialAllowPriceEdit ? `NT$ ${props.trialSettings.trialMinPrice}–${props.trialSettings.trialMaxPrice}` : "關閉"}`}
          expanded={expandedRow === "trial"}
          onEdit={() => openRow("trial")}
        ><TrialSettingsForm onSaved={values=>confirmed.confirm({id:"trial",values})} storeId={props.storeId} initial={props.trialSettings} courseMode compact forceExpanded /></Row> : props.canTrial && <Row title="體驗設定" summary={(props.trialEnabled ? "已啟用" : "未啟用") + " · 預設體驗價 NT$ " + (props.trialPrice ?? 0) + "；收款與出席分開。"} href="/dashboard/settings/trial" />}
      </SectionGuard></section>
      <section hidden={active !== "notifications"} aria-label="通知與顧客經營">
        <CustomerLabelsSettings />
        {props.canUnassignedPlans && <Row title="未指派方案提醒" summary="尚無方案顧客待辦" action="查看" href="/dashboard/courses/unassigned-plans" />}
        {props.canReminders && <Row title="提醒管理" summary={courseDisplayText("顧客提醒・人員通知・教練通知・發送紀錄", !!props.music)} action="管理" href="/dashboard/courses/reminders?tab=customer" />}
        {props.canCare && <Row title="顧客關懷" summary="生日・未回課・方案關懷" action="查看" href="/dashboard/growth" />}
        {props.canReferralShare && <Row title="推薦分享" summary="已開啟" action="編輯" href="/dashboard/settings/referral-share" />}
        {props.canDigitalButler && <Row title="數位管家" summary="已開啟" action="管理" href="/dashboard/settings/digital-butler" />}
        {!props.canUnassignedPlans && !props.canReminders && !props.canCare && !props.canReferralShare && !props.canDigitalButler && <p className="py-5 text-sm text-earth-500">目前沒有可使用的通知設定，請聯絡有權限的管理者。</p>}
      </section>
      <section hidden={active !== "subscription"} aria-label="系統方案與用量">
        <Row title="店家系統方案" summary={[props.planLabel, props.subscriptionSummary].filter(Boolean).join("・")} />
        {props.usageMetrics && <Row title="目前用量" summary={props.usageMetrics.map(metric => `${metric.label} ${metric.current.toLocaleString("zh-TW")} / ${metric.limit === null ? "不限" : metric.limit.toLocaleString("zh-TW")}`).join("・")} />}
      </section>
    {leaveHref && <RightSheet presentation="centered" open compact width={480} onClose={() => setLeaveHref(null)} labelledById="course-settings-leave-title"><header className="p-4"><h2 id="course-settings-leave-title" className="font-semibold">{pending ? "設定仍在儲存" : "尚有未儲存的修改"}</h2></header><div className="p-4"><p>{pending ? "請等儲存完成後再離開。" : "離開將捨棄尚未儲存內容；切換左側設定分類則會保留。"}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded border px-4" onClick={() => setLeaveHref(null)}>繼續編輯</button>{!pending && <button type="button" className="min-h-11 rounded bg-primary-700 px-4 text-white" onClick={() => { allowLeave.current = true; window.location.assign(leaveHref); }}>捨棄修改並離開</button>}</div></div></RightSheet>}
    {isCourseSettingsPanel(panel) && <CourseSettingsPanel panel={panel}>{props.panelContent}</CourseSettingsPanel>}
  </SettingsWorkspaceFrame></SettingsPanelContext.Provider>;
}
