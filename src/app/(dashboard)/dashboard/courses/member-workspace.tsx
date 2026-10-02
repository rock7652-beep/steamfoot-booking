"use client";
import { CustomerDetailFields, CustomerPhoneLink } from "@/components/customer-detail-fields";
import { CustomerLabels } from "@/components/customer-labels";
import {useCourseDisplayOrder} from "@/components/admin/course-display-order";
import type {CourseOrderSnapshot} from "@/lib/course-display-order";

import {CourseTestDataFilter,isCourseTestData} from "@/components/admin/course-test-data-filter";
import {CourseStatusButton,useCourseStatusRows} from "@/components/admin/course-status-button";
import {MusicAssignmentPayment} from "@/components/admin/music-assignment-payment";
import { RetainedNoteEditor } from "@/components/operations/retained-note-editor";
import { saveCourseCustomerNote } from "@/server/actions/course-customer-note";
import { useRetainedState, retainedString, retainedPage } from "@/components/operations/operation-scope";
import {CourseOptionSelect} from "@/components/admin/course-option-select";
import {CourseCustomerPicker} from "@/components/admin/course-customer-picker";
import {CourseCardReservations} from "./card-reservations";
import {CourseCardBrowser, type CardBrowseState} from "./card-browser";
import {browseCourseCards} from "@/server/actions/course-browse";
import {CourseAssignmentPayment, type AssignmentSummary} from "@/components/admin/course-assignment-payment";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";
import { Fragment, useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { RightSheet } from "@/components/admin/right-sheet";
import { toLocalDateStr, dayRange, formatTWDateTime } from "@/lib/date-utils";
import {


  assignCoursePointCard,
  setCourseCardMembers,
} from "@/server/actions/course-members";
import { saveCourseStaff } from "@/server/actions/course-staff";
import type { getCourseCards } from "@/server/queries/course-members";

import { CustomerAttributionForm } from "@/components/customer-attribution-form";
import { saveCourseCustomerAttribution, searchCourseReferrerCandidates } from "@/server/actions/course-customer-attribution";
import { CourseCustomerPurchases } from "./customer-purchases";
import { CourseCustomerList } from "./customer-list";
import type { CourseCustomerPage } from "@/server/queries/course-customer-page";
import type { CustomerRow } from "../customers/_components/customers-table";
import { CourseCustomerBookings } from "./customer-bookings";
import { CourseCustomerDraftForm, CoursePlanDraftForm, type Person, type Plan } from "./course-profile-forms";
import { CourseCustomerHealth } from "./customer-health";


export type CourseCardView = Awaited<ReturnType<typeof getCourseCards>>[number];
const field =
  "min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function CourseMemberWorkspace({
  displayOrder,
  subjects=[],
  profitEnabled=true,
  canDelete=false,
  termSessions=[],
  view,
  templates,
  people,
  plans: sourcePlans,
  cards,
  canEdit,
  canCreate,
  canManageStaff,
  canAssign,
  canReadBookings,
  canReadTransactions,
  healthEnabled,
  customerRows,
  customerPage,
  canReadCards,
  assignmentStaff,
  canAssignManager,
  canMerge = false,
  canExport = false,
  canDiscount = false,
  music = false,
}: {
  displayOrder?:CourseOrderSnapshot;
  subjects?:{id:string;name:string;category:string;isActive:boolean}[];
  profitEnabled?:boolean;
  termSessions?:{id:string;name:string;startsAt:string}[];
  view: "customers" | "plans";
  templates: {id:string;name:string;category:string;isActive:boolean;musicPricePerLesson?:number|null;musicTermLessons?:number|null;musicValidityDaysPerTerm?:number|null;musicTrialMode?:string|null;musicScheduleMode?:string|null;classType?:string|null;musicSubjectId?:string|null}[];
  people: Person[];
  plans: Plan[];
  cards: CourseCardView[];
  canDelete?: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canManageStaff: boolean;
  canAssign: boolean;
  canReadBookings: boolean;
  canReadTransactions: boolean;
  healthEnabled: boolean;
  customerRows: CustomerRow[];
  customerPage?: CourseCustomerPage;
  canReadCards: boolean;
  assignmentStaff: {id:string;displayName:string}[];
  canAssignManager: boolean;
  canMerge?: boolean;
  canExport?: boolean;
  canDiscount?: boolean;
  music?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname=usePathname();
  function keepCustomerInUrl(id?:string){const next=new URLSearchParams(params.toString());if(id)next.set("customerId",id);else next.delete("customerId");window.history.replaceState(null,"",`${pathname}?${next}`);}
  const [purchaseFilter, setPurchaseFilter] = useState("all");
  const [sharedFilter, setSharedFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState(params.get("subjectId") ?? params.get("templateId") ?? "all");
  const initialPerson = view === "customers" ? people.find(p => p.id === params.get("customerId")) ?? null : null;


  const [plans,applyStatus,busyIds,setStatusBusy]=useCourseStatusRows(sourcePlans);
 const [hideTestData,setHideTestData]=useState(false);
 const [showInactive,setShowInactive]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [pending, start] = useTransition();
  const [search, setSearch] = useRetainedState(`course-${view}:search`, "", retainedString);
  const [page, setPage] = useRetainedState(`course-${view}:page`, 0, retainedPage);
  const [status, setStatus] = useRetainedState(`course-${view}:status`, "all", retainedString);
  const [panel, setPanel] = useState<
    "person" | "plan" | "assign" | "card" | "coach" | "health" | null
  >(initialPerson ? "person" : canCreate&&view==="plans"&&params.get("action")==="create"?"plan":null);
  const [selectedPerson, setPerson] = useState<Person | null>(initialPerson);
  const person = people.find(p => p.id === selectedPerson?.id) ?? selectedPerson;
  const [personTab, setPersonTab] = useState<"info" | "plans" | "records">("info");
  const [editingPerson, setEditingPerson] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [cardBrowse,setCardBrowse]=useState<CardBrowseState>({search:"",history:false,page:0});
  const [customerCardBrowse,setCustomerCardBrowse]=useState<CardBrowseState>({search:"",history:false,page:0});
  const [cardRevision,setCardRevision]=useState(0);
  const [loadedCard,setLoadedCard]=useState<CourseCardView|null>(null);
  const [cardLoading,setCardLoading]=useState(false);
  const [recordTab,setRecordTab]=useState<"purchases"|"bookings">(canReadTransactions ? "purchases":"bookings");
  const [planUnit, setPlanUnit] = useRetainedState("course-plans:unit", "all", retainedString);
  const [planArea, setPlanArea] = useState<"catalog" | "cards">("catalog");
  function canLeave() { return !pending && !formPending && (!dirty || window.confirm("尚有未儲存的變更，確定離開？")); }
  function close() { if (canLeave()) { setPanel(null); setDirty(false); if(view==="customers")keepCustomerInUrl(); } }
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planReadOnly,setPlanReadOnly]=useState(false);
  const [cardId, setCardId] = useState("");
  const [revenueStaffId,setRevenueStaffId]=useState("");
  const [planId, setPlanId] = useState(plans.find((p) => p.isActive)?.id ?? "");
  const [assignmentSummary,setAssignmentSummary]=useState<AssignmentSummary>({paid:null,valid:false});
  const [requestKey, setRequestKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const card = loadedCard?.id===cardId ? loadedCard : cards.find((c) => c.id === cardId);
  function selectCard(value:CourseCardView) {
    if (!open("card")) return;
    setCardId(value.id);setLoadedCard(value);setCardLoading(true);
  }
  useEffect(()=>{
    if(panel!=="card" || !cardId)return;
    let active=true;
    browseCourseCards({cardId}).then(r=>{
      if(!active)return;
      if(r.success && r.rows[0])setLoadedCard(r.rows[0]);
      else setError(r.success ? "找不到方案，請重新整理" : r.error);
    }).catch(()=>{if(active)setError("讀取方案失敗，請重新開啟");}).finally(()=>{if(active)setCardLoading(false);});
    return ()=>{active=false;};
  },[panel,cardId]);
  function open(value: typeof panel) {
    if (!canLeave()) return false;
    setDirty(false);
    if(value === "assign" || value === "card")setPersonTab("plans");
    if(value === "assign")setRevenueStaffId(customerRows.find(c=>c.id===person?.id)?.assignedStaff?.id??"");
    if (value === "person") { setPersonTab("info"); setEditingPerson(false); }
    if (value === "assign" && !plans.some((p) => p.id === planId && p.isActive && (!music || p.unit === "SESSION")))
      setPlanId(plans.find((p) => p.isActive && (!music || p.unit === "SESSION"))?.id ?? "");
    setError("");
    setNotice("");
    setRequestKey(crypto.randomUUID());
    setPanel(value);
    return true;
  }

  function preparePlan(next: Plan | null,readOnly=false) { if(open("plan")){setPlan(next);setPlanReadOnly(readOnly);} }
  const [formPending,setFormPending]=useState(false);
  function finishDraftForm(){setDirty(false);if(panel === "person" && person){setEditingPerson(false);}else{setPanel(null);}router.refresh();}
  const customerPanel = !!person && view === "customers" && panel !== "plan";
  function switchPersonTab(value: typeof personTab) {
    if (pending || formPending) return;
    if (panel !== "person" && !open("person")) return;
    setPersonTab(value);
  }

  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (data: FormData) => Promise<{ success: boolean; error?: string }>,
  ) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    start(async () => {
      try {
        const result = await action(data);
        if (!result.success) {
          setError(result.error ?? "儲存失敗");
          return;
        }
        setDirty(false);setCardRevision(n=>n+1);
        if (person && (panel === "card" || panel === "assign")) { setPanel("person"); setPersonTab("plans"); setEditingPerson(false); }
        else setPanel(null);
        if (panel === "plan") toast.success("方案已儲存");
        else setNotice(panel === "assign" ? "結帳完成，方案已加入" : "已儲存");
        window.dispatchEvent(new Event("customer-search-invalidated"));
        setTimeout(() => router.refresh(), 0);
      } catch {
        setError("連線中斷，請重試");
      }
    });
  }
  const order=useCourseDisplayOrder("plan",plans,displayOrder,canEdit&&!search&&status==="all"&&templateFilter==="all"&&purchaseFilter==="all"&&sharedFilter==="all"&&!hideTestData&&!busyIds.length,p=>p.isActive);
  const filteredPlans = plans
    .filter(
      (p) =>
        (!hideTestData||!isCourseTestData(p.name)) && (p.name + " " + templates.filter(t=>p.templateIds.includes(t.id)).map(t=>`${t.category} ${t.name}`).join(" ")).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
        (templateFilter === "all" || p.templateIds.includes(templateFilter) || p.templateIds.some(id=>templates.find(t=>t.id===id)?.musicSubjectId===templateFilter)) &&
        (status === "all" || p.isActive === (status === "active")) &&
        (music || purchaseFilter === "all" || (p.customerPurchasable !== false) === (purchaseFilter === "customer")) &&
        (music || sharedFilter === "all" || !!p.allowShared === (sharedFilter === "allowed")) &&
        (music || planUnit === "all" || p.unit === planUnit) && (!music || p.unit === "SESSION"),
    )
    .sort((a, b) => Number(b.isActive) - Number(a.isActive)||order.compare(a,b));
  const activeFilteredPlans=filteredPlans.filter(p=>p.isActive),inactiveFilteredPlans=filteredPlans.filter(p=>!p.isActive);
  const inactiveForced=status==="inactive"||!!search||templateFilter!=="all"||planUnit!=="all"||purchaseFilter!=="all"||sharedFilter!=="all";
  const inactiveExpanded=inactiveForced||showInactive;
  const totalRows = activeFilteredPlans.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(totalRows / 20) - 1));
  const visiblePlans=[...activeFilteredPlans.slice(currentPage*20,(currentPage+1)*20),...(inactiveExpanded?inactiveFilteredPlans:[])];
  const activePlans = order.rows.filter((item) => item.isActive && (!music || item.unit === "SESSION"));
  const pointPlans = activePlans.filter((item) => item.unit === "POINT").length;
  const sessionPlans = activePlans.filter((item) => item.unit === "SESSION").length;


  return (
    <>
      {view === "plans" && <div className="flex flex-wrap items-center gap-3">
      {view === "plans" && (
        <nav aria-label="方案管理分區" className="flex w-fit rounded-lg border border-earth-200 bg-earth-50 p-1">
          <button type="button" aria-pressed={planArea === "catalog"} className={`min-h-9 rounded-md px-4 text-sm font-medium ${planArea === "catalog" ? "bg-white text-primary-800 shadow-sm" : "text-earth-600"}`} onClick={() => setPlanArea("catalog")}>方案商品</button>
          {canReadCards && <button type="button" aria-pressed={planArea === "cards"} className={`min-h-9 rounded-md px-4 text-sm font-medium ${planArea === "cards" ? "bg-white text-primary-800 shadow-sm" : "text-earth-600"}`} onClick={() => setPlanArea("cards")}>顧客持有方案</button>}
        </nav>
      )}
      {view === "plans" && planArea === "catalog" && (
        <section aria-label="方案摘要" className="flex flex-wrap gap-2">
          {[
            ["全部方案", music ? plans.filter((plan) => plan.unit === "SESSION").length : plans.length],
            ["上架中", activePlans.length],
            ...(music ? [] : [["點數方案", pointPlans], ["堂數方案", sessionPlans]]),
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-earth-200 bg-white px-3 py-1 text-sm"><strong className="mr-2 tabular-nums text-primary-800">{value}</strong><span className="text-earth-500">{label}</span></div>)}
        </section>
      )}
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        {view === "customers" && <h1 className="mr-auto text-base font-semibold leading-6 text-primary-900">顧客管理</h1>}

        {view === "plans" && planArea === "catalog" && <input
          className={`${field} max-w-xs`}
          aria-label="搜尋"
          placeholder="搜尋方案"
          value={search}
          onChange={(e) => { setSelected([]);setSearch(e.target.value); setPage(0); }}
        />}
        {view === "plans" && planArea === "catalog" && (
          <select
            className={`${field} max-w-36`}
            aria-label="狀態篩選"
            value={status}
            onChange={(e) => { setSelected([]);setStatus(e.target.value); setPage(0); }}
          >
            <option value="all">全部狀態</option>
            <option value="active">上架</option>
            <option value="inactive">下架</option>
          </select>
        )}
        {view === "plans" && planArea === "catalog" && !music && <select className={`${field} max-w-40`} aria-label="方案單位" value={planUnit} onChange={e=>{setSelected([]);setPlanUnit(e.target.value);setPage(0);}}><option value="all">點數與堂數</option><option value="POINT">點數方案</option><option value="SESSION">堂數方案</option></select>}
        {view === "plans" && planArea === "catalog" && !music && <>
          <select aria-label="購買方式篩選" className={`${field} max-w-44`} value={purchaseFilter} onChange={e=>{setSelected([]);setPurchaseFilter(e.target.value);setPage(0);}}><option value="all">全部購買方式</option><option value="customer">顧客可購買</option><option value="backend">僅後台指派</option></select>
          <select aria-label="共卡篩選" className={`${field} max-w-40`} value={sharedFilter} onChange={e=>{setSelected([]);setSharedFilter(e.target.value);setPage(0);}}><option value="all">全部共卡設定</option><option value="allowed">允許共卡</option><option value="disabled">不允許共卡</option></select>
          {(search.trim() || status !== "all" || planUnit !== "all" || purchaseFilter !== "all" || sharedFilter !== "all") && <button type="button" className={button} onClick={()=>{setSelected([]);setSearch("");setStatus("all");setPlanUnit("all");setPurchaseFilter("all");setSharedFilter("all");setPage(0);}}>清除篩選</button>}
        </>}
        {view === "plans" && planArea === "catalog" && music && <select aria-label="適用課程篩選" className={`${field} max-w-72`} value={templateFilter} onChange={e=>{setSelected([]);setTemplateFilter(e.target.value);setPage(0);}}><option value="all">全部課程</option>{(music?subjects:templates).map(t=><option key={t.id} value={t.id}>{t.category || "未分類"} · {t.name}</option>)}</select>}
        {canCreate && (view === "customers" || planArea === "catalog") && (
          <button
            className={music || view === "customers" ? button : "min-h-11 whitespace-nowrap rounded-lg bg-primary-700 px-3 py-2 text-sm text-white hover:bg-primary-800"}
            onClick={() => {
              if (view === "customers") {
                setPerson(null);
                open("person");
              } else preparePlan(null);
            }}
          >
            ＋新增{view === "customers" ? "顧客" : "方案"}
          </button>
        )}
        {canAssign && (view === "customers" || planArea === "cards") && (
          <button
            className={button}
            disabled={!people.length || !plans.some((p) => p.isActive && (!music || p.unit === "SESSION"))}
            onClick={() => { setPerson(null); open("assign"); setRevenueStaffId(""); }}
          >
            購買方案
          </button>
        )}
      </div>
      {error && !panel && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {notice && (
        <p role="status" className="mb-3 text-primary-700">
          {notice}
        </p>
      )}
<div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {music&&view === "plans"&&planArea === "catalog"&&<CourseTestDataFilter names={plans.map(p=>p.name)} checked={hideTestData} onChange={v=>{setSelected([]);setPage(0);setHideTestData(v);}}/>}
      {view === "plans" && planArea === "catalog" && canEdit && <CourseBatchBar key={`${hideTestData}:${search}:${status}:${planUnit}:${templateFilter}:${purchaseFilter}:${sharedFilter}:${inactiveExpanded}`} canDelete={canDelete} names={Object.fromEntries(visiblePlans.map(p=>[p.id,p.name]))} kind="plan" blockedIds={busyIds} states={Object.fromEntries(visiblePlans.map(item=>[item.id,item.isActive]))} onApplied={applyStatus} onPendingChange={setStatusBusy} ids={visiblePlans.map(p=>p.id)} selected={selected} onChange={setSelected}/>}
</div>
      {view === "customers" ? <CourseCustomerList music={music} customerPage={customerPage} rows={customerRows} cards={cards} canReadCards={canReadCards}
        canAssignManager={canAssignManager} assignmentStaff={assignmentStaff}
        canMerge={canMerge} canExport={canExport}
        onView={id => { keepCustomerInUrl(id); setPerson(people.find(p => p.id === id) ?? null); setCustomerCardBrowse({search:"",history:false,page:0}); open("person"); }}
        onCreate={canCreate ? () => { setPerson(null); open("person"); } : undefined}
        onAssign={canAssign ? id => { keepCustomerInUrl(id); setPerson(people.find(p => p.id === id) ?? null); open("assign"); setRevenueStaffId(customerRows.find(c=>c.id===id)?.assignedStaff?.id??""); } : undefined}
      /> : (
      planArea === "catalog" ? <div className="overflow-x-auto rounded-lg border border-earth-200 bg-white">
        <table className={`${music ? "block sm:table" : "min-w-[1000px] table-fixed"} w-full text-left text-sm`}>
          <thead className={`${music?"hidden sm:table-header-group":""} bg-earth-50`}>
            <tr>
              {(music ? ["方案／適用課程", "堂數", "售價", "狀態", "操作"] : ["方案／適用課程", "額度", "售價", "有效天數", "購買方式", "共卡", "操作"]).map((h) => (
                <th key={h} className={`whitespace-nowrap px-3 py-2 font-medium ${!music ? ({"方案／適用課程":"w-[32%]","額度":"w-[10%]","售價":"w-[16%]","有效天數":"w-[12%]","購買方式":"w-[16%]","共卡":"w-[8%]"} as Record<string,string>)[h] ?? "" : ""} ${!music&&h==="操作"?"w-[72px] min-w-[72px] max-w-[72px] text-center":""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`${music?"block sm:table-row-group":""} divide-y divide-earth-100`}>
            {!filteredPlans.length && <tr><td colSpan={music ? 5 : 7} className="p-6 text-center text-earth-500">沒有符合條件的方案，請調整搜尋或篩選。</td></tr>}
            {visiblePlans.map((p,index) => (
                  <Fragment key={p.id}>
                  {!p.isActive&&(index===0||visiblePlans[index-1]?.isActive)&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={music ? 5 : 7} className="px-3 py-2"><button type="button" disabled={inactiveForced} className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600 disabled:cursor-default" onClick={()=>{setSelected([]);setShowInactive(v=>!v);}}><span>下架方案（{inactiveFilteredPlans.length}）</span><span>{inactiveForced?"篩選結果":inactiveExpanded?"收合":"展開"}</span></button></td></tr>}
                  <tr
                    {...order.rowProps(p.id)}
                    className={`${music?"grid grid-cols-[1fr_auto] sm:table-row":""} ${p.isActive ? "" : "bg-earth-50/80 text-earth-400"}`}
                  >
                    {music ? <td className="min-w-0 px-3 py-2"><div className="flex items-center gap-2">{canEdit&&order.handle(p.id,p.name)}{canEdit && <input type="checkbox" className="shrink-0" aria-label={`選取 ${p.name}`} disabled={busyIds.includes(p.id)} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>}<button type="button" className="min-h-11 min-w-0 break-words text-left font-medium text-primary-900 hover:underline" onClick={()=>preparePlan(p,!canEdit)}>{p.name}</button></div><div className={`mt-1 flex flex-wrap gap-x-2 ${music ? "text-xs text-earth-500" : "text-sm text-earth-700"}`}>{music && <span className="whitespace-nowrap">{p.customerPurchasable !== false ? "顧客可購買" : "僅後台指派"}{p.allowShared ? " · 共卡" : ""}</span>}<span>{p.templateIds.length ? templates.filter(t=>p.templateIds.includes(t.id)).map(t=>t.name).join("、") || "指定課程" : "本店所有課程"}</span></div>{music&&<p className="mt-1 flex flex-wrap gap-x-2 text-xs sm:hidden"><span>{p.points} 堂 · {p.validDays > 0 ? `${p.validDays} 天` : "無期限"}</span><span>NT$ {p.price.toLocaleString("zh-TW")} · 每堂 {Math.round(p.price/Math.max(1,p.points)).toLocaleString("zh-TW")}</span></p>}</td> : <td className="px-3 py-2"><div className="flex min-h-11 items-center gap-2">{canEdit && order.handle(p.id,p.name)}{canEdit && <input type="checkbox" className="shrink-0" aria-label={`選取 ${p.name}`} disabled={busyIds.includes(p.id)} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>}<button type="button" aria-label={p.name} data-plan-name={p.name} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 text-left hover:underline" onClick={()=>preparePlan(p,!canEdit)}><span className="block w-full truncate font-medium text-primary-900" title={p.name}>{p.name}</span><span className="block w-full max-w-96 truncate text-sm text-earth-700" title={p.templateIds.length ? templates.filter(t=>p.templateIds.includes(t.id)).map(t=>t.name).join("、") || "指定課程" : "全部課程"}>{p.templateIds.length ? templates.filter(t=>p.templateIds.includes(t.id)).map(t=>t.name).join("、") || "指定課程" : "全部課程"}</span></button></div></td>}
                    <td className={`${music?"hidden sm:table-cell":""} whitespace-nowrap px-3 py-2`}>{p.points} {p.unit === "SESSION" ? "堂" : "點"}{music && <p className="text-xs text-earth-500">{p.validDays > 0 ? `${p.validDays} 天` : "無期限"}</p>}</td>
                    <td className={`${music?"hidden sm:table-cell":""} whitespace-nowrap px-3 py-2`}>NT$ {p.price.toLocaleString("zh-TW")}{(music || p.price > 0) && <p className="text-xs text-earth-500">NT$ {Math.round(p.price / Math.max(1, p.points)).toLocaleString("zh-TW")}／{p.unit === "SESSION" ? "堂" : "點"}</p>}</td>
                    {!music && <>
                    <td className="whitespace-nowrap px-3 py-2">{p.validDays > 0 ? `${p.validDays} 天` : "無期限"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{p.customerPurchasable !== false ? "顧客可購買" : "僅後台指派"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{p.allowShared ? "允許" : "不允許"}</td></>}
                    {music&&(<td className={`${music?"hidden sm:table-cell":""} px-3 py-2`}><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${p.isActive ? "bg-emerald-50 text-emerald-700" : "bg-earth-100 text-earth-500"}`}>{p.isActive ? "上架" : "下架"}</span></td>)}
                    <td className={`whitespace-nowrap px-3 py-2 align-middle ${!music?"w-[72px] min-w-[72px] max-w-[72px] text-center":""}`}>
                      {!music ? <div className="flex items-center justify-center">{canEdit&&<ExclusiveMenu quiet triggerText="⋯" label={`${p.name}操作`}><button type="button" className="min-h-11 w-full px-3 text-left text-sm" disabled={busyIds.includes(p.id)} onClick={()=>preparePlan(p)}>編輯</button><CourseStatusButton quiet kind="plan" id={p.id} disabled={busyIds.includes(p.id)} active={p.isActive} onApplied={applyStatus} onPendingChange={setStatusBusy}/></ExclusiveMenu>}</div> : <>                      {music&&<div className="sm:hidden"><span className="text-xs text-earth-500">{p.isActive?"上架":"下架"}</span>{canEdit&&<details><summary aria-label={`${p.name}操作`} className="flex min-h-11 cursor-pointer items-center justify-center rounded border border-earth-200 px-3">⋯</summary><div className="flex flex-col gap-1 py-1"><button className="min-h-11 rounded border px-2" disabled={busyIds.includes(p.id)} onClick={()=>preparePlan(p)}>編輯</button><CourseStatusButton kind="plan" id={p.id} disabled={busyIds.includes(p.id)} active={p.isActive} onApplied={applyStatus} onPendingChange={setStatusBusy}/></div></details>}</div>}
                      {canEdit && (
                        <div className={`${music?"hidden sm:flex":"flex"} gap-1`}>
                          <button className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" disabled={busyIds.includes(p.id)} onClick={() => preparePlan(p)}>編輯</button>
                          <CourseStatusButton kind="plan" id={p.id} disabled={busyIds.includes(p.id)} active={p.isActive} onApplied={applyStatus} onPendingChange={setStatusBusy}/>
                        </div>
                      )}
</>}
                    </td>
                  </tr>
                  </Fragment>
                ))}
            {!inactiveExpanded&&inactiveFilteredPlans.length>0&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={music ? 5 : 7} className="px-3 py-2"><button type="button" className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600" onClick={()=>{setSelected([]);setShowInactive(true);}}><span>下架方案（{inactiveFilteredPlans.length}）</span><span>展開</span></button></td></tr>}
          </tbody>
        </table>
      </div> : canReadCards ? <CourseCardBrowser canReadBookings={canReadBookings} state={cardBrowse} onChange={setCardBrowse} onSelect={selectCard} revision={cardRevision}/> : null
      )}
      {view === "plans" && planArea === "catalog" && totalRows > 20 && <nav aria-label="清單分頁" className="mt-3 flex items-center justify-end gap-3"><span className="text-sm">共 {totalRows} 筆 · 第 {currentPage + 1}／{Math.ceil(totalRows / 20)} 頁</span><button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一頁</button><button className={button} disabled={(currentPage + 1) * 20 >= totalRows} onClick={() => setPage(currentPage + 1)}>下一頁</button></nav>}
      {panel && (
        <RightSheet presentation="centered"
          open
          onClose={close}
          width={customerPanel || panel === "assign" ? 880 : panel==="plan"&&!music?760:640}
          maxHeight={customerPanel ? 720 : undefined}
          fitContent={!customerPanel && (panel === "assign" || panel === "person" || panel === "health" || panel === "card")}
          labelledById="course-member-sheet"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-earth-100 bg-primary-50/60 px-4 py-2">
            <h2 id="course-member-sheet" className="text-base font-semibold text-primary-900">
              {customerPanel ? person.name : panel === "person"
                ? person ? person.name : "新增顧客"
                : panel === "health" ? `${person?.name ?? "顧客"} · 健康追蹤` : panel === "plan"
                  ? planReadOnly&&plan ? plan.name : plan ? "編輯方案" : "新增方案"
                  : panel === "assign"
                    ? "購買方案"
                    : panel === "coach"
                      ? "加入為教練"
                      : "方案與共卡"}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              {panel==="plan"&&planReadOnly&&canEdit&&<ExclusiveMenu quiet triggerText="⋯" label="方案操作"><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>setPlanReadOnly(false)}>編輯</button></ExclusiveMenu>}
              {panel === "person" && person && personTab === "info" && !editingPerson && canEdit && <button type="button" className="min-h-11 rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-100" onClick={()=>setEditingPerson(true)}>編輯顧客資料</button>}
              {panel === "person" && person && editingPerson && <button type="button" className="min-h-11 px-3 text-sm text-primary-700" onClick={()=>{if(canLeave()){setEditingPerson(false);setDirty(false);}}}>返回基本資料</button>}
            <button
              type="button"
              className={button}
              disabled={pending}
              onClick={close}
            >
              關閉
            </button>
            </div>
          </header>
          {(customerPanel || panel === "person") && person && <nav aria-label="顧客詳細資料分區" className="flex shrink-0 flex-wrap gap-1 border-b border-earth-200 bg-earth-50 px-4 py-2">
            {([ ["info","基本資料"], ...(canReadCards ? [["plans","持有方案"]] : []), ...((canReadTransactions || canReadBookings) ? [["records","購買與上課"]] : []) ]).map(([value,label])=><button key={value} type="button" aria-pressed={panel !== "health" && personTab===value} className={`min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary-600 ${panel !== "health" && personTab===value?"bg-primary-50 font-semibold text-primary-800":"text-earth-600 hover:bg-primary-50"}`} onClick={()=>switchPersonTab(value as typeof personTab)}>{label}</button>)}
            {healthEnabled && <button type="button" aria-pressed={panel === "health"} className={`min-h-11 rounded-lg px-3 text-sm ${panel === "health" ? "bg-primary-50 font-semibold text-primary-800" : "text-earth-600 hover:bg-primary-50"}`} onClick={()=>{if(panel !== "health")open("health");}}>健康追蹤</button>}
          </nav>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {notice && <p role="status" className="mb-3 text-primary-700">{notice}</p>}
            {error && (
              <p role="alert" className="mb-3 text-red-700">
                {error}
              </p>
            )}
            {panel === "coach" && person && (
              <form
                id="course-member-form"
                onChange={()=>setDirty(true)}
                onSubmit={(e) =>
                  submit(e, (fields) =>
                    saveCourseStaff({
                      name: person.name,
                      kind: "coach",
                      emergencyContactName:fields.get("emergencyContactName"),
                      emergencyContactPhone:fields.get("emergencyContactPhone"),
                      emergencyContactRelation:fields.get("emergencyContactRelation"),
                      customerId: person.id,
                      requestKey,
                    }),
                  )
                }
              >
                <p>
                  {person.name}{" "}
                  將使用已綁定的會員帳號存取「我的工作」，不建立後台密碼。
                </p>
                {[["emergencyContactName","緊急聯絡姓名",person.emergencyContactName],["emergencyContactPhone","緊急聯絡電話",person.emergencyContactPhone],["emergencyContactRelation","緊急聯絡關係",""]].map(([name,label,value])=><label key={name} className="block">{label}<input className={field} name={name!} required defaultValue={value ?? ""}/></label>)}
                <p className="text-sm">建立後請到人員管理一次設定授課資格，再新增排課。</p>
              </form>
            )}
            {panel === "health" && healthEnabled && person && <CourseCustomerHealth customerId={person.id} canEdit={canEdit} onDirtyChange={setDirty} onPending={setFormPending} />}
            {panel === "person" && person && personTab === "plans" && <section className="mb-4 space-y-3">
              {personTab === "plans" && canAssign && <button className={button} onClick={() => open("assign")}>購買方案</button>}
              {canReadCards && personTab === "plans" && <section aria-label="持有與共卡方案">
                <CourseCardBrowser canReadBookings={canReadBookings} customerId={person.id} state={customerCardBrowse} onChange={setCustomerCardBrowse} onSelect={selectCard} revision={cardRevision}/>

              </section>}

            </section>}
            {panel !== "person" && panel !== "health" && view === "customers" && person && <button type="button" className="mb-3 min-h-11 text-sm text-primary-700" disabled={pending} onClick={()=>switchPersonTab(panel === "card" || panel === "assign" ? "plans" : "info")}>‹ 返回 {person.name} 詳情</button>}
            {panel === "person" && person && personTab === "info" && !editingPerson && <section className="space-y-3">
              <CustomerDetailFields items={[
                {label:"電話",value:<CustomerPhoneLink phone={person.phone}/>},
                ...(!music?[{label:"所屬店長",value:customerRows.find(c=>c.id===person.id)?.assignedStaff?.displayName??null}]:[]),
                {label:"電子信箱",value:person.email},{label:"生日",value:person.birthday},
                {label:"性別",value:({male:"男",female:"女",other:"其他"} as Record<string,string>)[person.gender??""]},
                {label:"緊急聯絡人",value:person.emergencyContactName},
                {label:"緊急聯絡電話",value:person.emergencyContactPhone?<CustomerPhoneLink phone={person.emergencyContactPhone}/>:null},
                {label:"地址",value:person.address,full:true},
              ]}/>
              <CustomerLabels customerId={person.id} readOnly={!canEdit} maxVisible={5}/>

              <RetainedNoteEditor quiet optimistic key={person.id} stateKey={`customer-note:${person.id}`} title="店內備註" hint="店長與授課教練可見"
                placeholder="輸入服務時需要留意的事項" maxLength={1000} value={person.serviceNote} canEdit={canEdit}
                save={(serviceNote, expectedServiceNote) => saveCourseCustomerNote({ customerId: person.id, serviceNote, expectedServiceNote })}
                onSaved={() => router.refresh()} />
              {personTab === "info" && <details className="border-b border-earth-100 pb-2"><summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-700">身分與歸屬資訊</summary><dl className="space-y-2 text-sm">
                <div>LINE 綁定：{customerRows.find(c=>c.id===person.id)?.lineLinkStatus === "LINKED" ? "已綁定" : "尚未綁定"}</div>
              </dl>
                {canManageStaff && <button type="button" className="min-h-11 text-sm text-primary-700" onClick={() => open("coach")}>加入為教練</button>}<CustomerAttributionForm staffLabel="所屬店長" hideStaff={music} key={`attribution-${person.id}-${customerRows.find(c=>c.id===person.id)?.assignedStaff?.id??""}-${customerRows.find(c=>c.id===person.id)?.sponsor?.id??""}`} customerId={person.id} currentStaffId={customerRows.find(c=>c.id===person.id)?.assignedStaff?.id??null} currentSponsor={customerRows.find(c=>c.id===person.id)?.sponsor??null} staffOptions={assignmentStaff} canAssign={canAssignManager} saveAction={saveCourseCustomerAttribution} searchAction={searchCourseReferrerCandidates} onSaved={()=>router.refresh()} />
              </details>}
            </section>}
            {panel === "person" && (
              <CourseCustomerDraftForm key={person?.id??"new"} person={person} canEdit={canEdit} canCreate={canCreate} hidden={!!person && (!editingPerson || personTab!=="info")} onPending={setFormPending} onSaved={finishDraftForm} />
            )}
            {panel === "person" && personTab === "records" && canReadTransactions && canReadBookings && <nav aria-label="紀錄種類" className="flex gap-2">{([ ["purchases","交易紀錄"],["bookings","上課紀錄"] ] as const).map(([value,label])=><button type="button" key={value} aria-pressed={recordTab===value} className={`min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary-600 ${recordTab===value ? "bg-primary-50 font-semibold text-primary-800":"text-earth-600 hover:bg-primary-50"}`} onClick={()=>setRecordTab(value)}>{label}</button>)}</nav>}
            {panel === "person" && personTab === "records" && person && canReadTransactions && recordTab === "purchases" && <CourseCustomerPurchases key={`purchases-${person.id}`} customerId={person.id} />}
            {panel === "person" && personTab === "records" && person && canReadBookings && recordTab === "bookings" && <CourseCustomerBookings key={`bookings-${person.id}`} customerId={person.id} />}
            {panel==="plan"&&planReadOnly&&plan&&<dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{[["方案",plan.termSessionIds?.length?"期課":plan.unit==="POINT"?"點數":"堂數"],["額度",`${plan.points} ${plan.unit==="POINT"?"點":"堂"}`],["售價",`NT$ ${plan.price.toLocaleString("zh-TW")}`],["效期",`${plan.validDays} 天`],["狀態",plan.isActive?"上架":"下架"],["適用課程",plan.templateIds.length?templates.filter(t=>plan.templateIds.includes(t.id)).map(t=>t.name).join("、")||"指定課程":"全部課程"],["購買方式",plan.customerPurchasable===false?"僅後台指派":"顧客可購買"],["共卡",plan.allowShared?"允許":"不允許"]].map(([label,value])=><div key={label} className="border-b border-earth-100 py-2 text-sm"><dt className="text-earth-500">{label}</dt><dd className="mt-1 text-primary-900">{value}</dd></div>)}{plan.termSessionIds?.length?<div className="sm:col-span-2 text-sm"><dt className="text-earth-500">上課日期 · {plan.termSessionIds.length} 堂</dt><dd>{termSessions.filter(s=>plan.termSessionIds?.includes(s.id)).map(s=><p key={s.id} className="py-1">{formatTWDateTime(new Date(s.startsAt))} · {s.name}</p>)}</dd></div>:null}</dl>}
            {panel === "plan" && !planReadOnly && (

              <CoursePlanDraftForm key={plan?.id??"new"} plan={plans.find(p=>p.id===plan?.id)??plan} templates={templates} subjects={subjects} termSessions={termSessions} profitEnabled={profitEnabled} music={music} initialTemplateId={templateFilter === "all" ? undefined : templateFilter} onPending={setFormPending} onSaved={finishDraftForm} onDirtyChange={setDirty} />

            )}
            {panel === "assign" && (
              <form
                id="course-member-form"
                onChange={()=>setDirty(true)}
                className="grid grid-cols-1 gap-5 min-[1024px]:grid-cols-2"
                onSubmit={(e) =>
                  submit(e, (d) =>
                    assignCoursePointCard({
                      planId,
                      customerId: d.get("customerId"),
                      expiresDate: d.get("expires"),
                      musicPurchaseTerms:music?Number(d.get("musicPurchaseTerms")??1):undefined,
                      musicValidityDays:d.get("musicValidityDays")?Number(d.get("musicValidityDays")):undefined,
                      musicManualBonus:music?Number(d.get("musicManualBonus")??0):undefined,
                      musicJoinSessionId:music?String(d.get("musicJoinSessionId")??"")||undefined:undefined,
                      expectedListPrice: Number(d.get("expectedListPrice")),
                      expectedStoreCost: Number(d.get("expectedStoreCost")),
                      revenueStaffId: music ? "" : String(d.get("revenueStaffId")??""),
                      discountKind: d.get("discountKind"),
                      discountValue: Number(d.get("discountValue")),
                      paymentMethod: d.get("paymentMethod"),
                      transferLastFour: String(d.get("transferLastFour") ?? ""),
                      requestKey,
                    }),
                  )
                }
              >
                <fieldset disabled={pending} className="min-w-0 space-y-3">
                <h3 className="font-semibold">方案資料</h3>
                {person ? <div><span className="text-sm text-earth-500">顧客</span><p className="font-medium">{person.name} · {person.phone}</p><input type="hidden" name="customerId" value={person.id}/></div> : <label className="block">
                  顧客
                  <CourseCustomerPicker name="customerId" required onChange={customers=>{setDirty(true);setRevenueStaffId(customers[0] ? customerRows.find(row=>row.id===customers[0].id)?.assignedStaff?.id ?? "" : "");}}/>

                </label>}
                <label className="block">
                  方案
                  <CourseOptionSelect label="方案" required value={planId} options={activePlans.map(p=>({id:p.id,label:`${p.name} · ${p.points} ${p.unit==="SESSION" ? "堂":"點"}`}))} onChange={id=>{setAssignmentSummary({paid:null,valid:false});setPlanId(id);setDirty(true);}}/>

                </label>
                {music ? <p className="text-sm text-earth-600"><input type="hidden" name="expires" value="2099-12-31"/>從第一堂實際上課日起算，依方案有效天數自動到期。</p> : <label className="block" key={planId}>
                  有效至（含當日）
                  <input
                    className={field}
                    type="date"
                    name="expires"
                    required
                    defaultValue={toLocalDateStr(
                      new Date(
                        dayRange(toLocalDateStr()).start.getTime() +
                          ((plans.find((p) => p.id === planId)?.validDays ??
                            90) -
                            1) *
                            86400000,
                      ),
                    )}
                  />

                </label>}
                {profitEnabled&&!music&&<label className="block">所屬店長<CourseOptionSelect label="所屬店長" name="revenueStaffId" placeholder="請選擇所屬店長" value={revenueStaffId} onChange={id=>{setRevenueStaffId(id);setDirty(true);}} options={assignmentStaff.map(s=>({id:s.id,label:s.displayName}))}/></label>}

                {plans.find(p=>p.id===planId)?.termSessionIds?.length ? <p className="text-sm text-earth-600">固定期課：{plans.find(p=>p.id===planId)!.termSessionIds!.length} 堂，依方案已設定課次安排。</p> : null}
                </fieldset>
                <fieldset disabled={pending} className="min-w-0 min-[1024px]:border-l min-[1024px]:border-earth-200 min-[1024px]:pl-5">
                  {music ? plans.filter(p=>p.id===planId).map(p=><MusicAssignmentPayment key={p.id} plan={p} canDiscount={canDiscount} onSummary={setAssignmentSummary}/>) : <CourseAssignmentPayment profitEnabled={profitEnabled&&!music} key={planId} storeCost={plans.find(p=>p.id===planId)?.storeCost??0} price={plans.find(p=>p.id===planId)?.price ?? 0} canDiscount={canDiscount} showAllocation={canReadTransactions&&profitEnabled&&!music} onSummary={setAssignmentSummary}/>}
                </fieldset>
              </form>
            )}
            {panel === "card" && card && (
              <>
                {cardLoading && <p role="status">讀取方案詳細資料中…</p>}
                <CourseCardSummary card={card} />
                {canReadBookings && !cardLoading && !error && card.held > 0 && <CourseCardReservations cardId={card.id} held={card.held} unit={card.unit} revision={cardRevision}/>}
                {canAssign && card.allowShared && !cardLoading && !error && (
                  <form
                    id="course-member-form"
                onChange={()=>setDirty(true)}
                    className="mt-4 space-y-2"
                    onSubmit={(e) =>
                      submit(e, (d) =>
                        setCourseCardMembers({
                          cardId: card.id,
                          customerIds: d.getAll("members"),
                        }),
                      )
                    }
                  >
                    <h3 className="font-medium">共卡授權成員</h3>
                    <p className="text-sm text-earth-500">
                      每位成員均可只替另一位成員預約。
                    </p>
                    <CourseCustomerPicker onChange={()=>setDirty(true)} key={card.id} name="members" initial={card.members} multiple/>

                  </form>
                )}
                {canAssign && !card.allowShared && !cardLoading && !error && <p className="mt-4 rounded-lg bg-earth-50 p-3 text-sm text-earth-600">此方案設定為不允許共卡，既有持有人資料仍會保留。</p>}
                <CourseCardEntries card={card} />
              </>
            )}
          </div>
          {panel !== "health" && (panel!=="plan"||!planReadOnly) && (panel !== "person" || (person ? canEdit && editingPerson && personTab === "info" : canCreate)) && (panel !== "card" || (canAssign && card?.allowShared)) && (
            <footer className="shrink-0 border-t border-earth-100 bg-white px-4 py-3">
              {panel === "assign" && <p className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span>{person?.name} · {plans.find(p=>p.id===planId)?.name}</span><strong>實收 {assignmentSummary.paid === null ? "—" : `NT$ ${assignmentSummary.paid.toLocaleString()}`}</strong></p>}
              <button
                form="course-member-form"
                type="submit"
                className={`${button} w-full bg-primary-700 text-white`}
                disabled={pending || formPending || (panel === "card" && (cardLoading || !!error)) || (panel === "assign" && (!planId || !assignmentSummary.valid))}
              >
                {pending || formPending ? "儲存中…" : panel === "assign" ? "確認結帳" : panel === "card" ? "儲存共卡成員" : "儲存"}
              </button>
            </footer>
          )}
        </RightSheet>
      )}
    </>
  );
}
export function CourseCardSummary({ card }: { card: CourseCardView }) {
  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-semibold">{card.name}</h3>
      <p>
        剩餘 {card.remaining} {card.unit === "SESSION" ? "堂" : "點"} · 已預約 {card.held} {card.unit === "SESSION" ? "堂" : "點額度"}
        {!card.closed && !card.expired && <> · {card.unit === "SESSION" ? `還可預約 ${card.available} 堂` : `可用 ${card.available} 點`}</>}
      </p>
      <p>
        期限：{card.musicValidityDays && !card.musicActivatedAt ? `首次上課起 ${card.musicValidityDays} 天` : toLocalDateStr(new Date(card.expiresAt))}
        {new Date(card.expiresAt) < new Date() ? "（已到期）" : ""}
      </p>
      <p>{card.members.length>1?"共同餘額 · 共卡人":"持有人"}：{card.members.map((m) => m.name).join("、")}</p>
      {(card.closed || card.expired) ? <p>{card.closed ? "已停用" : "已到期"} · 剩餘額度僅供查詢</p> : card.remaining>0 && card.available===0 && card.held>=card.remaining ? <p>額度已全數預約</p> : card.remaining===0 ? <p>額度已用完</p> : null}
    </div>
  );
}
export function CourseCardEntries({ card }: { card: CourseCardView }) {
  const labels: Record<string, string> = {
    GRANT: "取得額度",
    REFUND: "退款收回額度",
    VOID: "誤建作廢收回額度",
    RESERVE: "預約保留額度",
    RELEASE: "取消預約返還額度",
    DEBIT: "出席使用",
  };
  return (
    <details className="mt-5">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">最近額度紀錄（{card.entries.length} 筆）</summary>
      <ul className="divide-y text-sm">
        {card.entries.map((e) => (
          <li key={e.id} className="py-2">
            {formatTWDateTime(new Date(e.createdAt))} ·{" "}
            {e.kind.startsWith("CORRECT:") ? "點名更正" : labels[e.kind.split(":")[0]] ?? "額度異動"} {e.points} {card.unit === "SESSION" ? "堂" : "點"}
          </li>
        ))}
      </ul>
    </details>
  );
}
