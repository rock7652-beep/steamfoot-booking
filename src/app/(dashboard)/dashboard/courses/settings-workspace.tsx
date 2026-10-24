"use client";
import type {CourseSettingsSource} from "./settings-source";
import {createContext,useContext} from "react";
import {OperationSettingSwitch} from "@/components/admin/operation-setting-switch";
import {CourseOperationSwitch} from "@/components/admin/course-operation-switch";
import { toast } from "sonner";

import { trialSettingsRevision } from "@/lib/shop-settings-save";
import { useConfirmedSettingsRows } from "@/components/admin/use-confirmed-settings-rows";
import { courseDisplayText } from "@/lib/course-display-text";
import { FeatureEntry, useFeaturePresentation } from "@/components/feature-presentation";
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

const SettingsHrefContext=createContext<(href:string)=>string>(courseSettingsPanelHref);
export type CourseSettingsWorkspaceProps = {
  source?:CourseSettingsSource;
  moduleContent?: { label:string; storeSavePath:string; sections:Partial<Record<CourseSettingsSection,ReactNode>> };
  native?:boolean; music?:boolean; shopPhone?:string; lineOfficialId?:string;
  today?: string; trialSettings?: TrialSettings;
  panelContent?: ReactNode;
  storeId: string; name: string; planLabel: string; address: string; mapUrl: string; lineOfficialUrl: string;
  bankName: string; bankCode: string; bankAccountNumber: string; bookingLeadMinutes: number; cancellationLeadMinutes: number;
  canEdit: boolean; canPayment: boolean; canStaff: boolean; canPlans: boolean;
  canTrial?: boolean; canHours?: boolean; canDutyRead?: boolean; canDutyManage?: boolean; canReminders?: boolean; canCare?: boolean;
  // Destination permissions only; HQ feature presentation comes from the shared provider.
  canDigitalButler?: boolean; canReferralShare?: boolean; canUnassignedPlans?: boolean; subscriptionSummary?: string;
  bookingOpensAt?: string | null; bookingWindowDays?: number; bookableUntilDate?: string | null; dutyEnabled?: boolean;
  trialEnabled?: boolean; trialPrice?: number; usageMetrics?: UsageMetric[];
  selfBookingEnabled?: boolean; selfBookingRevision?: number;
  selfLeaveEnabled?:boolean;selfRescheduleEnabled?:boolean;backendNoticesEnabled?:boolean;
  waitlistFeatureAvailable?: boolean;
  waitlistSettings?: { enabled: boolean; defaultLimit: number; autoPromoteStopMinutes: number };
};
export function CourseSettingsRow({
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
  const resolveHref=useContext(SettingsHrefContext);
  return (
    <SettingsListRow
      title={title}
      summary={summary}
      href={href ? resolveHref(href) : undefined}
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
const Row=CourseSettingsRow;
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

export function CourseSettingsWorkspace(sourceProps: CourseSettingsWorkspaceProps) {
  const reminderState = useFeaturePresentation(FEATURES.LINE_REMINDER);
  const referralState = useFeaturePresentation(FEATURES.REFERRAL_SHARE);
  const butlerState = useFeaturePresentation(FEATURES.DIGITAL_BUTLER);
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
  const dutySource=useMemo(()=>[{id:"duty",enabled:sourceProps.dutyEnabled??false}],[sourceProps.dutyEnabled]);
  const confirmedDuty=useConfirmedSettingsRows(dutySource,row=>String(row.enabled));
  const props:CourseSettingsWorkspaceProps={...sourceProps,dutyEnabled:confirmedDuty.rows[0].enabled,...Object.assign({},...sections),waitlistSettings:confirmedWaitlist.rows[0]?.values,trialSettings:confirmed.rows.find(row=>row.id==="trial")?.values as TrialSettings|undefined};
  let storeMapHref: string | undefined;
  try {
    const map = new URL(props.mapUrl);
    if (map.protocol === "https:") storeMapHref = map.href;
  } catch { /* Keep empty or invalid legacy URLs out of navigation. */ }
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();
  const active = courseSettingsSection(search.get("section") === "commerce" ? "payment" : search.get("section"));
  const panel = search.get("panel");
  const featurePanelAllowed = panel === "reminders" ? props.canReminders && reminderState !== "HIDDEN" && reminderState !== "LOCKED"
    : panel === "referral" ? props.canReferralShare && referralState !== "HIDDEN" && referralState !== "LOCKED"
    : panel === "butler" ? props.canDigitalButler && butlerState !== "HIDDEN" && butlerState !== "LOCKED"
    : true;
  const [status, setStatus] = useState<Record<string, { dirty: boolean; pending: boolean }>>({});
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  function closeSavedRow(id: string, syncWarning: boolean) {
    // Keep warnings visible, and never close another row opened in the meantime.
    if (!syncWarning) {
      setExpandedRow(current => current === id ? null : current);
      if (id !== "trial") toast.success("已儲存");
    }
  }
  const onSaved = (row: CourseSettingsSectionInput, syncWarning: boolean) => {
    confirmed.confirm({id:row.section,values:row});
    closeSavedRow(row.section === "booking" ? "booking-cutoff" : row.section === "payment" ? "payment-bank" : "store", syncWarning);
  };
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
    if ((!hasDirty||props.source?.confirmDiscard===false) && !pending) return;
    function intercept(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (!/^https?:$/.test(url.protocol)) return;
      if (url.origin === window.location.origin && url.pathname === pathname && ((props.moduleContent||props.source) ? url.searchParams.get("tab") === "設定" : url.searchParams.get("view") === "settings")) return;
      if (link.closest("[data-course-settings-panel]") && courseSettingsPanelHref(url.pathname.replace(/^\/s\/[^/]+\/admin(?=\/dashboard)|^\/hq(?=\/dashboard)/, "") + url.search).includes("view=settings")) return;
      event.preventDefault(); event.stopPropagation(); if(!pending||props.source?.confirmDiscard!==false)setLeaveHref(url.href);
    }
    function unload(event: BeforeUnloadEvent) { if (!allowLeave.current) { event.preventDefault(); event.returnValue = ""; } }
    document.addEventListener("click", intercept, true);
    window.addEventListener("beforeunload", unload);
    return () => { document.removeEventListener("click", intercept, true); window.removeEventListener("beforeunload", unload); };
  }, [hasDirty, pending, pathname, props.moduleContent,props.source]);
  function openRow(id: string) {
    if (pending) return;
    setExpandedRow(id);
  }
  function select(section: CourseSettingsSection) {
    if (pending) return;
    setExpandedRow(null);
    const params = new URLSearchParams(search.toString()); if(props.moduleContent||props.source)params.set("tab", "設定");else params.set("view", "settings"); params.set("section", section);
    window.history.replaceState(null, "", pathname + "?" + params.toString());
  }
  const editor = (initial: CourseSettingsSectionInput, allowed: boolean) => allowed ? <CourseSettingsSectionEditor savePath={props.source?.storeSavePath??props.moduleContent?.storeSavePath} storeId={props.storeId} initial={initial} onStatus={onStatus} onSaved={onSaved} /> : <p className="mt-2 text-xs text-earth-500">僅供查看；修改請聯絡有權限的店長。</p>;
  return <SettingsHrefContext.Provider value={props.source?.href??courseSettingsPanelHref}><SettingsPanelContext.Provider value={context}><SettingsWorkspaceFrame
    nav={<>
      <label className="block text-sm md:hidden">設定分類<select value={active} onChange={event => select(courseSettingsSection(event.target.value))} className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3">{COURSE_SETTINGS_SECTIONS.map(section => <option key={section.id} value={section.id}>{section.label}{sectionDirty(section.id) ? " · 未儲存" : ""}</option>)}</select></label>
      <SettingsWorkspaceNav
        items={COURSE_SETTINGS_SECTIONS.map(section => ({ id: section.id, label: section.label, status: sectionDirty(section.id) ? "未儲存" : undefined }))}
        activeId={active}
        onSelect={id => select(courseSettingsSection(id))}
      />
    </>}
    header={<>{props.name} · {props.source?.label??props.moduleContent?.label ?? "課程模組"}{hasDirty ? " · 有未儲存修改" : ""}</>}
  >
      <section hidden={active !== "store"} aria-label="店家資料">
        <Row title="店家資料" summary={props.name + (props.address ? "・地址已設定" : "・地址未設定") + `・Google Maps：${storeMapHref ? "已設定" : "未設定"}`} controls={storeMapHref ? <a href={storeMapHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-24 items-center justify-center whitespace-nowrap rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50 focus:outline-none focus:ring-2 focus:ring-primary-200">開啟地圖</a> : undefined} expanded={expandedRow === "store"} onEdit={props.canEdit ? () => openRow("store") : undefined}>{!props.canEdit && <InfoList density="compact" items={[{ label: "店家名稱", value: props.name }, { label: "電話", value: props.shopPhone || "尚未填寫" }, { label: "地址", value: props.address || "尚未填寫" }, { label: "地圖", value: props.mapUrl ? "已設定" : "尚未設定" }, { label: "官方 LINE ID", value: props.lineOfficialId || "尚未填寫" }, { label: "官方 LINE", value: props.lineOfficialUrl ? "已設定" : "尚未設定" }]} />} {props.canEdit && editor({ section: "store", name: props.name, shopPhone: props.shopPhone ?? "", lineOfficialId: props.lineOfficialId ?? "", address: props.address, mapUrl: props.mapUrl, lineOfficialUrl: props.lineOfficialUrl }, true)}</Row>
      </section>
      <section hidden={active !== "booking"} aria-label="營業與預約"><SectionGuard section="booking" context={context}>{props.moduleContent ? props.moduleContent.sections.booking : <>
        <CourseSelfBookingSettings immediate={!!props.source} savePath={props.source?.selfBookingSavePath} title={props.source?.selfBookingTitle} storeId={props.storeId} music={props.music} key={props.storeId} initialEnabled={props.selfBookingEnabled ?? true} initialRevision={props.selfBookingRevision ?? 0} canEdit={props.canEdit} expanded={expandedRow === "self-booking"} onEdit={() => openRow("self-booking")} onClose={() => setExpandedRow(current => current === "self-booking" ? null : current)} />
        <CourseOperationSwitch key={`leave:${props.storeId}:${props.selfLeaveEnabled}`} storeId={props.storeId} title={props.source?.selfCancelTitle??"允許學員自行請假"} save={props.source?.operationSave} setting="selfLeaveEnabled" initialEnabled={props.selfLeaveEnabled??true} canEdit={props.canEdit}/>
        <CourseOperationSwitch key={`move:${props.storeId}:${props.selfRescheduleEnabled}`} storeId={props.storeId} title={props.source?.selfRescheduleTitle??"允許學員自行改期"} save={props.source?.operationSave} setting="selfRescheduleEnabled" initialEnabled={props.selfRescheduleEnabled??props.selfBookingEnabled??true} canEdit={props.canEdit}/>
        {props.today && <BookableUntilForm savePath={props.source?.bookingWindowSavePath} key={`booking-window:${props.storeId}`} storeId={props.storeId} initialOpensAt={props.bookingOpensAt??null} course direct initialDate={props.bookableUntilDate ?? null} initialDays={props.bookingWindowDays ?? 14} today={props.today} canManage={props.canEdit} />}
        <Row title="營業與公休" summary="每週營業時間・特殊公休" controls={props.canHours ? <><DashboardLink href={(props.source?.href??courseSettingsPanelHref)("/dashboard/courses/hours?tab=weekly")} scroll={false} className="inline-flex min-h-10 min-w-20 items-center justify-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50">營業時間</DashboardLink><DashboardLink href={(props.source?.href??courseSettingsPanelHref)("/dashboard/courses/hours?tab=special")} scroll={false} className="inline-flex min-h-10 min-w-20 items-center justify-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50">特殊公休</DashboardLink></> : undefined} />
        <Row title="預約與取消截止" summary={"預約 " + (props.source&&!props.bookingLeadMinutes?"服務開始前":lead(props.bookingLeadMinutes)) + "・取消 " + lead(props.cancellationLeadMinutes)} expanded={expandedRow === "booking-cutoff"} onEdit={props.canEdit ? () => openRow("booking-cutoff") : undefined}>
          {editor({ section: "booking", bookingLeadMinutes: props.bookingLeadMinutes, cancellationLeadMinutes: props.cancellationLeadMinutes }, props.canEdit)}
          <details className="mt-2 text-sm text-earth-500"><summary className="min-h-10 cursor-pointer py-2">{props.source?"方案扣次規則":"扣堂規則"}</summary><p className="leading-6">{props.source?props.source.rules:props.native ? "指定學員固定課不預扣；出席或曠課才扣點／堂，請假不扣。停止固定課後，未用補課資格保留。開放選課沿用方案預約規則。" : props.music ? "預約先保留堂數，報到即出席並扣 1 堂；曠課扣 1 堂。自組班請假保留補課資格，團體班請假記錄並扣 1 堂。音樂教室沒有補課券。" : "自由預約：先保留額度，出席扣點／扣堂；取消或未到釋放占用。固定期課：未到仍扣堂，不提供補課券。截止後請聯絡店長處理。"}</p></details>
        </Row>
        {props.source?.bookingSwitches.map(row=><OperationSettingSwitch key={row.key+':'+row.enabled} storeId={props.storeId} title={row.title} initialEnabled={row.enabled} canEdit={props.canEdit} save={input=>props.source!.operationSave({...input,key:row.key})}/>)}
        <FeatureEntry feature={FEATURES.COURSE_WAITLIST} label="候補">
        {props.waitlistFeatureAvailable && props.waitlistSettings && (
          <Row
            title="候補"
            summary={props.waitlistSettings.enabled ? `開啟・${props.waitlistSettings.defaultLimit} 人・${props.waitlistSettings.autoPromoteStopMinutes === 0 ? "不停止" : `${props.waitlistSettings.autoPromoteStopMinutes / 60} 小時前停止`}` : "關閉"}
            expanded={expandedRow === "waitlist"}
            onEdit={props.canEdit ? () => openRow("waitlist") : undefined}
          >
            <CourseWaitlistSettings key={props.storeId} storeId={props.storeId} initial={props.waitlistSettings} canEdit={props.canEdit} onSaved={(values,syncWarning)=>{confirmedWaitlist.confirm({id:"waitlist",values});closeSavedRow("waitlist",syncWarning);}} />
          </Row>
        )}
        </FeatureEntry>
        {!props.source&&<Row title="值班聯動" summary={props.dutyEnabled ? "已啟用・排課需符合值班" : "未啟用"} href={props.canDutyManage ? "/dashboard/settings/duty" : undefined} action="值班設定" controls={props.canDutyManage ? <DutySchedulingToggle key={props.storeId} storeId={props.storeId} onSaved={enabled=>confirmedDuty.confirm({id:"duty",enabled})} enabled={props.dutyEnabled ?? false} course compact /> : undefined} />}
       </>}</SectionGuard></section>
      <section hidden={active !== "payment"} aria-label="收款與體驗"><SectionGuard section="payment" context={context}>{props.moduleContent ? props.moduleContent.sections.payment : <>
        {props.canPayment ? <Row title="銀行轉帳資訊" summary={props.bankAccountNumber ? `${props.bankName || "銀行帳戶"}・末四碼 ${props.bankAccountNumber.slice(-4)}` : "未設定"} expanded={expandedRow === "payment-bank"} onEdit={() => openRow("payment-bank")}>
          {editor({ section: "payment", bankName: props.bankName, bankCode: props.bankCode, bankAccountNumber: props.bankAccountNumber }, true)}
          <p className="mt-2 text-sm text-earth-500">付款聯繫：{props.lineOfficialUrl ? "沿用店家官方 LINE" : "尚未設定官方 LINE"} <button type="button" className="min-h-10 px-2 text-primary-700 underline" onClick={() => select("store")}>前往店家資料</button></p>
        </Row> : <p className="py-5 text-sm text-earth-500">目前帳號沒有付款設定權限。</p>}
        {props.source?.publicTrialHref&&<Row title="公開體驗表單" summary="每人每項服務限體驗一次" href={props.source.publicTrialHref} action="查看"/>}
        {props.canTrial && props.trialSettings ? <Row
          title="體驗設定"
          summary={`${props.trialSettings.trialEnabled ? "開啟" : "關閉"}・預設 NT$ ${props.trialSettings.trialDefaultPrice}・調價 ${props.trialSettings.trialAllowPriceEdit ? `NT$ ${props.trialSettings.trialMinPrice}–${props.trialSettings.trialMaxPrice}` : "關閉"}`}
          expanded={expandedRow === "trial"}
          onEdit={() => openRow("trial")}
        ><TrialSettingsForm onSaved={(values,syncWarning)=>{confirmed.confirm({id:"trial",values});closeSavedRow("trial",syncWarning);}} storeId={props.storeId} initial={props.trialSettings} courseMode compact forceExpanded /></Row> : props.canTrial && <Row title="體驗設定" summary={(props.trialEnabled ? "已啟用" : "未啟用") + " · 預設體驗價 NT$ " + (props.trialPrice ?? 0) + "；收款與出席分開。"} href="/dashboard/settings/trial" />}
       </>}</SectionGuard></section>
      <section hidden={active !== "notifications"} aria-label="通知與顧客經營">{props.moduleContent ? props.moduleContent.sections.notifications : <>
        <CourseNotificationSettings {...props} labels={props.source?.notificationLabels} careSummary={props.source?.careSummary}/>
        {props.source?.notificationSwitches.map(row=><OperationSettingSwitch key={row.key+':'+row.enabled} storeId={props.storeId} title={row.title} initialEnabled={row.enabled} canEdit={props.canEdit} save={input=>props.source!.operationSave({...input,key:row.key})}/>)}
        {props.source&&<Row title="LINE 官方帳號" summary="帳號連結與登入設定" href={props.source.href("/dashboard/settings/line-official-accounts")}/>}
       </>}</section>
      <section hidden={active !== "subscription"} aria-label="系統方案與用量">{props.moduleContent ? props.moduleContent.sections.subscription : <>
        {props.source?.subscription??<><Row title="店家系統方案" summary={[props.planLabel, props.subscriptionSummary].filter(Boolean).join("・")} />
        {props.usageMetrics && <Row title="目前用量" summary={props.usageMetrics.map(metric => `${metric.label} ${metric.current.toLocaleString("zh-TW")} / ${metric.limit === null ? "不限" : metric.limit.toLocaleString("zh-TW")}`).join("・")} />}</>}
       </>}</section>
    {leaveHref && <RightSheet presentation="centered" open compact width={480} onClose={() => setLeaveHref(null)} labelledById="course-settings-leave-title"><header className="p-4"><h2 id="course-settings-leave-title" className="font-semibold">{pending ? "設定仍在儲存" : "尚有未儲存的修改"}</h2></header><div className="p-4"><p>{pending ? "請等儲存完成後再離開。" : "離開將捨棄尚未儲存內容；切換左側設定分類則會保留。"}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded border px-4" onClick={() => setLeaveHref(null)}>繼續編輯</button>{!pending && <button type="button" className="min-h-11 rounded bg-primary-700 px-4 text-white" onClick={() => { allowLeave.current = true; window.location.assign(leaveHref); }}>捨棄修改並離開</button>}</div></div></RightSheet>}
    {!props.moduleContent && !props.source && isCourseSettingsPanel(panel) && featurePanelAllowed && <CourseSettingsPanel panel={panel}>{props.panelContent}</CourseSettingsPanel>}
  </SettingsWorkspaceFrame></SettingsPanelContext.Provider></SettingsHrefContext.Provider>;
}

/** Same notification rows and feature/permission presentation for every module. */
export function CourseNotificationSettings(props:CourseSettingsWorkspaceProps&{backendControl?:ReactNode;labels?:ReactNode;careSummary?:string;links?:{reminders?:string;care?:string;referral?:string;butler?:string}}){
 const reminderState=useFeaturePresentation(FEATURES.LINE_REMINDER),referralState=useFeaturePresentation(FEATURES.REFERRAL_SHARE),butlerState=useFeaturePresentation(FEATURES.DIGITAL_BUTLER);
  const hasNotificationEntries = props.canUnassignedPlans || props.canCare
    || (props.canReminders && reminderState !== "HIDDEN")
    || (props.canReferralShare && referralState !== "HIDDEN")
    || (props.canDigitalButler && butlerState !== "HIDDEN");
 return <>
        {props.backendControl??<CourseOperationSwitch key={`notices:${props.storeId}:${props.backendNoticesEnabled}`} storeId={props.storeId} title="後台異動通知" save={props.source?.operationSave} eventName={props.source?.operationEvent} setting="backendNoticesEnabled" initialEnabled={props.backendNoticesEnabled??true} canEdit={props.canEdit}/>}
        {props.labels??<CustomerLabelsSettings />}
        {props.canUnassignedPlans && <Row title="未指派方案提醒" summary="尚無方案顧客待辦" action="查看" href="/dashboard/courses/unassigned-plans" />}
        {props.canReminders && <FeatureEntry feature={FEATURES.LINE_REMINDER} label="提醒管理"><Row title="提醒管理" summary={courseDisplayText("顧客提醒・人員通知・教練通知・發送紀錄", !!props.music)} action="管理" href={props.links?.reminders??"/dashboard/courses/reminders?tab=customer"} /></FeatureEntry>}
        {props.canCare && <Row title="顧客關懷" summary={props.careSummary??"生日・未回課・方案關懷"} action="查看" href={props.links?.care??"/dashboard/growth"} />}
        {props.canReferralShare && <FeatureEntry feature={FEATURES.REFERRAL_SHARE} label="推薦分享"><Row title="推薦分享" summary="已開通" action="編輯" href={props.links?.referral??"/dashboard/settings/referral-share"} /></FeatureEntry>}
        {props.canDigitalButler && <FeatureEntry feature={FEATURES.DIGITAL_BUTLER} label="數位管家"><Row title="數位管家" summary="已開通" action="管理" href={props.links?.butler??"/dashboard/settings/digital-butler"} /></FeatureEntry>}
        {!hasNotificationEntries && <p className="py-5 text-sm text-earth-500">目前沒有可使用的通知設定，請聯絡有權限的管理者。</p>}
 </>;
}
