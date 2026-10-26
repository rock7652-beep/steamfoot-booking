"use client";
import {coursePlanModeAllowed} from "@/lib/course-scheduling-modes";
import {useCoursePersonnelText} from "@/components/course-personnel-label";

import {CustomerAttributionForm} from "@/components/customer-attribution-form";
import {DeferredCustomerSupport} from "./deferred-customer-support";
import {canCloseConfirmedSettingsSave} from "@/lib/settings-save-outcome";
import type {CourseCustomerSource} from "./member-source";
import type {CatalogStatusDriver} from "@/lib/course-catalog-driver";
import {CourseServicePriceDraftForm} from "./course-profile-forms";
import type {CourseServicePrice} from "@/lib/course-service-price";
const emptyServicePrices:CourseServicePrice[]=[];
import type {CoursePlanCatalogPort} from "./course-profile-forms";
import {studentScheduleHref} from "@/lib/music-student-navigation";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
import { StoreMemberConnectionPanel } from "@/components/admin/store-member-connection-panel";
import { courseTemplateLabel } from "@/lib/course-template-presentation";
import { useConfirmedSettingsRows } from "@/components/admin/use-confirmed-settings-rows";
import { coursePlanSnapshot } from "@/lib/course-plan-snapshot";
import { CourseSetupStepBadge } from "@/components/admin/course-setup-step-badge";
import { DashboardLink } from "@/components/dashboard-link";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import { courseDisplayText } from "@/lib/course-display-text";
import {musicTeachingKey} from "@/lib/music-teaching-item";
import {musicPlanItems} from "@/lib/music-catalog";
import { isMusicPreviewPage, publishMusicFinanceChange } from "@/lib/music-finance-sync";
import {musicCheckoutTransport} from "@/lib/music-checkout-transport";
import { musicNoteDisplay } from "@/lib/music-display";
import { MusicStudentCourses } from "./music-student-courses";
import { MusicStudentOverview } from "./music-student-overview";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";
import { CourseSharedCardIndicator } from "./course-shared-card-indicator";
import { useCardDetail } from "./use-card-detail";
import { useCustomerPanelUrl } from "./use-customer-panel-url";
import { FrontendPreviewQuickLink } from "@/components/frontend-preview/quick-link";
import {fitnessEditorFooter, fitnessEditorSave} from "@/components/admin/course-editor-styles";
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
import {calculateCourseSaleAllocation} from "@/lib/course-sale-allocation";
import {CourseAssignmentPayment, type AssignmentSummary} from "@/components/admin/course-assignment-payment";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";
import { Fragment, useCallback,useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { CustomerPanelAdvanced } from "../customers/_components/customer-panel-advanced";
import { SettingsPanelContext } from "@/components/admin/settings-panel-context";
import { useCustomerPanelGuard } from "@/components/admin/use-customer-panel-guard";
import { RightSheet } from "@/components/admin/right-sheet";
import { toLocalDateStr, dayRange, formatTWDateTime } from "@/lib/date-utils";
import {


  assignCoursePointCard,
  setCourseCardMembers,
} from "@/server/actions/course-members";
import { saveCourseStaff } from "@/server/actions/course-staff";
import type { getCourseCards } from "@/server/queries/course-members";

import {CourseCustomerAttribution} from "./customer-attribution";
import { saveCourseCustomerAttribution, searchCourseReferrerCandidates } from "@/server/actions/course-customer-attribution";
import { CourseCustomerPurchases } from "./customer-purchases";
import { CourseCustomerList } from "./customer-list";
import type { CourseCustomerPage } from "@/server/queries/course-customer-page";
import type { CustomerRow } from "../customers/_components/customers-table";
import { CourseCustomerBookings } from "./customer-bookings";
import {StudentMakeupStatus} from "./student-makeup-status";
import { CourseCustomerDraftForm, CoursePlanDraftForm, type Person, type Plan } from "./course-profile-forms";
import { CourseCustomerHealth } from "./customer-health";


export type CourseCardView = Awaited<ReturnType<typeof getCourseCards>>[number];
const field =
  "min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function CourseMemberWorkspace({
  source,panelOnly=false,initialCustomerId,onPanelClose,initialAction,
  catalogSource,
  subjectLabel="教學項目",
  sportsNative=false,
  dataScope,
  previewStoreId,
  displayOrder,
  subjects=[],
  musicTeachers=[], canEditMusicTeachers=false,
  profitEnabled=true,
  canDelete=false,
  termSessions=[],
  view,
  templates,
  people:sourcePeople,
  plans: sourcePlans,
  cards,
  canEdit,
  canCreate,
  canManageStaff,
  canAssign,
  canSchedule=false,
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
  sportsData,
  schedulingModes,
  music = false,
  sharedCardState = "ENABLED",
}: {
  source?:CourseCustomerSource;panelOnly?:boolean;initialAction?:'assign';initialCustomerId?:string;onPanelClose?:()=>void;
  subjectLabel?:string;
  catalogSource?:{order?:import("@/lib/course-display-order").CourseOrderWriter;status:CatalogStatusDriver;form:CoursePlanCatalogPort};
  sportsNative?:boolean;
  sportsData?: SportsSnapshot;
  schedulingModes?: import("@/lib/course-scheduling-modes").CourseSchedulingModes;
  previewStoreId?: string;
  displayOrder?:CourseOrderSnapshot;
  subjects?:{id:string;name:string;category:string;isActive:boolean}[];
  musicTeachers?:{id:string;name:string;active:boolean;qualificationIds:string[]}[];
  canEditMusicTeachers?:boolean;
  profitEnabled?:boolean;
  termSessions?:{id:string;name:string;startsAt:string}[];
  view: "customers" | "plans";
  templates: {displayName?:string;currentTeaching?:boolean;id:string;name:string;category:string;isActive:boolean;musicTeacherShare?:number|null;musicPricePerLesson?:number|null;musicTermLessons?:number|null;musicValidityDaysPerTerm?:number|null;musicTrialMode?:string|null;musicScheduleMode?:string|null;classType?:string|null;musicSubjectId?:string|null}[];
  people: Person[];
  plans: Plan[];
  dataScope?: "operational" | "legacy";
  cards: CourseCardView[];
  canDelete?: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canManageStaff: boolean;
  canAssign: boolean;canSchedule?:boolean;
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
  sharedCardState?: FeaturePresentationState;
}) {
  const personnelText = useCoursePersonnelText();
  const IdentitySection = music ? "section" : "details";
  const confirmDiscard=source?.confirmDiscard??catalogSource?.form.confirmDiscard??true;
  const compactCatalog=!!catalogSource?.form.compact;
  const supportGuard = useCustomerPanelGuard(confirmDiscard);
  const [noteReceipts,setNoteReceipts]=useState<Record<string,{source:string|null;value:string|null}>>({});
  const people=sourcePeople.map(p=>noteReceipts[p.id]&&p.serviceNote===noteReceipts[p.id].source?{...p,serviceNote:noteReceipts[p.id].value}:p);
  const visibleCustomerRows=customerRows.map(row=>noteReceipts[row.id]&&row.serviceNote===noteReceipts[row.id].source?{...row,serviceNote:noteReceipts[row.id].value}:row);
  const [editingAttribution, setEditingAttribution] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const [purchaseFilter, setPurchaseFilter] = useState("all");
  const [savedSharedFilter, setSharedFilter] = useState("all");
  const sharedFilter = !music && sharedCardState === "HIDDEN" ? "all" : savedSharedFilter;
  const sharingVisible = music || sharedCardState !== "HIDDEN";
  const sharingEnabled = music || sharedCardState === "ENABLED";
  const [templateFilter, setTemplateFilter] = useState(params.get("serviceId") ?? params.get("subjectId") ?? params.get("templateId") ?? "all");
  const initialPerson = view === "customers" ? people.find(p => p.id === (initialCustomerId??params.get("customerId"))) ?? null : null;


  const confirmedPrices=useConfirmedSettingsRows(catalogSource?.form.servicePricing?.rows??emptyServicePrices,row=>String(row.revision));
  const [pricingId,setPricingId]=useState("");
  const pricingRow=confirmedPrices.rows.find(row=>row.id===pricingId);
  const confirmedPlans=useConfirmedSettingsRows(sourcePlans,row=>JSON.stringify(catalogSource?row:coursePlanSnapshot(row)));
  const [plans,applyStatus,busyIds,setStatusBusy]=useCourseStatusRows(confirmedPlans.rows);
  const [savedPlanId,setSavedPlanId]=useState<string|null>(null);
  const [formUncertain,setFormUncertain]=useState(false);
 const [hideTestData,setHideTestData]=useState(false);
 const [showInactive,setShowInactive]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [search, setSearch] = useRetainedState(`course-${view}:search`, "", retainedString);
  const [page, setPage] = useRetainedState(`course-${view}:page`, 0, retainedPage);
  const [status, setStatus] = useRetainedState(`course-${view}:status`, "all", retainedString);
  const [panel, setPanel] = useState<
    "person" | "plan" | "assign" | "card" | "coach" | "health" | "service-price" | null
  >(initialPerson ? initialAction==="assign"?"assign":"person" : canCreate&&view==="plans"&&params.get("action")==="create"?"plan":null);
  const [selectedPerson, setPerson] = useState<Person | null>(initialPerson);
  const person = people.find(p => p.id === selectedPerson?.id) ?? selectedPerson;
  const [personTab, setPersonTab] = useState<"info" | "plans" | "courses" | "records" | "payments" | "bookings" | "makeups">(() => music && ["courses", "plans", "payments", "bookings", "makeups"].includes(params.get("studentTab") ?? "") ? "courses" : params.get("studentTab")==="records" ? "records" : "info");
  const [editingPerson, setEditingPerson] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [cardBrowse,setCardBrowse]=useState<CardBrowseState>({search:"",history:false,page:0});
  const [customerCardBrowse,setCustomerCardBrowse]=useState<CardBrowseState>({search:"",history:false,page:0});
  const [cardRevision,setCardRevision]=useState(0);
  const [loadedCard,setLoadedCard]=useState<CourseCardView|null>(null);
  const [cardOpening,setCardOpening]=useState(0);
  const [recordTab,setRecordTab]=useState<"purchases"|"bookings">(params.get("studentRecords")==="bookings"&&canReadBookings?"bookings":canReadTransactions?"purchases":"bookings");
  const [retainedPlanUnit, setPlanUnit] = useRetainedState("course-plans:unit", "all", retainedString);
  const planUnit=compactCatalog?"all":retainedPlanUnit;
  const [planArea, setPlanArea] = useState<"catalog" | "cards">("catalog");
  function canLeave() { return !pending && !formPending && !formUncertain && !supportGuard.pending; }
  function changePurchaseSelection(action:()=>void){if(pending || formPending || formUncertain)return;if(music)setDirty(false);action();}
  function close() { if (canLeave()) { setPanel(null); setDirty(false); onPanelClose?.(); } }
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planReadOnly,setPlanReadOnly]=useState(false);
  const [cardId, setCardId] = useState("");
  const cardDetail = useCardDetail(panel === "card", cardId, cardOpening,source?.browseCards??dataScope);
  const cardLoading = cardDetail.loading;
  const cardError = cardDetail.error;
  const [revenueStaffId,setRevenueStaffId]=useState("");
  const [planId, setPlanId] = useState(music ? "" : plans.find((p) => p.isActive)?.id ?? "");
  const [purchaseSubjectId,setPurchaseSubjectId]=useState("");
  const [renewal,setRenewal]=useState(false);
  const [purchaseCustomerId,setPurchaseCustomerId]=useState("");
  const [assignmentSummary,setAssignmentSummary]=useState<AssignmentSummary>({paid:null,valid:false});
  const [requestKey, setRequestKey] = useState(()=>initialAction==="assign"?crypto.randomUUID():"");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [purchased,setPurchased]=useState<{customerId:string;templateId:string}|null>(null);
  const card = cardDetail.data ?? (loadedCard?.id===cardId ? loadedCard : cards.find((c) => c.id === cardId));
  function selectCard(value:CourseCardView) {
    if (!open("card")) return;
    setCardId(value.id);setLoadedCard(value);setCardOpening(n=>n+1);
  }
  function open(value: typeof panel) {
    if (!canLeave()) return false;
    setDirty(false);
    if(value === "assign" || value === "card")setPersonTab(music ? "courses" : "plans");
    if(value === "assign")setServicePurchase(false);
    if(value === "assign")setRevenueStaffId(customerRows.find(c=>c.id===person?.id)?.assignedStaff?.id??"");
    if (value === "person") { setPersonTab("info"); setEditingPerson(false); }
    if (value === "assign" && music) { setRenewal(false); setPurchaseCustomerId(""); setPurchaseSubjectId(""); setPlanId(""); setAssignmentSummary({paid:null,valid:false}); }
    if (value === "assign" && !music && !plans.some((p) => p.id === planId && p.isActive && (!music || p.unit === "SESSION")))
      setPlanId(plans.find((p) => p.isActive && (!music || p.unit === "SESSION"))?.id ?? "");
    setError("");
    setNotice("");
    setRequestKey(crypto.randomUUID());
    setPanel(value);
    return true;
  }

  function preparePlan(next: Plan | null,readOnly=false) { if(open("plan")){setPlan(next);setPlanReadOnly(readOnly);} }
  const [formPending,setFormPending]=useState(false);
  const [servicePurchase,setServicePurchase]=useState(false);
  const onServicePurchaseGuard=useCallback((dirty:boolean,busy:boolean)=>{setDirty(dirty);setFormPending(busy);},[]);
  useCourseDraftGuard(confirmDiscard&&(panel==="service-price"||!!source||!sportsNative&&!sportsData)&&!!panel&&(dirty || supportGuard.dirty),(panel==="service-price"||!!source||!sportsNative&&!sportsData)&&!!panel&&(pending||formPending||formUncertain||supportGuard.pending));
  function finishDraftForm(row?:Plan,syncWarning=false){publishMusicFinanceChange();if(row){confirmedPlans.confirm(row);setSavedPlanId(row.id);}if(syncWarning)return;setFormUncertain(false);if(panel==="plan"&&music)setNotice("收費方式已儲存");setDirty(false);if(panel === "person" && person){setEditingPerson(false);}else{setPanel(null);}}
  const customerPanel = !!person && view === "customers" && panel !== "plan";
  useCustomerPanelUrl(view === "customers", panel && customerPanel ? person.id : null, personTab);
  const [visitedTabs,setVisitedTabs]=useState<{id:string;tabs:string[]}>({id:"",tabs:[]});
  const hasVisitedTab=(tab:string)=>personTab===tab || (visitedTabs.id===person?.id && visitedTabs.tabs.includes(tab));
  const studentScroll=useRef<HTMLDivElement>(null);
  const studentScrollPositions=useRef<Record<string,number>>({});
  const scrollKey=`course-panel:${previewStoreId??"current"}:${person?.id}:${personTab}:${panel}`;
  useLayoutEffect(()=>{if(studentScroll.current){let saved=0;try{saved=Number(sessionStorage.getItem(scrollKey))||0;}catch{} studentScroll.current.scrollTop=studentScrollPositions.current[scrollKey]??saved;}},[scrollKey]);
  function switchPersonTab(value: typeof personTab) {
    if (pending || formPending) return;
    if (panel !== "person" && !open("person")) return;
    if(formUncertain||supportGuard.pending)return;
    setEditingAttribution(false);
    setVisitedTabs(previous=>({id:person?.id??"",tabs:[...new Set([...(previous.id===person?.id?previous.tabs:[]),personTab,value])]}));
    setPersonTab(music && value!=="info" ? "courses" : value);
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: (data: FormData) => Promise<{ success: boolean; error?: string;syncWarning?:boolean }>,
  ) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current=true;setPending(true);
    const data = new FormData(event.currentTarget);
    setError("");
      try {
        const result = await action(data);
        if (!result.success) {
          setError(result.error ?? "儲存失敗");
          return;
        }
        if(source&&!canCloseConfirmedSettingsSave(result,setError))return;
        publishMusicFinanceChange();setDirty(false);setCardRevision(n=>n+1);
        if(panel==="assign")setPurchased({customerId:String(data.get("customerId")??person?.id??""),templateId:music&&purchaseSubjectId?musicTeachingKey(purchaseSubjectId):sportsData?.subjects.find(s=>s.id===plans.find(p=>p.id===planId)?.sportsSubjectId)?.templateId??plans.find(p=>p.id===planId)?.templateIds[0]??""});
        if (person && (panel === "card" || panel === "assign")) { setPanel("person"); setPersonTab(music ? "courses" : "info"); setEditingPerson(false); }
        else setPanel(null);
        if (panel === "plan") toast.success("方案已儲存");
        else setNotice(panel === "assign" ? "結帳完成，方案已加入" : "已儲存");
        window.dispatchEvent(new Event("customer-search-invalidated"));
        if(!isMusicPreviewPage())setTimeout(() => router.refresh(), 0);
      } catch {
        setError("連線中斷，請重試");
      } finally {submitting.current=false;setPending(false);}
  }
  const order=useCourseDisplayOrder("plan",plans,displayOrder,(!catalogSource||!!catalogSource.order)&&canEdit&&!search&&status==="all"&&templateFilter==="all"&&purchaseFilter==="all"&&sharedFilter==="all"&&!hideTestData&&!busyIds.length,p=>p.isActive,catalogSource?.order);
  const filteredPlans = plans
    .filter(
      (p) =>
        p.id===savedPlanId || (!hideTestData||!isCourseTestData(p.name)) && (p.name + " " + (music?musicPlanItems(p.templateIds,templates,subjects).map(s=>s.name).join(" "):templates.filter(t=>p.templateIds.includes(t.id)).map(t=>`${t.category} ${t.name}`).join(" "))).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
        (templateFilter === "all" || p.sportsMode==="OPEN" || p.sportsSubjectId===templateFilter || p.templateIds.includes(templateFilter) || p.templateIds.some(id=>templates.find(t=>t.id===id)?.musicSubjectId===templateFilter)) &&
        (status === "all" || p.isActive === (status === "active")) &&
        (music || purchaseFilter === "all" || (p.customerPurchasable !== false) === (purchaseFilter === "customer")) &&
        (music || sharedFilter === "all" || !!p.allowShared === (sharedFilter === "allowed")) &&
        (music || planUnit === "all" || p.unit === planUnit) && (!music || p.unit === "SESSION"),
    )
    .sort((a, b) => Number(b.isActive) - Number(a.isActive)||order.compare(a,b));
  const activeFilteredPlans=filteredPlans.filter(p=>p.isActive),inactiveFilteredPlans=filteredPlans.filter(p=>!p.isActive);
  const inactiveForced=status==="inactive"||!!search||templateFilter!=="all"||planUnit!=="all"||purchaseFilter!=="all"||sharedFilter!=="all";
  const inactiveExpanded=inactiveForced||showInactive||inactiveFilteredPlans.some(p=>p.id===savedPlanId);
  const totalRows = activeFilteredPlans.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(totalRows / 20) - 1));
  const visiblePlans=[...activeFilteredPlans.slice(currentPage*20,(currentPage+1)*20),...(inactiveExpanded?inactiveFilteredPlans:[])];
  const activePlans = order.rows.filter((item) => item.isActive && (!music || item.unit === "SESSION"));
  const planItems=(p:Plan)=>musicPlanItems(p.templateIds,templates,subjects);
  const purchaseItems=[...new Map(activePlans.flatMap(p=>planItems(p)).map(s=>[s.id,s])).values()];
  const activeModes=schedulingModes??sportsData?.schedulingModes;
  const purchasablePlans=activePlans.filter(p=>!sportsNative||coursePlanModeAllowed(activeModes,p.sportsMode));
  const purchasePlans=music?activePlans.filter(p=>planItems(p).some(s=>s.id===purchaseSubjectId)):purchasablePlans;
  const pointPlans = activePlans.filter((item) => item.unit === "POINT").length;
  const sessionPlans = activePlans.filter((item) => item.unit === "SESSION").length;


  const attribution=person&&<CourseCustomerAttribution customerId={person.id} currentStaff={customerRows.find(row=>row.id===person.id)?.assignedStaff??null} currentSponsor={customerRows.find(row=>row.id===person.id)?.sponsor??null} staffOptions={assignmentStaff} canAssign={canAssignManager} music={music} compact={sportsNative} editing={editingAttribution} onToggle={()=>{if(supportGuard.allowLeave())setEditingAttribution(value=>!value);}} saveAction={source?.attribution??saveCourseCustomerAttribution} searchAction={source?.referrers??searchCourseReferrerCandidates} onSaved={()=>{setEditingAttribution(false);router.refresh();}}/>;
  const detailFields=person&&(<CustomerDetailFields items={[
                {label:"電子信箱",value:person.email},{label:"生日",value:person.birthday},
                {label:"性別",value:({male:"男",female:"女",other:"其他"} as Record<string,string>)[person.gender??""]},
                {label:"緊急聯絡人",value:person.emergencyContactName},
                {label:"緊急聯絡電話",value:person.emergencyContactPhone?<CustomerPhoneLink phone={person.emergencyContactPhone}/>:null},
                {label:"地址",value:person.address,full:true},
              ].filter(item => item.value != null && item.value !== "")}/>);
  const planFilters=view === "plans" && planArea === "catalog" && !music && (<>
          <select aria-label="購買方式篩選" className={`${field} ${sportsData?"!w-36":"max-w-44"}`} value={purchaseFilter} onChange={e=>{setSelected([]);setPurchaseFilter(e.target.value);setPage(0);}}><option value="all">全部購買方式</option><option value="customer">顧客可購買</option><option value="backend">僅後台指派</option></select>
          {sharingVisible && <select aria-label="共卡篩選" className={`${field} ${sportsData?"!w-32":"max-w-40"}`} value={sharedFilter} onChange={e=>{setSelected([]);setSharedFilter(e.target.value);setPage(0);}}><option value="all">全部共卡設定</option><option value="allowed">允許共卡</option><option value="disabled">不允許共卡</option></select>}
          {(search.trim() || status !== "all" || planUnit !== "all" || purchaseFilter !== "all" || sharedFilter !== "all") && <button type="button" className={button} onClick={()=>{setSelected([]);setSearch("");setStatus("all");setPlanUnit("all");setPurchaseFilter("all");setSharedFilter("all");setPage(0);}}>清除篩選</button>}
        </>);
  return (
    <>
      {!panel&&notice==="結帳完成，方案已加入"&&purchased&&<div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800"><span>{notice}</span>{canSchedule&&canReadBookings&&<DashboardLink className={button} href={studentScheduleHref(purchased.customerId,params.toString(),purchased.templateId)}>{music||sportsNative?"安排課程":"前往課表"}</DashboardLink>}</div>}
      {view === "plans" && !compactCatalog && <div className="flex flex-wrap items-center gap-3">
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
        {view === "customers" && !music && <h1 className="admin-page-title mr-auto">顧客管理</h1>}

        {view === "plans" && planArea === "catalog" && <input
          className={`${field} ${sportsData?"!w-44":"max-w-xs"}`}
          aria-label="搜尋"
          placeholder={sportsData?"搜尋收費方式":"搜尋方案"}
          value={search}
          onChange={(e) => { setSelected([]);setSearch(e.target.value); setPage(0); }}
        />}
        {view === "plans" && planArea === "catalog" && (
          <select
            className={`${field} ${sportsData?"!w-28":"max-w-36"}`}
            aria-label="狀態篩選"
            value={status}
            onChange={(e) => { setSelected([]);setStatus(e.target.value); setPage(0); }}
          >
            <option value="all">全部狀態</option>
            <option value="active">上架</option>
            <option value="inactive">下架</option>
          </select>
        )}
        {view === "plans" && planArea === "catalog" && !music && !compactCatalog && <select className={`${field} ${sportsData?"!w-32":"max-w-40"}`} aria-label="方案單位" value={planUnit} onChange={e=>{setSelected([]);setPlanUnit(e.target.value);setPage(0);}}><option value="all">點數與堂數</option><option value="POINT">點數方案</option><option value="SESSION">堂數方案</option></select>}
        {!compactCatalog&&planFilters}
        {view === "plans" && planArea === "catalog" && (music || sportsData) && <select aria-label={sportsData?`${subjectLabel}篩選`:"適用課程篩選"} className={`${field} ${sportsData?"!w-44":"max-w-72"}`} value={templateFilter} onChange={e=>{setSelected([]);setTemplateFilter(e.target.value);setPage(0);}}><option value="all">{sportsData?`全部${subjectLabel}`:"全部課程"}</option>{((music||sportsData)?subjects:templates).map(t=><option key={t.id} value={t.id}>{music?t.name:`${t.category || "未分類"} · ${t.name}`}</option>)}</select>}
        {view==="plans"&&planArea==="catalog"&&canEdit&&catalogSource?.form.servicePricing&&<button type="button" className={button} disabled={!confirmedPrices.rows.length} onClick={()=>{if(open('service-price'))setPricingId(confirmedPrices.rows.find(row=>row.id===templateFilter)?.id??confirmedPrices.rows[0]?.id??'');}}>一般／體驗設定</button>}
        {canCreate && (view!=="plans"||!sportsNative||activeModes?.selfBookingEnabled!==false||activeModes?.assignedSchedulingEnabled!==false) && (view === "customers" || planArea === "catalog") && (
          <button
            className={music || view === "customers" ? button : "min-h-11 whitespace-nowrap rounded-lg bg-primary-700 px-3 py-2 text-sm text-white hover:bg-primary-800"}
            onClick={() => {
              if (view === "customers") {
                setPerson(null);
                open("person");
              } else preparePlan(null);
            }}
          >
            ＋新增{view === "customers" ? music ? "學員" : "顧客" : music ? "收費方式" : "方案"}
          </button>
        )}
        {canAssign && ((view === "customers"&&!sportsNative) || (view === "plans"&&planArea === "cards")) && (
          <button
            className={button}
            disabled={(view === "customers" && !people.length) || !purchasablePlans.some((p) => !music || p.unit === "SESSION")}
            onClick={() => { setPerson(null); open("assign"); setRevenueStaffId(""); }}
          >
            {music ? "購課／續購" : "購買方案"}
          </button>
        )}
      </div>
      {error && !panel && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {notice && (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-primary-700">
          <span>{notice}</span>
          {music&&!params.get("setupStep")&&notice==="班型與學費已儲存"&&<DashboardLink href="/dashboard/teachers" className="inline-flex min-h-11 items-center px-3 font-medium">{personnelText("下一步：設定教師授課資格 →")}</DashboardLink>}
        </div>
      )}
<div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${!music && view === "plans" && planArea === "catalog" ? "min-h-11" : ""}`}>
      {compactCatalog&&planFilters}
      {music&&!dataScope&&view === "plans"&&planArea === "catalog"&&<CourseTestDataFilter names={plans.map(p=>p.name)} checked={hideTestData} onChange={v=>{setSelected([]);setPage(0);setHideTestData(v);}}/>}
      {view === "plans" && planArea === "catalog" && canEdit && <CourseBatchBar driver={catalogSource?.status} key={`${hideTestData}:${search}:${status}:${planUnit}:${templateFilter}:${purchaseFilter}:${sharedFilter}:${inactiveExpanded}`} canDelete={canDelete} names={Object.fromEntries(visiblePlans.map(p=>[p.id,p.name]))} kind="plan" blockedIds={busyIds} states={Object.fromEntries(visiblePlans.map(item=>[item.id,item.isActive]))} onApplied={applyStatus} onPendingChange={setStatusBusy} ids={visiblePlans.map(p=>p.id)} selected={selected} onChange={setSelected}/>}
      {!music && view === "plans" && planArea === "catalog" && <p className="ml-auto whitespace-nowrap text-sm text-earth-500">共 {filteredPlans.length} 筆／全部 {plans.length} 筆</p>}
</div>
      {view === "customers" ? panelOnly?null:<CourseCustomerList assignCustomers={source?.assignCustomers} basePath={source?.basePath} sessionUnitLabel={source?.sessionUnitLabel} sportsNative={sportsNative} music={music} customerPage={customerPage} rows={visibleCustomerRows} cards={cards} canReadCards={canReadCards}
        canAssignManager={canAssignManager} assignmentStaff={assignmentStaff}
        canMerge={canMerge} canExport={canExport}
        onView={id => { if (!open("person")) return; setPerson(people.find(p => p.id === id) ?? null); setCustomerCardBrowse({search:"",history:false,page:0}); }}
        onEdit={music && canEdit ? id => { if (!open("person")) return; setPerson(people.find(p => p.id === id) ?? null); setPersonTab("info"); setEditingPerson(true); } : undefined}
        onViewPlans={music && canReadCards ? id => { if (!open("person")) return; setPerson(people.find(p => p.id === id) ?? null); setPersonTab(music ? "courses" : "plans"); setCustomerCardBrowse({search:"",history:false,page:0}); } : undefined}
        onCreate={canCreate ? () => { setPerson(null); open("person"); } : undefined}
        onPurchase={canAssign&&people.length>0&&purchasablePlans.length>0 ? ()=>{setPerson(null);open("assign");setRevenueStaffId("");}:undefined}
        onAssign={canAssign&&purchasablePlans.length>0 ? id => { if (!open("assign")) return; setPerson(people.find(p => p.id === id) ?? null); setRevenueStaffId(customerRows.find(c=>c.id===id)?.assignedStaff?.id??""); } : undefined}
      /> : (
      planArea === "catalog" ? <div className="overflow-x-auto rounded-lg border border-earth-200 bg-white">
        <table className={`${music ? "min-w-[740px]" : "min-w-[1000px] table-fixed"} w-full text-left text-sm`}>
          <thead className={` bg-earth-50`}>
            <tr>
              {(music ? ["科目類別", "收費名稱", "課堂數", "收費金額", "狀態", "操作"] : ["方案／適用課程", "額度", "售價", "有效天數", "購買方式", "操作"]).map((h) => (
                <th key={h} className={`whitespace-nowrap px-3 py-2 font-medium ${!music ? ({"方案／適用課程":"w-[40%]","額度":"w-[10%]","售價":"w-[16%]","有效天數":"w-[12%]","購買方式":"w-[16%]"} as Record<string,string>)[h] ?? "" : ""} ${!music&&h==="操作"?"w-[72px] min-w-[72px] max-w-[72px] text-center":""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={` divide-y divide-earth-100`}>
            {!filteredPlans.length && <tr><td colSpan={6} className="p-6 text-center text-earth-500">沒有符合條件的方案，請調整搜尋或篩選。</td></tr>}
            {visiblePlans.map((p,index) => (
                  <Fragment key={p.id}>
                  {!p.isActive&&(index===0||visiblePlans[index-1]?.isActive)&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={6} className="px-3 py-2"><button type="button" disabled={inactiveForced} className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600 disabled:cursor-default" onClick={()=>{setSelected([]);setShowInactive(v=>!v);}}><span>下架方案（{inactiveFilteredPlans.length}）</span><span>{inactiveForced?"篩選結果":inactiveExpanded?"收合":"展開"}</span></button></td></tr>}
                  <tr
                    {...order.rowProps(p.id)}
                    className={` ${p.isActive ? "" : "bg-earth-50/80 text-earth-400"}`}
                  >
                    {music ? <><td className="px-3 py-2">{planItems(p).map(s=>s.name).join("、") || "待確認對應"}</td><td className="min-w-0 px-3 py-2"><div className="flex items-center gap-2">{canEdit&&order.handle(p.id,p.name)}{canEdit&&<input type="checkbox" aria-label={`選取 ${p.name}`} disabled={busyIds.includes(p.id)} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>}<button type="button" className="min-h-11 text-left font-medium text-primary-900 hover:underline" onClick={()=>preparePlan(p,!canEdit)}>{p.name}</button></div></td></> : <td className="px-3 py-2"><div className="flex min-h-11 items-center gap-2">{canEdit && order.handle(p.id,p.name)}{canEdit && <input type="checkbox" className="shrink-0" aria-label={`選取 ${p.name}`} disabled={busyIds.includes(p.id)} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>}<button type="button" aria-label={p.name} data-plan-name={p.name} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 text-left hover:underline" onClick={()=>preparePlan(p,!canEdit)}><span className="block w-full truncate font-medium text-primary-900" title={p.name}>{p.name}</span>{sportsNative&&!coursePlanModeAllowed(activeModes,p.sportsMode)&&<span className="text-sm text-earth-500">模式已關閉・保留紀錄</span>}<span className="block w-full max-w-96 truncate text-sm text-earth-700" title={p.sportsMode==="OPEN"?"開放選課通用卡":p.sportsMode==="ASSIGNED"?`指定項目方案 · ${subjects.find(s=>s.id===p.sportsSubjectId)?.name??"指定項目"}`:p.templateIds.length ? templates.filter(t=>p.templateIds.includes(t.id)).map(courseTemplateLabel).join("、") || "指定課程" : "全部課程"}>{p.sportsMode==="OPEN"?"開放選課通用卡":p.sportsMode==="ASSIGNED"?`指定項目方案 · ${subjects.find(s=>s.id===p.sportsSubjectId)?.name??"指定項目"}`:p.templateIds.length ? templates.filter(t=>p.templateIds.includes(t.id)).map(courseTemplateLabel).join("、") || "指定課程" : "全部課程"}</span></button>{sharingVisible && p.allowShared && <CourseSharedCardIndicator name={p.name} onOpen={()=>preparePlan(p,true)}/>}</div></td>}
                    <td className={` whitespace-nowrap px-3 py-2`}>{p.points} {p.unit === "SESSION" ? "堂" : "點"}</td>
                    <td className={` whitespace-nowrap px-3 py-2`}>NT$ {p.price.toLocaleString("zh-TW")}{!music && p.price > 0 && <p className="text-xs text-earth-500">NT$ {Math.round(p.price / Math.max(1, p.points)).toLocaleString("zh-TW")}／{p.unit === "SESSION" ? "堂" : "點"}</p>}</td>
                    {!music && <>
                    <td className="whitespace-nowrap px-3 py-2">{p.validDays > 0 ? `${p.validDays} 天` : "無期限"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{p.customerPurchasable !== false ? "顧客可購買" : "僅後台指派"}</td>
                    </>}
                    {music&&(<td className={` px-3 py-2`}><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${p.isActive ? "bg-emerald-50 text-emerald-700" : "bg-earth-100 text-earth-500"}`}>{p.isActive ? "上架" : "下架"}</span></td>)}
                    <td className={`whitespace-nowrap px-3 py-2 align-middle ${!music?"w-[72px] min-w-[72px] max-w-[72px] text-center":""}`}>
                      {canEdit && <div className="flex items-center justify-center"><ExclusiveMenu quiet triggerText="⋯" label={`${p.name}操作`}><button type="button" className="min-h-11 w-full px-3 text-left text-sm" disabled={busyIds.includes(p.id)} onClick={()=>preparePlan(p)}>編輯</button><CourseStatusButton driver={catalogSource?.status} quiet kind="plan" id={p.id} disabled={busyIds.includes(p.id)} active={p.isActive} onApplied={applyStatus} onPendingChange={setStatusBusy}/></ExclusiveMenu></div>}
                    </td>
                  </tr>
                  </Fragment>
                ))}
            {!inactiveExpanded&&inactiveFilteredPlans.length>0&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={6} className="px-3 py-2"><button type="button" className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600" onClick={()=>{setSelected([]);setShowInactive(true);}}><span>下架方案（{inactiveFilteredPlans.length}）</span><span>展開</span></button></td></tr>}
          </tbody>
        </table>
      </div> : canReadCards ? <CourseCardBrowser compact={music} dataScope={dataScope} load={source?.browseCards} reservations={source?.reservations} sessionUnitLabel={source?.sessionUnitLabel} sharedCardState={music ? "ENABLED" : sharedCardState} canReadBookings={canReadBookings} state={cardBrowse} onChange={setCardBrowse} onSelect={selectCard} revision={cardRevision}/> : null
      )}
      {view === "plans" && planArea === "catalog" && totalRows > 20 && <nav aria-label="清單分頁" className="mt-3 flex items-center justify-end gap-3"><span className="text-sm">共 {totalRows} 筆 · 第 {currentPage + 1}／{Math.ceil(totalRows / 20)} 頁</span><button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一頁</button><button className={button} disabled={(currentPage + 1) * 20 >= totalRows} onClick={() => setPage(currentPage + 1)}>下一頁</button></nav>}

      {panel && (
        <SettingsPanelContext.Provider value={supportGuard.context}><RightSheet className={music ? undefined : "fitness-management-editor"} presentation="centered"
          open
          onClose={close}
          width={customerPanel ? (source?880:1100) : panel === "plan"&&(sportsData||music) ? 1120 : panel === "assign" || panel === "plan" ? 920 : 640}
          fixedHeight={customerPanel || panel === "plan"}
          maxHeight={customerPanel ? 900 : panel === "plan"&&(sportsData||music) ? 760 : 680}
          fitContent={panel==="service-price"||(!customerPanel && (panel === "assign" || panel === "person" || panel === "health" || panel === "card"))}
          labelledById="course-member-sheet"
        >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-earth-100 bg-primary-50/60 px-4 py-2">
            <h2 id="course-member-sheet" className="min-w-0 break-words text-base font-semibold text-primary-900">
              {panel==="service-price"?"一般／體驗設定":customerPanel ? person.name : panel === "person"
                ? person ? person.name : music?"新增學員":"新增顧客"
                : panel === "health" ? `${person?.name ?? "顧客"} · 健康追蹤` : panel === "plan"
                  ? planReadOnly&&plan ? plan.name : plan ? sportsData ? "編輯收費方式" : music ? "編輯收費方式" : "編輯方案" : sportsData ? "新增收費方式" : music ? "新增收費方式" : "新增方案"
                  : panel === "assign"
                    ? music ? renewal?"續購方案":"購課方案" : "購買方案"
                    : panel === "coach"
                      ? personnelText(courseDisplayText("加入為教練", music))
                      : sharingVisible ? "方案與共卡" : "方案詳情"}
              {panel === "plan" && <CourseSetupStepBadge step="plan" />}
            </h2>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {customerPanel && params.get("returnCourseSession") && <DashboardLink className={button} href={`/dashboard/courses?${new URLSearchParams({date:params.get("returnCourseDate")??toLocalDateStr(),action:"booking",session:params.get("returnCourseSession")!})}`}>返回課表</DashboardLink>}
              {person && previewStoreId && (!source||source.previewEnabled) && <FrontendPreviewQuickLink storeId={previewStoreId} personId={person.id} />}
              {panel==="plan"&&planReadOnly&&canEdit&&<ExclusiveMenu quiet triggerText="⋯" label="方案操作"><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>setPlanReadOnly(false)}>編輯</button></ExclusiveMenu>}
              {panel === "person" && person && personTab === "info" && !editingPerson && canEdit && <button type="button" className="min-h-11 rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-100" onClick={()=>{if(!supportGuard.pending&&!formUncertain){setEditingAttribution(false);setEditingPerson(true);}}}>{music ? "編輯學員資料" : "編輯顧客資料"}</button>}
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
          {(customerPanel || panel === "person") && person && <nav aria-label={music ? "學員詳細資料分區" : "顧客詳細資料分區"} className="flex shrink-0 flex-wrap gap-1 border-b border-earth-200 bg-earth-50 px-4 py-2">
            {(music ? [["info","基本資料"], ...((canReadCards || canReadTransactions || canReadBookings) ? [["courses","課程與學費"]] : [])] : [ ["info","顧客概況"], ...((canReadTransactions || canReadBookings) ? [["records","紀錄"]] : []) ]).map(([value,label])=><button key={value} type="button" disabled={pending||formPending} aria-pressed={panel !== "health" && personTab===value} className={`min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary-600 ${panel !== "health" && personTab===value?"bg-primary-50 font-semibold text-primary-800":"text-earth-600 hover:bg-primary-50"}`} onClick={()=>switchPersonTab(value as typeof personTab)}>{label}</button>)}
            {healthEnabled && !music && <button type="button" disabled={pending||formPending} aria-pressed={panel === "health"} className={`min-h-11 rounded-lg px-3 text-sm ${panel === "health" ? "bg-primary-50 font-semibold text-primary-800" : "text-earth-600 hover:bg-primary-50"}`} onClick={()=>{if(panel !== "health")open("health");}}>健康追蹤</button>}
          </nav>}
          <div data-course-person-scroll={scrollKey} ref={studentScroll} onScroll={e=>{studentScrollPositions.current[scrollKey]=e.currentTarget.scrollTop;try{sessionStorage.setItem(scrollKey,String(e.currentTarget.scrollTop));}catch{}}} className={`@container/member min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain ${music ? "p-3" : "p-4"}`}>
            {music && panel === "person" && person && personTab === "info" && !editingPerson && <MusicStudentOverview legacy={dataScope === "legacy"} key={`overview-${person.id}`} customerId={person.id} tab={personTab} />}
            {notice && <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 text-primary-700"><span>{notice}</span>{notice==="結帳完成，方案已加入"&&purchased&&canSchedule&&canReadBookings&&<DashboardLink className={button} href={studentScheduleHref(purchased.customerId,params.toString(),purchased.templateId)}>{music||sportsNative?"安排課程":"前往課表"}</DashboardLink>}</div>}
            {error && (
              <p role="alert" className="mb-3 text-red-700">
                {error}
              </p>
            )}
            {panel==='service-price'&&canEdit&&pricingRow&&catalogSource?.form.servicePricing&&<CourseServicePriceDraftForm key={pricingRow.id} row={pricingRow} rows={confirmedPrices.rows} storeId={previewStoreId??''} transport={catalogSource.form.servicePricing.transport} onSelect={id=>{if(canLeave()){setDirty(false);setPricingId(id);}}} onPending={setFormPending} onUncertain={setFormUncertain} onDirtyChange={setDirty} onSaved={(row,warning)=>{if(row)confirmedPrices.confirm(row);if(warning)return;setFormUncertain(false);setDirty(false);setPanel(null);setNotice('服務收費已儲存');router.refresh();}}/>}
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
                {[["emergencyContactName","緊急聯絡姓名",person.emergencyContactName],["emergencyContactPhone","緊急聯絡電話",person.emergencyContactPhone],["emergencyContactRelation","緊急聯絡關係",""]].map(([name,label,value])=><label key={name} className="block">{label}（選填）<input className={field} name={name!} defaultValue={value ?? ""}/></label>)}
                <p className="text-sm">建立後請到人員管理一次設定授課資格，再新增排課。</p>
              </form>
            )}
            {music ? <>
            {panel === "health" && healthEnabled && person && <CourseCustomerHealth customerId={person.id} canEdit={canEdit} onDirtyChange={setDirty} onPending={setFormPending} />}
            {music && customerPanel && person && hasVisitedTab("courses") && <div hidden={panel!=="person"||personTab!=="courses"}><MusicStudentCourses canSchedule={canSchedule} key={person.id} customerId={person.id} revision={cardRevision} templates={templates} subjects={subjects} canReadBookings={canReadBookings} canReadTransactions={canReadTransactions} canReadCards={canReadCards} canAssign={canAssign} onPurchase={selection=>{if(open("assign")&&selection&&activePlans.some(p=>p.id===selection.planId)){setRenewal(true);setPurchaseSubjectId(selection.subjectId);setPlanId(selection.planId);}}} onManageCard={id=>{if(open("card")){setCardId(id);setLoadedCard(null);setCardOpening(n=>n+1);}}}/></div>}
            {!music && (panel === "person") && person && hasVisitedTab("plans") && <section hidden={panel!=="person"||personTab!=="plans"} className="mb-4 space-y-3">
              {personTab === "plans" && canAssign && <button className={button} onClick={() => open("assign")}>{music ? "購課／續購" : "購買方案"}</button>}
              {canReadCards && <section aria-label={sharingVisible ? "持有與共卡方案" : "持有方案"}>
                <CourseCardBrowser compact={music} dataScope={dataScope} sharedCardState={music ? "ENABLED" : sharedCardState} canReadBookings={canReadBookings} customerId={person.id} state={customerCardBrowse} onChange={setCustomerCardBrowse} onSelect={selectCard} revision={cardRevision}/>

              </section>}

            </section>}
            {panel !== "person" && panel !== "health" && view === "customers" && person && <button type="button" className="mb-3 min-h-11 text-sm text-primary-700" disabled={pending} onClick={()=>switchPersonTab(panel === "card" || panel === "assign" ? "plans" : "info")}>‹ 返回 {person.name} 詳情</button>}
            {panel === "person" && person && personTab === "info" && !editingPerson && <section className="space-y-3">
              {music && <StudentMakeupStatus onPendingChange={setFormPending} customerId={person.id} revision={person.updatedAt??""}/>}
              <CustomerDetailFields className={music ? "@min-[46rem]/member:grid-cols-3" : undefined} items={[
                {label:"電話",value:<CustomerPhoneLink phone={person.phone}/>},
                ...(!music?[{label:"所屬店長",value:customerRows.find(c=>c.id===person.id)?.assignedStaff?.displayName??null}]:[]),
                {label:"電子信箱",value:person.email},{label:"生日",value:person.birthday},
                {label:"性別",value:({male:"男",female:"女",other:"其他"} as Record<string,string>)[person.gender??""]},
                {label:"緊急聯絡人",value:person.emergencyContactName},
                {label:"緊急聯絡電話",value:person.emergencyContactPhone?<CustomerPhoneLink phone={person.emergencyContactPhone}/>:null},
                {label:"地址",value:person.address,full:true},
              ]}/>
              <CustomerLabels customerId={person.id} readOnly={!canEdit} maxVisible={5}/>

              <RetainedNoteEditor quiet optimistic key={person.id} stateKey={`customer-note:${person.id}`} title="店內備註" formatDisplay={music ? musicNoteDisplay : undefined} hint={music ? personnelText("店長與授課教師可見") : personnelText("店長與授課教練可見")}
                placeholder="輸入服務時需要留意的事項" maxLength={1000} value={person.serviceNote} canEdit={canEdit}
                save={(serviceNote, expectedServiceNote) => saveCourseCustomerNote({ customerId: person.id, serviceNote, expectedServiceNote })}
                onSaved={() => router.refresh()} />
              {personTab === "info" && <IdentitySection className="border-b border-earth-100 pb-2">{!music && <summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-700">身分與歸屬資訊</summary>}<dl className="space-y-2 text-sm">
                <div>LINE 綁定：{customerRows.find(c=>c.id===person.id)?.lineLinkStatus === "LINKED" ? "已綁定" : "尚未綁定"}</div>
              </dl>
                {canManageStaff && <button type="button" className="min-h-11 text-sm text-primary-700" onClick={() => open("coach")}>{music ? personnelText("加入為教師") : personnelText(courseDisplayText("加入為教練", music))}</button>}<CustomerAttributionForm staffLabel="所屬店長" hideStaff={music} key={`attribution-${person.id}-${customerRows.find(c=>c.id===person.id)?.assignedStaff?.id??""}-${customerRows.find(c=>c.id===person.id)?.sponsor?.id??""}`} customerId={person.id} currentStaffId={customerRows.find(c=>c.id===person.id)?.assignedStaff?.id??null} currentSponsor={customerRows.find(c=>c.id===person.id)?.sponsor??null} staffOptions={assignmentStaff} canAssign={canAssignManager} saveAction={saveCourseCustomerAttribution} searchAction={searchCourseReferrerCandidates} onSaved={()=>router.refresh()} />
              </IdentitySection>}
            </section>}
            {panel === "person" && (
              <CourseCustomerDraftForm compact={music} key={`draft-${person?.id??"new"}`} person={person} canEdit={canEdit} canCreate={canCreate} hidden={!!person && (!editingPerson || personTab!=="info")} onPending={setFormPending} onSaved={finishDraftForm} />
            )}
            {panel === "person" && personTab === "records" && canReadTransactions && canReadBookings && <nav aria-label="紀錄種類" className="flex gap-2">{([ ["purchases","交易紀錄"],["bookings","上課紀錄"] ] as const).map(([value,label])=><button type="button" key={value} aria-pressed={recordTab===value} className={`min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary-600 ${recordTab===value ? "bg-primary-50 font-semibold text-primary-800":"text-earth-600 hover:bg-primary-50"}`} onClick={()=>{setRecordTab(value);const url=new URL(window.location.href);url.searchParams.set("studentRecords",value);window.history.replaceState(null,"",url.pathname+url.search);}}>{label}</button>)}</nav>}
            {!music && panel === "person" && (personTab === "records" && recordTab === "purchases") && person && canReadTransactions && <div ><CourseCustomerPurchases music={music} key={`purchases-${person.id}`} customerId={person.id} /></div>}
            {!music && panel === "person" && (personTab === "records" && recordTab === "bookings") && person && canReadBookings && <div ><CourseCustomerBookings key={`bookings-${person.id}`} customerId={person.id} music={music} /></div>}
            {panel==="plan"&&planReadOnly&&plan&&<dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{[["方案",plan.termSessionIds?.length?"期課":plan.unit==="POINT"?"點數":"堂數"],["額度",`${plan.points} ${plan.unit==="POINT"?"點":"堂"}`],["售價",`NT$ ${plan.price.toLocaleString("zh-TW")}`],["效期",`${plan.validDays} 天`],["狀態",plan.isActive?"上架":"下架"],[music?"所屬教學項目":"適用課程",music?planItems(plan).map(s=>s.name).join("、")||"待確認對應":plan.templateIds.length?templates.filter(t=>plan.templateIds.includes(t.id)).map(t=>t.name).join("、")||"指定課程":"全部課程"],["購買方式",plan.customerPurchasable===false?"僅後台指派":"顧客可購買"],...(sharingVisible?[["共卡",plan.allowShared?"允許":"不允許"]]:[])].map(([label,value])=><div key={label} className="border-b border-earth-100 py-2 text-sm"><dt className="text-earth-500">{label}</dt><dd className="mt-1 break-words text-primary-900">{value}</dd></div>)}{plan.termSessionIds?.length?<div className="sm:col-span-2 text-sm"><dt className="text-earth-500">上課日期 · {plan.termSessionIds.length} 堂</dt><dd>{termSessions.filter(s=>plan.termSessionIds?.includes(s.id)).map(s=><p key={s.id} className="py-1">{formatTWDateTime(new Date(s.startsAt))} · {s.name}</p>)}</dd></div>:null}</dl>}

</> : <>
            {panel === "health" && healthEnabled && person && <CourseCustomerHealth scope={source?.healthScope} compact={sportsNative} customerId={person.id} canEdit={canEdit} onDirtyChange={setDirty} onPending={setFormPending} />}
            {panel !== "person" && panel !== "health" && view === "customers" && person && <button type="button" className="mb-3 min-h-11 text-sm text-primary-700" disabled={pending} onClick={()=>switchPersonTab("info")}>‹ 返回 {person.name} 詳情</button>}
            {panel === "person" && person && personTab === "info" && !editingPerson && <section className="space-y-3">
              <div aria-label="顧客基本資料" className={sportsNative?"grid grid-cols-1 items-start gap-x-5 sm:grid-cols-2":"contents"}>
              <CustomerPhoneLink phone={person.phone}/>
              <CustomerLabels customerId={person.id} readOnly={!canEdit} maxVisible={5}/>
              {sportsNative&&<div className="sm:col-span-2">{attribution}{detailFields}</div>}
              </div>
              <RetainedNoteEditor confirmDiscard={confirmDiscard} quiet optimistic key={`note-${person.id}`} stateKey={`customer-note:${person.id}`} title="店內備註" hint=""
                placeholder="輸入服務時需要留意的事項" maxLength={1000} value={person.serviceNote} canEdit={canEdit}
                save={async(serviceNote, expectedServiceNote) => {
                  const input={customerId:person.id,serviceNote,expectedServiceNote};
                  if(source)return source.saveNote(input);
                  if(!sportsNative)return saveCourseCustomerNote(input);
                  const response=await fetch(`${window.location.pathname.replace(/\/$/,"")}/notes`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
                  const result=await response.json();if(!result||typeof result.success!=="boolean")throw new Error("儲存回應格式不正確");return result as Awaited<ReturnType<typeof saveCourseCustomerNote>>;
                }}
                onSaved={value=>{if(sportsNative)setNoteReceipts(rows=>({...rows,[person.id]:{source:sourcePeople.find(p=>p.id===person.id)?.serviceNote??null,value}}));else router.refresh();if(source)router.refresh();}} />
              {!sportsNative&&attribution}
              {canReadCards && <section aria-label="持有方案" className="border-t border-earth-100 pt-2">
                <div className="flex min-h-11 items-center justify-between gap-3"><h3 className="text-sm font-semibold">持有方案</h3>{canAssign && <button type="button" className={button} onClick={() => open("assign")}>購買方案</button>}</div>
                <CourseCardBrowser load={source?.browseCards} reservations={source?.reservations} sessionUnitLabel={source?.sessionUnitLabel} native={sportsNative} compact sharedCardState={music ? "ENABLED" : sharedCardState} canReadBookings={canReadBookings} customerId={person.id} state={customerCardBrowse} onChange={setCustomerCardBrowse} onSelect={selectCard} revision={cardRevision}/>
              </section>}
              {source?.support?<DeferredCustomerSupport key={person.id} customerId={person.id} load={source.support}/>:<>
              <StoreMemberConnectionPanel compact={sportsNative} key={`membership-${person.id}`} customerId={person.id} />
              <CustomerPanelAdvanced key={`line-${person.id}`} managerSimple active customerId={person.id} readOnly={!!source||!canEdit} canEdit={!source&&canEdit} onMutated={() => router.refresh()}/></>}
              {!sportsNative&&detailFields}
              {canManageStaff && <ExclusiveMenu quiet triggerText="更多" label="顧客其他操作"><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={() => open("coach")}>{personnelText("加入為教練")}</button></ExclusiveMenu>}
            </section>}
            {panel === "person" && (
              <CourseCustomerDraftForm save={source?.saveProfile} draftScope={source?"module-customer":"course-customer"} key={person?.id??"new"} person={person} canEdit={canEdit} canCreate={canCreate} hidden={!!person && (!editingPerson || personTab!=="info")} onPending={setFormPending} onDirtyChange={setDirty} onSaved={finishDraftForm} />
            )}
            {panel === "person" && personTab === "records" && canReadTransactions && canReadBookings && <nav aria-label="紀錄種類" className="flex gap-2">{([ ["purchases","交易紀錄"],["bookings",source?"服務紀錄":"上課紀錄"] ] as const).map(([value,label])=><button type="button" key={value} aria-pressed={recordTab===value} className={`min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary-600 ${recordTab===value ? "bg-primary-50 font-semibold text-primary-800":"text-earth-600 hover:bg-primary-50"}`} onClick={()=>{setRecordTab(value);const url=new URL(window.location.href);url.searchParams.set("studentRecords",value);window.history.replaceState(null,"",url.pathname+url.search);}}>{label}</button>)}</nav>}
            {panel === "person" && personTab === "records" && person && canReadTransactions && recordTab === "purchases" && <CourseCustomerPurchases serviceMode={!!source} load={source?.purchases} sessionUnitLabel={source?.sessionUnitLabel} compact={sportsNative} key={`purchases-${person.id}`} customerId={person.id} />}
            {panel === "person" && personTab === "records" && person && canReadBookings && recordTab === "bookings" && <CourseCustomerBookings load={source?.bookings} serviceMode={!!source} sessionUnitLabel={source?.sessionUnitLabel} compact={sportsNative} key={`bookings-${person.id}`} customerId={person.id} />}
            {panel==="plan"&&planReadOnly&&plan&&<dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{[["方案",plan.termSessionIds?.length?"期課":plan.unit==="POINT"?"點數":"堂數"],["額度",`${plan.points} ${plan.unit==="POINT"?"點":"堂"}`],["售價",`NT$ ${plan.price.toLocaleString("zh-TW")}`],["效期",`${plan.validDays} 天`],["狀態",plan.isActive?"上架":"下架"],["適用課程",plan.sportsMode==="OPEN"?"開放選課通用卡":plan.templateIds.length?templates.filter(t=>plan.templateIds.includes(t.id)).map(courseTemplateLabel).join("、")||"指定課程":"全部課程"],["購買方式",plan.customerPurchasable===false?"僅後台指派":"顧客可購買"],...(sharingVisible?[["共卡",plan.allowShared?"允許":"不允許"]]:[])].map(([label,value])=><div key={label} className="border-b border-earth-100 py-2 text-sm"><dt className="text-earth-500">{label}</dt><dd className="mt-1 break-words text-primary-900">{value}</dd></div>)}{plan.termSessionIds?.length?<div className="sm:col-span-2 text-sm"><dt className="text-earth-500">上課日期 · {plan.termSessionIds.length} 堂</dt><dd>{termSessions.filter(s=>plan.termSessionIds?.includes(s.id)).map(s=><p key={s.id} className="py-1">{formatTWDateTime(new Date(s.startsAt))} · {s.name}</p>)}</dd></div>:null}</dl>}

</>}
            {panel === "plan" && !planReadOnly && (

              <CoursePlanDraftForm catalog={catalogSource?.form} subjectLabel={subjectLabel} sportsData={sportsData} storeId={previewStoreId??""} onUncertain={setFormUncertain} key={plan?.id??"new"} plan={plans.find(p=>p.id===plan?.id)??plan} templates={templates} subjects={subjects} musicTeachers={musicTeachers} canEditMusicTeachers={canEditMusicTeachers} termSessions={termSessions} profitEnabled={profitEnabled} music={music} sharedCardState={sharedCardState} initialTemplateId={templateFilter === "all" ? undefined : templateFilter} onPending={setFormPending} onSaved={finishDraftForm} onDirtyChange={setDirty} />

            )}
            {panel === "assign" && source?.purchaseService && <label className="mb-3 block">消費類型<select aria-label="消費類型" className={field} value={servicePurchase?"service":"plan"} disabled={pending||formPending||formUncertain} onChange={e=>{setServicePurchase(e.target.value==="service");setDirty(false);setError("");}}><option value="plan">多次方案</option><option value="service">單次／體驗</option></select></label>}
            {panel === "assign" && servicePurchase && source?.purchaseService?.({customerId:person?.id,onGuard:onServicePurchaseGuard,onSaved:()=>{publishMusicFinanceChange();setDirty(false);setFormPending(false);setCardRevision(n=>n+1);setNotice("服務收款完成");if(person){setPanel("person");setPersonTab("info");}else setPanel(null);router.refresh();},onClose:()=>{if(canLeave()){setDirty(false);setServicePurchase(false);}}})}
            {panel === "assign" && !servicePurchase && (
              <form
                id="course-member-form"
                onChange={e=>{if(!music||(e.target as HTMLElement).closest("[data-purchase-details]"))setDirty(true);}}
                className={music ? "grid min-w-0 grid-cols-1 items-start gap-3 @min-[40rem]/member:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]" : "grid grid-cols-1 gap-5 min-[1024px]:grid-cols-2"}
                onSubmit={(e) =>
                  submit(e, (d) =>
                    musicCheckoutTransport("purchase", {
                      planId,
                      customerId: d.get("customerId"),
                      expiresDate: d.get("expires"),
                      ...(source?.automaticAllocation?{beautyExpectedStoreCost:(plans.find(p=>p.id===planId)?.catalogSnapshot?.storeCost??null)}:{}),
                      musicPurchaseTerms:music?Number(d.get("musicPurchaseTerms")??1):undefined,
                      musicReceived:d.get("musicReceivedResolved")!==null?Number(d.get("musicReceivedResolved")):undefined,
                      musicPaymentDate:d.get("musicPaymentDate")?String(d.get("musicPaymentDate")):undefined,
                      musicDiscountTeacherFee:d.get("musicDiscountTeacherFee")!==null?d.get("musicDiscountTeacherFee")==="true":undefined,
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
                    }, input=>source?source.assign(input as Record<string,unknown>):assignCoursePointCard(input)),
                  )
                }
              >
                <fieldset disabled={pending} className={music ? "min-w-0 space-y-2 [&>label]:grid [&>label]:grid-cols-[5rem_minmax(0,1fr)] [&>label]:items-center [&>label]:gap-2" : "min-w-0 space-y-3"}>
                <h3 className="font-semibold">{music?(renewal?"續購方案":"購課方案"):"方案資料"}</h3>
                {person ? <div><span className="text-sm text-earth-500">{music ? "學員" : "顧客"}</span><p className="font-medium">{person.name} · {person.phone}</p><input type="hidden" name="customerId" value={person.id}/></div> : <label className="block">
                  {music ? "學員" : "顧客"}
                  <CourseCustomerPicker choices={source?.choices} name="customerId" required onChange={customers=>{if(!music)setDirty(true);setPurchaseCustomerId(customers[0]?.id??"");setRevenueStaffId(customers[0] ? customerRows.find(row=>row.id===customers[0].id)?.assignedStaff?.id ?? "" : "");}}/>

                </label>}
                {music&&<label className="block">教學項目<CourseOptionSelect label="教學項目" required value={purchaseSubjectId} options={purchaseItems.map(s=>({id:s.id,label:s.name}))} onChange={id=>changePurchaseSelection(()=>{setPurchaseSubjectId(id);setPlanId("");setAssignmentSummary({paid:null,valid:false});})}/></label>}
                <label className="block">
                  {music?"收費方式":"方案"}
                  <CourseOptionSelect label={music?"收費方式":"方案"} required value={planId} options={purchasePlans.map(p=>({id:p.id,label:`${p.name} · ${p.points} ${p.unit==="SESSION" ? source?.sessionUnitLabel??"堂":"點"}`}))} onChange={id=>changePurchaseSelection(()=>{setAssignmentSummary({paid:null,valid:false});setPlanId(id);if(!music)setDirty(true);})}/>

                </label>
                {music ? <input type="hidden" name="expires" value="2099-12-31"/> : <label className="block" key={planId}>
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
                <fieldset data-purchase-details disabled={pending} className={music ? "contents" : "min-w-0 min-[1024px]:border-l min-[1024px]:border-earth-200 min-[1024px]:pl-5"}>
                  {music ? plans.filter(p=>p.id===planId).map(p=><MusicAssignmentPayment split customerId={person?.id??purchaseCustomerId} key={p.id} plan={p} canDiscount={canDiscount} onSummary={setAssignmentSummary}/>) : <CourseAssignmentPayment cashReader={source?.cashStatus} profitEnabled={profitEnabled&&!music} key={planId} storeCost={plans.find(p=>p.id===planId)?.storeCost??0} price={plans.find(p=>p.id===planId)?.price ?? 0} canDiscount={canDiscount} showAllocation={canReadTransactions&&profitEnabled&&!music} onSummary={setAssignmentSummary}/>}
                {source?.automaticAllocation&&<div className="mt-2 text-sm" role="status">{(()=>{const cost=plans.find(p=>p.id===planId)?.storeCost;if(cost==null)return '尚未設定店家固定費用，本次不計算分潤。';if(assignmentSummary.paid==null)return '確認實收後顯示分配。';const allocation=calculateCourseSaleAllocation(assignmentSummary.paid,cost);return `店家 ${allocation.storeAmount.toLocaleString()}／所屬店長 ${allocation.developerAmount.toLocaleString()}（${customerRows.find(c=>c.id===(person?.id??purchaseCustomerId))?.assignedStaff?.displayName??'未歸屬'}）${allocation.shortfall?'；實收低於固定費用':''}`;})()}</div>}
                </fieldset>
              </form>
            )}
            {panel === "card" && card && (
              <>
                {cardLoading && <p role="status">讀取方案詳細資料中…</p>}
                {cardError && <div role="alert" className="mb-3 text-red-700"><p>{cardError}</p><button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm text-primary-700" onClick={cardDetail.retry}>重新載入</button></div>}
                <CourseCardSummary card={card} sessionUnitLabel={source?.sessionUnitLabel}/>
                {!cardLoading&&!cardError&&!error&&source?.cardManagement?.(card,{onPending:setFormPending,onSaved:()=>{setCardRevision(n=>n+1);cardDetail.retry();publishMusicFinanceChange();router.refresh();}})}
                {canReadBookings && !cardLoading && !cardError && !error && card.held > 0 && <CourseCardReservations load={source?.reservations} sessionUnitLabel={source?.sessionUnitLabel} cardId={card.id} held={card.held} unit={card.unit} revision={cardRevision}/>}
                {(source?.canManageMembers??canAssign) && sharingVisible && card.allowShared && !cardLoading && !cardError && !error && (
                  <form
                    id="course-member-form"
                onChange={()=>setDirty(true)}
                    className="mt-4 space-y-2"
                    onSubmit={(e) => {
                      if (!sharingEnabled) { e.preventDefault(); return; }
                      submit(e, (d) =>
                        (source?.members??setCourseCardMembers)({
                          cardId: card.id,
                          customerIds: d.getAll("members"),
                          ...(source?{expected:card.members.map(m=>m.id),requestKey}:{}),
                        }),
                      );
                    }}
                  >
                    <h3 className="font-medium">共卡授權成員{!sharingEnabled && <span className="ml-2 text-sm font-normal text-earth-500">功能未開通</span>}</h3>
                    <p className="text-sm text-earth-500">
                      每位成員均可只替另一位成員預約。
                    </p>
                    <fieldset disabled={pending || !sharingEnabled}><CourseCustomerPicker choices={source?.choices} enabled={sharingEnabled} onChange={()=>setDirty(true)} key={`${card.id}:${cardOpening}`} name="members" initial={card.members} multiple/></fieldset>

                  </form>
                )}
                {(source?.canManageMembers??canAssign) && sharingVisible && !card.allowShared && !cardLoading && !cardError && !error && <p className="mt-4 rounded-lg bg-earth-50 p-3 text-sm text-earth-600">此方案設定為不允許共卡，既有持有人資料仍會保留。</p>}
                <CourseCardEntries card={card} sessionUnitLabel={source?.sessionUnitLabel} entryLabels={source?.entryLabels}/>
              </>
            )}
          </div>
          {panel !== "health" && !(panel === "assign" && servicePurchase) && (panel!=="plan"||!planReadOnly) && (panel !== "person" || (person ? canEdit && editingPerson && personTab === "info" : canCreate)) && (panel !== "card" || ((source?.canManageMembers??canAssign) && sharingVisible && card?.allowShared)) && (
            <footer className={panel === "plan" && !music ? fitnessEditorFooter : `shrink-0 border-t border-earth-100 bg-white px-4 py-3 ${music && panel === "assign" ? "flex flex-wrap items-center gap-3" : ""}`}>
              {panel === "assign" && <p className={`${music ? "min-w-0 flex-1" : "mb-2"} flex flex-wrap justify-between gap-2 text-sm`}><span>{person?.name} · {plans.find(p=>p.id===planId)?.name}</span><strong>實收 {assignmentSummary.paid === null ? "—" : `NT$ ${assignmentSummary.paid.toLocaleString()}`}</strong></p>}
              <div className={`flex gap-2 ${music || (panel === "plan" && !music) ? "justify-end" : ""}`}>{panel === "plan" && !music && <button type="button" className={button} disabled={pending || formPending || formUncertain} onClick={close}>取消</button>}<button
                form="course-member-form"
                type="submit"
                className={`${button} ${panel === "plan" && !music ? fitnessEditorSave : music ? "min-w-28" : "w-full"} !bg-primary-700 !text-white`}
                disabled={pending || formPending || (panel === "card" && (!sharingEnabled || cardLoading || !!cardError || !!error)) || (panel === "assign" && (!planId || !assignmentSummary.valid))}
              >
                {pending || formPending ? "儲存中…" : panel === "assign" ? music ? "儲存學費" : "確認結帳" : panel === "card" ? "儲存共卡成員" : formUncertain ? "重試確認儲存結果" : "儲存"}
              </button></div>
            </footer>
          )}
        </RightSheet></SettingsPanelContext.Provider>
      )}
    </>
  );
}
export function CourseCardSummary({ card,sessionUnitLabel="堂" }: {sessionUnitLabel?:string; card: CourseCardView }) {
  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-semibold">{card.name}</h3>
      <p>
        剩餘 {card.remaining} {card.unit === "SESSION" ? sessionUnitLabel : "點"} · 已預約 {card.held} {card.unit === "SESSION" ? sessionUnitLabel : "點額度"}
        {!card.closed && !card.expired && <> · {card.unit === "SESSION" ? `還可預約 ${card.available} ${sessionUnitLabel}` : `可用 ${card.available} 點`}</>}
      </p>
      <p>
        期限：{card.expiryKind === "NO_EXPIRY" ? "無期限" : !card.expiresAt || (card.openingImported && !card.musicActivatedAt) ? "期初效期待核對" : card.musicValidityDays && !card.musicActivatedAt ? `首次上課起 ${card.musicValidityDays} 天` : toLocalDateStr(new Date(card.expiresAt))}
        {card.expiresAt && new Date(card.expiresAt) < new Date() ? "（已到期）" : ""}
      </p>
      {card.openingIssue && <p className="text-amber-800">{card.openingIssue}</p>}
      <p>{card.members.length>1?"共同餘額 · 共卡人":"持有人"}：{card.members.map((m) => m.name).join("、")}</p>
      {(card.closed || card.expired) ? <p>{card.closed ? "已停用" : "已到期"} · 剩餘額度僅供查詢</p> : card.remaining>0 && card.available===0 && card.held>=card.remaining ? <p>額度已全數預約</p> : card.remaining===0 ? <p>額度已用完</p> : null}
    </div>
  );
}
export function CourseCardEntries({ card,sessionUnitLabel="堂",entryLabels={} }: {entryLabels?:Record<string,string>;sessionUnitLabel?:string; card: CourseCardView }) {
  const labels: Record<string, string> = {
    ...entryLabels,
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
            {e.kind.startsWith("CORRECT:") ? "點名更正" : labels[e.kind.split(":")[0]] ?? "額度異動"} {e.points} {card.unit === "SESSION" ? sessionUnitLabel : "點"}
          </li>
        ))}
      </ul>
    </details>
  );
}
