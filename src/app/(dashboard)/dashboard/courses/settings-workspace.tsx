"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DashboardLink } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import { InfoList } from "@/components/desktop";
import { COURSE_SETTINGS_SECTIONS, courseSettingsSection, type CourseSettingsSection, type CourseSettingsSectionInput } from "@/lib/course-settings-sections";
import { CourseSettingsSectionEditor } from "./settings-section-editor";
import type { UsageMetric } from "@/server/queries/usage";
import { courseSettingsPanelHref, isCourseSettingsPanel } from "@/lib/course-settings-panels";
import { CourseSettingsPanel } from "./settings-panel";

type Props = {
  panelContent?: ReactNode;
  storeId: string; name: string; planLabel: string; address: string; mapUrl: string; lineOfficialUrl: string;
  bankName: string; bankCode: string; bankAccountNumber: string; bookingLeadMinutes: number; cancellationLeadMinutes: number;
  canEdit: boolean; canPayment: boolean; canStaff: boolean; canPlans: boolean;
  canTrial?: boolean; canHours?: boolean; canDutyRead?: boolean; canDutyManage?: boolean; canReminders?: boolean; canCare?: boolean;
  canDigitalButler?: boolean; canReferralShare?: boolean; canUnassignedPlans?: boolean; subscriptionSummary?: string;
  bookingWindowDays?: number; bookableUntilDate?: string | null; dutyEnabled?: boolean;
  trialEnabled?: boolean; trialPrice?: number; usageMetrics?: UsageMetric[];
};
function Row({ title, summary, href, children }: { title: string; summary: string; href?: string; children?: ReactNode }) {
  return <section className="min-w-0 border-b border-earth-100 py-5 last:border-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="font-medium text-primary-900">{title}</h3><p className="mt-1 break-words text-sm text-earth-600">{summary}</p></div>{href && <DashboardLink href={courseSettingsPanelHref(href)} scroll={false} prefetch={false} aria-label={`開啟${title}`} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-sm text-primary-700">{title.includes("未指派") ? "查看名單" : "開啟設定"}</DashboardLink>}</div>{children}</section>;
}
const lead = (minutes: number) => minutes ? "上課前 " + minutes + " 分鐘" : "上課開始前";

