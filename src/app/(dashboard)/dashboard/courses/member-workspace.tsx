"use client";
import {CourseOptionSelect} from "@/components/admin/course-option-select";
import {CourseCustomerPicker} from "@/components/admin/course-customer-picker";
import {CourseCardBrowser, type CardBrowseState} from "./card-browser";
import {browseCourseCards} from "@/server/actions/course-browse";
import {CourseAssignmentPayment, type AssignmentSummary} from "@/components/admin/course-assignment-payment";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import { toLocalDateStr, dayRange, formatTWDateTime } from "@/lib/date-utils";
import {
  saveCourseCustomer,
  saveCoursePointPlan,
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
import { BirthdayFields } from "@/components/birthday-fields";
import { CourseCustomerHealth } from "./customer-health";
type Person = { id: string; name: string; phone: string; email: string | null; gender: string | null; birthday: string; serviceNote: string | null; address: string | null; notes: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null };
type Plan = {
  id: string;
  name: string;
  points: number;
  price: number;
  storeCost?: number;
  termSessionIds?:string[];
  validDays: number;
  isActive: boolean;
  customerPurchasable?: boolean;
  allowShared?: boolean;
  unit: string;
  templateIds: string[];
};
export type CourseCardView = Awaited<ReturnType<typeof getCourseCards>>[number];
const field =
  "min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function CourseMemberWorkspace({
  profitEnabled=true,
  canDelete=false,
  termSessions=[],
  view,
  templates,
  people,
  plans,
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
  canDiscount = false,
}: {
  profitEnabled?:boolean;
  termSessions?:{id:string;name:string;startsAt:string}[];
  view: "customers" | "plans";
  templates: {id:string;name:string;category:string;isActive:boolean}[];
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
  canDiscount?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname=usePathname();
  function keepCustomerInUrl(id?:string){const next=new URLSearchParams(params.toString());if(id)next.set("customerId",id);else next.delete("customerId");router.replace(`${pathname}?${next}`,{scroll:false});}
  const initialPerson = view === "customers" ? people.find(p => p.id === params.get("customerId")) ?? null : null;
  const [templateSearch,setTemplateSearch]=useState("");
  const [selectedTemplateIds,setSelectedTemplateIds]=useState<string[]>([]);
  const [planAmounts,setPlanAmounts]=useState({points:10,price:0,storeCost:0});
  const [selected,setSelected]=useState<string[]>([]);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");
  const [panel, setPanel] = useState<
    "person" | "plan" | "assign" | "card" | "coach" | "health" | null
  >(initialPerson ? "person" : null);
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
  const [planUnit, setPlanUnit] = useState("all");
  const [planArea, setPlanArea] = useState<"catalog" | "cards">("catalog");
  function canLeave() { return !pending && (!dirty || window.confirm("尚有未儲存的變更，確定離開？")); }
  function close() { if (canLeave()) { setPanel(null); setDirty(false); if(view==="customers")keepCustomerInUrl(); } }
  const [plan, setPlan] = useState<Plan | null>(null);
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
    if(value === "assign")setRevenueStaffId(customerRows.find(c=>c.id===person?.id)?.assignedStaff?.id??"");
    if (value === "person") { setPersonTab("info"); setEditingPerson(false); }
    if (value === "assign" && !plans.some((p) => p.id === planId && p.isActive))
      setPlanId(plans.find((p) => p.isActive)?.id ?? "");
    setError("");
    setNotice("");
    setRequestKey(crypto.randomUUID());
    setPanel(value);
    return true;
  }
  function preparePlan(next: Plan | null) {
    setPlan(next);
    setTemplateSearch("");
    setSelectedTemplateIds(next?.templateIds ?? []);
    setPlanAmounts({
      points: next?.points ?? 10,
      price: next?.price ?? 0,
      storeCost: next?.storeCost ?? 0,
    });
    open("plan");
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
        else setNotice("已儲存");
        router.refresh();
      } catch {
        setError("連線中斷，請重試");
      }
    });
  }
  const filteredPlans = plans
    .filter(
      (p) =>
        p.name.includes(search.trim()) &&
        (status === "all" || p.isActive === (status === "active")) &&
        (planUnit === "all" || p.unit === planUnit),
    )
    .sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const totalRows = filteredPlans.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(totalRows / 20) - 1));
  const activePlans = plans.filter((item) => item.isActive);
  const pointPlans = activePlans.filter((item) => item.unit === "POINT").length;
  const sessionPlans = activePlans.filter((item) => item.unit === "SESSION").length;
  const normalizedTemplateSearch = templateSearch.trim().toLocaleLowerCase();
  const visibleTemplates = templates.filter((item) =>
    item.name.toLocaleLowerCase().includes(normalizedTemplateSearch),
  );
  const templateGroups = [...new Set(visibleTemplates.map((item) => item.category || "未分類"))];
  const unitPrice = Math.round(planAmounts.price / Math.max(1, planAmounts.points));
  const estimatedProfit = planAmounts.price - planAmounts.storeCost;
  return (
    <>
      {view === "plans" && (
        <nav aria-label="方案管理分區" className="mb-4 flex w-fit rounded-lg border border-earth-200 bg-earth-50 p-1">
          <button type="button" aria-pressed={planArea === "catalog"} className={`min-h-9 rounded-md px-4 text-sm font-medium ${planArea === "catalog" ? "bg-white text-primary-800 shadow-sm" : "text-earth-600"}`} onClick={() => setPlanArea("catalog")}>方案商品</button>
          {canReadCards && <button type="button" aria-pressed={planArea === "cards"} className={`min-h-9 rounded-md px-4 text-sm font-medium ${planArea === "cards" ? "bg-white text-primary-800 shadow-sm" : "text-earth-600"}`} onClick={() => setPlanArea("cards")}>顧客持有方案</button>}
        </nav>
      )}
      {view === "plans" && planArea === "catalog" && (
        <section aria-label="方案摘要" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["全部方案", plans.length],
            ["上架中", activePlans.length],
            ["點數方案", pointPlans],
            ["堂數方案", sessionPlans],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-earth-200 bg-white px-3 py-2"><strong className="block text-lg tabular-nums text-primary-800">{value}</strong><span className="text-xs text-earth-500">{label}</span></div>)}
        </section>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === "plans" && planArea === "catalog" && <input
          className={`${field} max-w-xs`}
          aria-label="搜尋"
          placeholder="搜尋方案"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />}
        {view === "plans" && planArea === "catalog" && (
          <select
            className={`${field} max-w-36`}
            aria-label="狀態篩選"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          >
            <option value="all">全部狀態</option>
            <option value="active">上架</option>
            <option value="inactive">下架</option>
          </select>
        )}
        {view === "plans" && planArea === "catalog" && <select className={`${field} max-w-40`} aria-label="方案單位" value={planUnit} onChange={e=>{setPlanUnit(e.target.value);setPage(0);}}><option value="all">點數與堂數</option><option value="POINT">點數方案</option><option value="SESSION">堂數方案</option></select>}
        {canCreate && (view === "customers" || planArea === "catalog") && (
          <button
            className={button}
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
            disabled={!people.length || !plans.some((p) => p.isActive)}
            onClick={() => { setPerson(null); open("assign"); setRevenueStaffId(""); }}
          >
            指派方案
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="mb-3 text-primary-700">
          {notice}
        </p>
      )}
      {view === "plans" && planArea === "catalog" && canEdit && <CourseBatchBar canDelete={canDelete} names={Object.fromEntries(filteredPlans.map(p=>[p.id,p.name]))} kind="plan" ids={filteredPlans.map(p=>p.id)} selected={selected} onChange={setSelected}/>}
      {view === "customers" ? <CourseCustomerList customerPage={customerPage} rows={customerRows} cards={cards} canReadCards={canReadCards}
        canAssignManager={canAssignManager} assignmentStaff={assignmentStaff}
        canMerge={canMerge}
        onView={id => { keepCustomerInUrl(id); setPerson(people.find(p => p.id === id) ?? null); setCustomerCardBrowse({search:"",history:false,page:0}); open("person"); }}
        onCreate={canCreate ? () => { setPerson(null); open("person"); } : undefined}
        onAssign={canAssign ? id => { keepCustomerInUrl(id); setPerson(people.find(p => p.id === id) ?? null); open("assign"); setRevenueStaffId(customerRows.find(c=>c.id===id)?.assignedStaff?.id??""); } : undefined}
      /> : (
      planArea === "catalog" ? <div className="overflow-x-auto rounded-lg border border-earth-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-earth-50">
            <tr>
              {["方案／適用課程", "額度", "售價", "單位價格", "有效天數", "狀態", "操作"].map((h) => (
                <th key={h} className="whitespace-nowrap p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100">
            {!filteredPlans.length && <tr><td colSpan={7} className="p-6 text-center text-earth-500">沒有符合條件的方案，請調整搜尋或篩選。</td></tr>}
            {filteredPlans.slice(currentPage * 20, (currentPage + 1) * 20).map((p) => (
                  <tr
                    key={p.id}
                    className={p.isActive ? "" : "bg-earth-50 text-earth-400"}
                  >
                    <td className="p-3">{canEdit && <input type="checkbox" className="mr-3" aria-label={`選取 ${p.name}`} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>}<span className="font-medium">{p.name}</span><div className="mt-1 flex flex-wrap gap-1"><span className="rounded-full bg-earth-100 px-2 py-0.5 text-[11px] text-earth-600">{p.customerPurchasable !== false ? "顧客可購買" : "僅後台指派"}</span>{p.allowShared && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary-700">允許共卡</span>}</div><p className="mt-1 text-xs text-earth-500">{p.templateIds.length ? templates.filter(t=>p.templateIds.includes(t.id)).map(t=>t.name).join("、") || "指定課程" : "本店所有課程"}</p></td>
                    <td className="p-3">{p.points} {p.unit === "SESSION" ? "堂" : "點"}</td>
                    <td className="p-3">NT$ {p.price.toLocaleString("zh-TW")}</td>
                    <td className="p-3 text-earth-600">NT$ {Math.round(p.price / Math.max(1, p.points)).toLocaleString("zh-TW")}／{p.unit === "SESSION" ? "堂" : "點"}</td>
                    <td className="p-3">{p.validDays > 0 ? `${p.validDays} 天` : "無期限"}</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${p.isActive ? "bg-emerald-50 text-emerald-700" : "bg-earth-100 text-earth-500"}`}>{p.isActive ? "上架" : "下架"}</span></td>
                    <td className="p-3">
                      {canEdit && (
                        <button
                          className={button}
                          onClick={() => {
                            preparePlan(p);
                          }}
                        >
                          編輯
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div> : canReadCards ? <CourseCardBrowser state={cardBrowse} onChange={setCardBrowse} onSelect={selectCard} revision={cardRevision}/> : null
      )}
      {view === "plans" && planArea === "catalog" && totalRows > 20 && <nav aria-label="清單分頁" className="mt-3 flex items-center justify-end gap-3"><span className="text-sm">共 {totalRows} 筆 · 第 {currentPage + 1}／{Math.ceil(totalRows / 20)} 頁</span><button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一頁</button><button className={button} disabled={(currentPage + 1) * 20 >= totalRows} onClick={() => setPage(currentPage + 1)}>下一頁</button></nav>}
      {panel && (
        <RightSheet presentation="centered"
          open
          onClose={close}
          width={panel === "assign" ? 880 : 640}
          labelledById="course-member-sheet"
        >
          <header className="flex shrink-0 items-center justify-between border-b p-4">
            <h2 id="course-member-sheet" className="font-semibold">
              {panel === "person"
                ? person ? person.name : "新增顧客"
                : panel === "health" ? `${person?.name ?? "顧客"} · 健康追蹤` : panel === "plan"
                  ? plan ? "編輯方案" : "新增方案"
                  : panel === "assign"
                    ? "指派方案"
                    : panel === "coach"
                      ? "加入為教練"
                      : "方案與共卡"}
            </h2>
            <button
              type="button"
              className={button}
              disabled={pending}
              onClick={close}
            >
              關閉
            </button>
          </header>
          {panel === "person" && person && <nav aria-label="顧客詳細資料分區" className="flex shrink-0 flex-wrap gap-1 border-b border-earth-200 bg-earth-50 px-4 py-2">
            {([ ["info","基本資料"], ...(canReadCards ? [["plans","持有方案"]] : []), ...((canReadTransactions || canReadBookings) ? [["records","購買與上課"]] : []) ]).map(([value,label])=><button key={value} type="button" aria-pressed={personTab===value} className={`${button} ${personTab===value?"border-primary-600 bg-primary-50 font-medium text-primary-800":"bg-white"}`} onClick={()=>setPersonTab(value as typeof personTab)}>{label}</button>)}
            {healthEnabled && <button type="button" className={button} onClick={()=>open("health")}>健康追蹤</button>}
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
            {panel === "health" && healthEnabled && person && <CourseCustomerHealth customerId={person.id} canEdit={canEdit} />}
            {panel === "person" && person && <section className="mb-4 space-y-3">
              <div className="flex flex-wrap gap-2">

                {personTab === "info" && canManageStaff && <button className={button} onClick={() => open("coach")}>加入為教練</button>}
                {personTab === "plans" && canAssign && <button className={button} onClick={() => open("assign")}>指派方案</button>}
              </div>
              {canReadCards && personTab === "plans" && <section aria-label="持有與共卡方案">
                <CourseCardBrowser customerId={person.id} state={customerCardBrowse} onChange={setCustomerCardBrowse} onSelect={selectCard} revision={cardRevision}/>

              </section>}
              {personTab === "info" && <details><summary className="min-h-11 cursor-pointer py-2">身分與歸屬資訊</summary><dl className="space-y-2 text-sm">
                <div>LINE 綁定：{customerRows.find(c=>c.id===person.id)?.lineLinkStatus === "LINKED" ? "已綁定" : "尚未綁定"}</div>
              </dl>
                <CustomerAttributionForm key={`attribution-${person.id}-${customerRows.find(c=>c.id===person.id)?.assignedStaff?.id??""}-${customerRows.find(c=>c.id===person.id)?.sponsor?.id??""}`} customerId={person.id} currentStaffId={customerRows.find(c=>c.id===person.id)?.assignedStaff?.id??null} currentSponsor={customerRows.find(c=>c.id===person.id)?.sponsor??null} staffOptions={assignmentStaff} canAssign={canAssignManager} saveAction={saveCourseCustomerAttribution} searchAction={searchCourseReferrerCandidates} onSaved={()=>router.refresh()} />
              </details>}
            </section>}
            {panel !== "person" && view === "customers" && person && <button type="button" className="mb-3 min-h-11 text-sm text-primary-700" disabled={pending} onClick={()=>{open("person");if(panel==="card")setPersonTab("plans");}}>‹ 返回 {person.name} 詳情</button>}
            {panel === "person" && person && personTab === "info" && !editingPerson && <section className="space-y-3">
              <dl className="course-customer-detail-grid grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">{[["電話",person.phone],["電子信箱",person.email],["生日",person.birthday],["性別",({male:"男",female:"女",other:"其他"} as Record<string,string>)[person.gender ?? ""]],["緊急聯絡人",person.emergencyContactName],["緊急聯絡電話",person.emergencyContactPhone],["地址",person.address],["店內備註",person.serviceNote]].map(([label,value])=><div key={label} className="course-customer-detail-field min-w-0"><dt className="text-earth-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-earth-900">{value || "尚未填寫"}</dd></div>)}</dl>
              {canEdit && <button className={`${button} bg-primary-700 text-white`} onClick={()=>setEditingPerson(true)}>編輯顧客資料</button>}
            </section>}
            {panel === "person" && (
              <form
                id="course-member-form"
                onChange={()=>setDirty(true)}
                className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${person && (!editingPerson || personTab !== "info") ? "hidden" : ""}`}
                onSubmit={(e) =>
                  submit(e, (d) =>
                    saveCourseCustomer({
                      id: person?.id,
                      name: d.get("name"),
                      phone: d.get("phone"),
                      email: d.get("email"), gender: d.get("gender"), birthday: d.get("birthday"), serviceNote: d.get("serviceNote"), address: d.get("address"), emergencyContactName: d.get("emergencyContactName"), emergencyContactPhone: d.get("emergencyContactPhone"),
                    }),
                  )
                }
              >
                <label className="block">
                  姓名
                  <input
                    className={field}
                    name="name"
                    defaultValue={person?.name}
                    readOnly={person ? !canEdit : !canCreate}
                    required
                    maxLength={80}
                  />
                </label>
                <label className="block">
                  電話
                  <input
                    className={field}
                    name="phone"
                    defaultValue={person?.phone}
                    readOnly={person ? !canEdit : !canCreate}
                    maxLength={30}
                    required
                  />
                </label>
                <fieldset disabled={person ? !canEdit : !canCreate} className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
                  <label className="block">電子信箱<input className={field} name="email" type="email" defaultValue={person?.email ?? ""} /></label>
                  <label className="block">性別<select className={field} name="gender" defaultValue={person?.gender ?? ""}><option value="">未填</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option></select></label>
                  <div>生日<BirthdayFields defaultValue={person?.birthday} className={field} /></div>
                  <label className="block">緊急聯絡人姓名<input className={field} name="emergencyContactName" maxLength={100} defaultValue={person?.emergencyContactName ?? ""} /></label>
                  <label className="block">緊急聯絡人電話<input className={field} name="emergencyContactPhone" type="tel" maxLength={30} defaultValue={person?.emergencyContactPhone ?? ""} /></label>
                  <label className="block">地址<input className={field} name="address" maxLength={300} defaultValue={person?.address ?? ""} /></label>
                  {plan?.termSessionIds?.filter(id=>!termSessions.some(s=>s.id===id)).map(id=><input key={id} type="hidden" name="termSessionIds" value={id}/>)}
                  <label className="block">店內備註（店長與授課教練可見）<textarea className={field} name="serviceNote" maxLength={1000} defaultValue={person?.serviceNote ?? ""} /></label>
                </fieldset>
              </form>
            )}
            {panel === "person" && personTab === "records" && canReadTransactions && canReadBookings && <nav aria-label="紀錄種類" className="flex gap-2">{([ ["purchases","交易紀錄"],["bookings","上課紀錄"] ] as const).map(([value,label])=><button type="button" key={value} aria-pressed={recordTab===value} className={`${button} ${recordTab===value ? "bg-primary-50 font-semibold":""}`} onClick={()=>setRecordTab(value)}>{label}</button>)}</nav>}
            {panel === "person" && personTab === "records" && person && canReadTransactions && recordTab === "purchases" && <CourseCustomerPurchases key={`purchases-${person.id}`} customerId={person.id} />}
            {panel === "person" && personTab === "records" && person && canReadBookings && recordTab === "bookings" && <CourseCustomerBookings key={`bookings-${person.id}`} customerId={person.id} />}
            {panel === "plan" && (
              <form
                id="course-member-form"
                onChange={()=>setDirty(true)}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                onSubmit={(e) =>
                  submit(e, (d) =>
                    saveCoursePointPlan({
                      id: plan?.id,
                      name: d.get("name"),
                      points: Number(d.get("points")),
                      price: Number(d.get("price")),
                      storeCost: profitEnabled ? Number(d.get("storeCost")) : (plan?.storeCost??0),
                      termSessionIds:d.getAll("termSessionIds"),
                      customerPurchasable: d.get("purchaseMode") === "customer",
                      allowShared: d.get("allowShared") === "yes",
                      validDays: Number(d.get("days")),
                      isActive: d.get("active") === "yes",
                      unit: d.get("unit"),
                      templateIds: d.getAll("templateIds"),
                    }),
                  )
                }
              >
                <label className="block sm:col-span-2">
                  名稱
                  <input
                    className={field}
                    name="name"
                    defaultValue={plan?.name}
                    required
                  />
                </label>
                <label className="block">額度單位<select className={field} name="unit" defaultValue={plan?.unit??"POINT"}><option value="POINT">點數</option><option value="SESSION">堂數（每堂使用 1 堂）</option></select></label>
                <label className="block">狀態<select className={field} name="active" defaultValue={plan?.isActive === false ? "no" : "yes"}><option value="yes">上架</option><option value="no">下架</option></select></label>
                <label className="sm:col-span-2">搜尋適用課程<input className={field} value={templateSearch} onChange={e=>setTemplateSearch(e.target.value)} placeholder="輸入課程名稱篩選；未輸入會顯示全部課程"/></label>
                <fieldset className="sm:col-span-2 rounded-lg border border-earth-200 p-3">
                  <legend className="px-1">適用課程（未勾選表示全部課程）</legend>
                  {selectedTemplateIds.map(id=><input key={id} type="hidden" name="templateIds" value={id}/>)}
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-earth-100 pb-2 text-sm">
                    <span className="text-earth-600">已選 {selectedTemplateIds.length} 堂 · 顯示 {visibleTemplates.length} 堂</span>
                    <span className="flex gap-2">
                      <button type="button" className={button} onClick={()=>{setDirty(true);setSelectedTemplateIds(ids=>[...new Set([...ids,...visibleTemplates.filter(t=>t.isActive).map(t=>t.id)])]);}}>全選目前結果</button>
                      <button type="button" className={button} onClick={()=>{setDirty(true);setSelectedTemplateIds(ids=>ids.filter(id=>!visibleTemplates.some(t=>t.id===id&&t.isActive)));}}>清除目前結果</button>
                    </span>
                  </div>
                  <div className="max-h-64 space-y-3 overflow-y-auto overscroll-contain pr-1">
                    {templateGroups.map(group=><section key={group} aria-label={group}>
                      <h3 className="sticky top-0 bg-white py-1 text-xs font-semibold text-earth-500">{group}</h3>
                      {visibleTemplates.filter(t=>(t.category||"未分類")===group).map(t=>{
                        const selected=selectedTemplateIds.includes(t.id);
                        return <label key={t.id} className={`flex min-h-10 items-center gap-2 rounded-md px-2 ${t.isActive?"hover:bg-earth-50":"bg-earth-50 text-earth-400"}`}>
                          <input type="checkbox" value={t.id} checked={selected} disabled={!t.isActive} onChange={e=>{setDirty(true);setSelectedTemplateIds(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id));}}/>
                          <span className="min-w-0 flex-1 truncate">{t.name}</span>
                          {!t.isActive&&<span className="rounded-full bg-earth-200 px-2 py-0.5 text-[11px]">已下架</span>}
                        </label>;
                      })}
                    </section>)}
                    {!visibleTemplates.length&&<p className="py-6 text-center text-sm text-earth-500">沒有符合搜尋的課程</p>}
                  </div>
                </fieldset>
                {plan?.termSessionIds?.filter(id=>!termSessions.some(s=>s.id===id)).map(id=><input key={id} type="hidden" name="termSessionIds" value={id}/>)}<details className="sm:col-span-2"><summary className="cursor-pointer py-2">期課：連結指定課次（選填）</summary><p className="text-sm text-earth-600">未選為自由預約；選擇後請使用堂數方案，課次数須等於販售堂數。結帳會一次預約全期；未到仍扣堂，不提供補課券。</p><div className="max-h-48 overflow-y-auto">{termSessions.map(s=><label key={s.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="termSessionIds" value={s.id} defaultChecked={plan?.termSessionIds?.includes(s.id)}/>{formatTWDateTime(new Date(s.startsAt))} · {s.name}</label>)}</div></details>
                {[
                  ["額度", "points", plan?.points ?? 10, 1],
                  ["售價", "price", plan?.price ?? 0, 0],
                  ["店家成本", "storeCost", plan?.storeCost ?? 0, 0],
                  ["有效天數", "days", plan?.validDays ?? 90, 1],
                ].filter(([,name])=>profitEnabled||name!=="storeCost").map(([label, name, value, min]) => (
                  <label key={String(name)} className="block">
                    {label}
                    <input
                      className={field}
                      name={String(name)}
                      type="number"
                      min={Number(min)}
                      defaultValue={Number(value)}
                      onChange={e=>{
                        const amount=Number(e.target.value)||0;
                        if(name==="points")setPlanAmounts(v=>({...v,points:amount}));
                        if(name==="price")setPlanAmounts(v=>({...v,price:amount}));
                        if(name==="storeCost")setPlanAmounts(v=>({...v,storeCost:amount}));
                      }}
                      required
                    />
                  </label>
                ))}
                <div className="sm:col-span-2 grid grid-cols-2 gap-3 rounded-lg bg-primary-50 p-3 text-sm"><p><span className="text-earth-500">單位價格</span><strong className="block text-primary-800">NT$ {unitPrice.toLocaleString("zh-TW")}／單位</strong></p>{profitEnabled&&<p><span className="text-earth-500">預估利潤</span><strong className={`block ${estimatedProfit<0?"text-red-700":"text-primary-800"}`}>NT$ {estimatedProfit.toLocaleString("zh-TW")}</strong></p>}</div>
                <fieldset className="sm:col-span-2 rounded-lg border border-earth-200 p-3"><legend className="px-1">方案使用方式</legend><div className="grid gap-2 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-2 rounded-lg border border-earth-200 px-3"><input type="radio" name="purchaseMode" value="customer" defaultChecked={plan?.customerPurchasable!==false}/>顧客可購買</label><label className="flex min-h-11 items-center gap-2 rounded-lg border border-earth-200 px-3"><input type="radio" name="purchaseMode" value="backend" defaultChecked={plan?.customerPurchasable===false}/>僅後台指派</label></div><label className="mt-2 flex min-h-11 items-center gap-2 rounded-lg border border-earth-200 px-3"><input type="checkbox" name="allowShared" value="yes" defaultChecked={plan?.allowShared??false}/>允許共卡</label></fieldset>
                <p className="sm:col-span-2 text-sm text-earth-500">
                  修改預設不影響已指派方案；方案下架也會保留顧客已持有的額度。提供點數與堂數方案，無自動續費。
                </p>
              </form>
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
                      expectedListPrice: Number(d.get("expectedListPrice")),
                      expectedStoreCost: Number(d.get("expectedStoreCost")),
                      revenueStaffId: String(d.get("revenueStaffId")??""),
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
                  <CourseOptionSelect label="方案" required value={planId} options={plans.filter(p=>p.isActive).map(p=>({id:p.id,label:`${p.name} · ${p.points} ${p.unit==="SESSION" ? "堂":"點"}`}))} onChange={id=>{setAssignmentSummary({paid:null,valid:false});setPlanId(id);setDirty(true);}}/>

                </label>
                <label className="block" key={planId}>
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
                </label>
                {profitEnabled&&<label className="block">直屬店長<CourseOptionSelect label="直屬店長" name="revenueStaffId" placeholder="請選擇直屬店長" value={revenueStaffId} onChange={id=>{setRevenueStaffId(id);setDirty(true);}} options={assignmentStaff.map(s=>({id:s.id,label:s.displayName}))}/></label>}
                {plans.find(p=>p.id===planId)?.termSessionIds?.length ? <p className="text-sm text-earth-600">固定期課：{plans.find(p=>p.id===planId)!.termSessionIds!.length} 堂，依方案已設定課次安排。</p> : null}
                </fieldset>
                <fieldset disabled={pending} className="min-w-0 min-[1024px]:border-l min-[1024px]:border-earth-200 min-[1024px]:pl-5">
                  <CourseAssignmentPayment profitEnabled={profitEnabled} key={planId} storeCost={plans.find(p=>p.id===planId)?.storeCost??0} price={plans.find(p=>p.id===planId)?.price ?? 0} canDiscount={canDiscount} showAllocation={canReadTransactions&&profitEnabled} onSummary={setAssignmentSummary}/>
                </fieldset>
              </form>
            )}
            {panel === "card" && card && (
              <>
                {cardLoading && <p role="status">讀取方案詳細資料中…</p>}
                <CourseCardSummary card={card} />
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
          {panel !== "health" && (panel !== "person" || (person ? canEdit && editingPerson && personTab === "info" : canCreate)) && (panel !== "card" || (canAssign && card?.allowShared)) && (
            <footer className="shrink-0 border-t bg-white p-4">
              {panel === "assign" && <p className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span>{person?.name} · {plans.find(p=>p.id===planId)?.name}</span><strong>實收 {assignmentSummary.paid === null ? "—" : `NT$ ${assignmentSummary.paid.toLocaleString()}`}</strong></p>}
              <button
                form="course-member-form"
                type="submit"
                className={`${button} w-full bg-primary-700 text-white`}
                disabled={pending || (panel === "card" && (cardLoading || !!error)) || (panel === "assign" && (!planId || !assignmentSummary.valid))}
              >
                {pending ? "儲存中…" : panel === "assign" ? "確認結帳並指派方案" : panel === "card" ? "儲存共卡成員" : "儲存"}
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
        剩餘 {card.remaining} · 已預約占用 {card.held} · 可用 {card.available}{" "}
        {card.unit === "SESSION" ? "堂" : "點"}
      </p>
      <p>
        期限：{toLocalDateStr(new Date(card.expiresAt))}
        {new Date(card.expiresAt) < new Date() ? "（已到期）" : ""}
      </p>
      <p>授權成員：{card.members.map((m) => m.name).join("、")}</p>
    </div>
  );
}
export function CourseCardEntries({ card }: { card: CourseCardView }) {
  const labels: Record<string, string> = {
    GRANT: "取得額度",
    REFUND: "退款收回額度",
    VOID: "誤建作廢收回額度",
    RESERVE: "預約占用",
    RELEASE: "釋放占用",
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