export function CourseSettingsWorkspace(props: Props) {
  const search = useSearchParams();
  const pathname = usePathname();
  const active = courseSettingsSection(search.get("section"));
  const panel = search.get("panel");
  const [status, setStatus] = useState<Record<string, { dirty: boolean; pending: boolean }>>({});
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const allowLeave = useRef(false);
  const hasDirty = Object.values(status).some(value => value.dirty);
  const pending = Object.values(status).some(value => value.pending);
  const onStatus = useCallback((section: CourseSettingsSectionInput["section"], dirty: boolean, saving: boolean) => {
    setStatus(previous => previous[section]?.dirty === dirty && previous[section]?.pending === saving ? previous : { ...previous, [section]: { dirty, pending: saving } });
  }, []);
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
  function select(section: CourseSettingsSection) {
    const params = new URLSearchParams(search.toString()); params.set("view", "settings"); params.set("section", section);
    window.history.replaceState(null, "", pathname + "?" + params.toString());
  }
  const editor = (initial: CourseSettingsSectionInput, allowed: boolean) => allowed ? <CourseSettingsSectionEditor initial={initial} onStatus={onStatus} /> : <p className="mt-2 text-xs text-earth-500">僅供查看；修改請聯絡有權限的店長。</p>;
  return <div className="grid min-w-0 gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
    <nav aria-label="設定分類" className="min-w-0">
      <label className="block text-sm md:hidden">設定分類<select value={active} onChange={event => select(courseSettingsSection(event.target.value))} className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3">{COURSE_SETTINGS_SECTIONS.map(section => <option key={section.id} value={section.id}>{section.label}{status[section.id]?.dirty ? " · 未儲存" : ""}</option>)}</select></label>
      <div className="sticky top-4 hidden space-y-1 rounded-xl border border-earth-200 bg-white p-2 md:block">{COURSE_SETTINGS_SECTIONS.map(section => <button type="button" key={section.id} aria-current={active === section.id ? "page" : undefined} onClick={() => select(section.id)} className={"min-h-11 w-full rounded-lg px-3 py-3 text-left text-sm " + (active === section.id ? "bg-primary-50 font-semibold text-primary-800" : "text-earth-600 hover:bg-earth-50")}>{section.label}{status[section.id]?.dirty && <span className="ml-1 text-xs text-amber-700">未儲存</span>}</button>)}</div>
    </nav>
    <div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4 py-2 sm:px-6">
      <p className="border-b border-earth-100 py-3 text-xs text-earth-500">{props.name} · 課程模組{hasDirty ? " · 有未儲存修改" : ""}</p>
      <section hidden={active !== "store"} aria-label="店家資料">
        <Row title="店家資料" summary="名稱、地址與官方聯繫方式，統一在此維護。"><InfoList density="compact" items={[{ label: "店家名稱", value: props.name }, { label: "地址", value: props.address || "尚未填寫" }, { label: "地圖", value: props.mapUrl ? "已設定" : "尚未設定" }, { label: "官方 LINE", value: props.lineOfficialUrl ? "已設定" : "尚未設定" }]} />{editor({ section: "store", name: props.name, address: props.address, mapUrl: props.mapUrl, lineOfficialUrl: props.lineOfficialUrl }, props.canEdit)}</Row>
      </section>
      <section hidden={active !== "booking"} aria-label="營業與預約">
        <Row title="營業、公休與預約開放" summary={(props.bookableUntilDate ? "開放至 " + props.bookableUntilDate : "可預約未來 " + (props.bookingWindowDays ?? 14) + " 天") + "；名額依各堂課及教室容量設定。"} href={props.canHours ? "/dashboard/courses/hours" : undefined} />
        <Row title="預約與取消截止" summary={"預約截止：" + lead(props.bookingLeadMinutes) + "；自行取消截止：" + lead(props.cancellationLeadMinutes)}>
          {editor({ section: "booking", bookingLeadMinutes: props.bookingLeadMinutes, cancellationLeadMinutes: props.cancellationLeadMinutes }, props.canEdit)}
          <details className="mt-3 text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3">目前扣堂規則</summary><p>自由預約：先保留額度，出席扣點／扣堂；取消或未到釋放占用。固定期課：未到仍扣堂，不提供補課券。截止後請聯絡店長處理。</p></details>
        </Row>
        <Row title="值班聯動" summary={props.dutyEnabled ? "已啟用：教練值班須涵蓋完整課程。" : "未啟用：值班供參考，依實際排課開放預約。"} href={props.canDutyManage ? "/dashboard/settings/duty" : undefined} />
      </section>
      <section hidden={active !== "payment"} aria-label="收款與體驗">
        {props.canPayment ? <Row title="銀行轉帳資訊" summary={(props.bankName || "銀行尚未設定") + " · " + (props.bankAccountNumber ? "帳號末四碼 " + props.bankAccountNumber.slice(-4) : "帳號尚未設定")}>
          {editor({ section: "payment", bankName: props.bankName, bankCode: props.bankCode, bankAccountNumber: props.bankAccountNumber }, true)}
          <p className="mt-3 text-sm text-earth-600">付款聯繫：{props.lineOfficialUrl ? "沿用店家官方 LINE" : "尚未設定官方 LINE"} <button type="button" className="min-h-11 px-2 text-primary-700 underline" onClick={() => select("store")}>前往店家資料</button></p>
        </Row> : <p className="py-5 text-sm text-earth-500">目前帳號沒有付款設定權限。</p>}
        {props.canTrial && <Row title="體驗設定" summary={(props.trialEnabled ? "已啟用" : "未啟用") + " · 預設體驗價 NT$ " + (props.trialPrice ?? 0) + "；收款與出席分開。"} href="/dashboard/settings/trial" />}
      </section>
      <section hidden={active !== "notifications"} aria-label="通知與顧客經營">
        {props.canUnassignedPlans && <Row title="未指派方案提醒" summary="站內待辦：查看尚無方案紀錄的顧客；排除待核帳、已加入共用方案及到期／用完的方案。本階段不自動傳送 LINE。" href="/dashboard/courses/unassigned-plans" />}
        {props.canReminders && <Row title="提醒管理" summary="上課、到期、低額度提醒，以及人員通知與發送紀錄；個別開關在提醒頁查看。" href="/dashboard/courses/reminders" />}
        {props.canCare && <Row title="顧客關懷" summary="查看生日、未回課與方案關懷名單；清單不等同自動發訊。" href="/dashboard/growth" />}
        {props.canReferralShare && <Row title="推薦分享" summary="已開通；編輯學員分享給朋友的文案。" href="/dashboard/settings/referral-share" />}
        {props.canDigitalButler && <Row title="數位管家" summary="已開通；互動流程是否啟用，請進入查看。" href="/dashboard/settings/digital-butler" />}
        {!props.canUnassignedPlans && !props.canReminders && !props.canCare && !props.canReferralShare && !props.canDigitalButler && <p className="py-5 text-sm text-earth-500">目前沒有可使用的通知設定，請聯絡有權限的管理者。</p>}
      </section>
      <section hidden={active !== "subscription"} aria-label="系統方案與用量">
        <Row title="店家系統方案" summary={props.planLabel + " · 這是店家使用蒸管家的方案，不是販售給學員的課程方案。"}>{props.subscriptionSummary && <p className="mt-3 text-sm text-earth-600">{props.subscriptionSummary}</p>}<p className="mt-2 text-xs text-earth-500">續約或調整系統方案請聯絡總部。</p></Row>
        {props.usageMetrics && <Row title="目前用量" summary="本月預約按台灣時間的建立日期計算，取消仍計入已建立筆數。"><InfoList density="compact" items={props.usageMetrics.map(metric => ({ label: metric.label, value: metric.current.toLocaleString("zh-TW") + " / " + (metric.limit === null ? "不限" : metric.limit.toLocaleString("zh-TW")) }))} /></Row>}
      </section>
    </div>
    {leaveHref && <RightSheet open compact width={480} onClose={() => setLeaveHref(null)} labelledById="course-settings-leave-title"><header className="p-4"><h2 id="course-settings-leave-title" className="font-semibold">{pending ? "設定仍在儲存" : "尚有未儲存的修改"}</h2></header><div className="p-4"><p>{pending ? "請等儲存完成後再離開。" : "離開將捨棄尚未儲存內容；切換左側設定分類則會保留。"}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded border px-4" onClick={() => setLeaveHref(null)}>繼續編輯</button>{!pending && <button type="button" className="min-h-11 rounded bg-primary-700 px-4 text-white" onClick={() => { allowLeave.current = true; window.location.assign(leaveHref); }}>捨棄修改並離開</button>}</div></div></RightSheet>}
    {isCourseSettingsPanel(panel) && <CourseSettingsPanel key={panel} panel={panel}>{props.panelContent}</CourseSettingsPanel>}
  </div>;
}
