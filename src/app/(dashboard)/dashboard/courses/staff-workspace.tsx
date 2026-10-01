"use client";
import {MusicTeacherFeeEditor,type TeacherFeeDraft,type TeacherPlan} from "@/components/admin/music-teacher-fee-editor";
import type {MusicTeacherSettings} from "@/lib/music-teacher-settings";
import {useCourseDisplayOrder} from "@/components/admin/course-display-order";
import type {CourseOrderSnapshot} from "@/lib/course-display-order";

import {CourseTestDataFilter,isCourseTestData} from "@/components/admin/course-test-data-filter";
import {CourseStatusButton,useCourseStatusRows} from "@/components/admin/course-status-button";
import {CourseStaffAssignments} from "@/components/admin/course-staff-assignments";
import {CourseCustomerPicker} from "@/components/admin/course-customer-picker";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";
import {CourseStaffAvailabilityEditor} from "./course-staff-availability-editor";
import {CourseConflicts,type ConflictItem} from "@/components/admin/course-conflicts";
import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { RightSheet } from "@/components/admin/right-sheet";

import { readCourseStaffTeaching, saveCourseStaff } from "@/server/actions/course-staff";
type Person = {
  linkedStaffId?:string;
  linkedStaffName?:string;
  financeTeacherIds?:string[]|null;
  updatedAt?: string;
  coachLoginReady:boolean;
  coachEnabled:boolean;
  defaultClassFee?:string;
  qualificationIds:string[];
  qualificationsConfirmed:boolean;
  birthday:string;
  emergencyContactRelation:string;
  assignments:ConflictItem[];
  id: string;
  name: string;
  kind: "manager" | "coach";
  email: string;
  contactEmail?:string;
  notificationsEnabled?:boolean;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  active: boolean;
  memberEnabled: boolean;
  permissions: string[];
  customerId: string;
};
function identity(p: Pick<Person,"kind"|"coachEnabled"|"memberEnabled"|"customerId">,music=false) {
  return p.kind === "manager" ? (p.coachEnabled ? (music?"店長兼老師":"店長兼教練"):"店長") : !p.coachEnabled ? "未啟用工作身分" : p.memberEnabled && p.customerId ? (music?"老師兼顧客":"教練兼顧客"):(music?"老師":"教練");
}
const field = "min-h-11 min-w-0 max-w-full w-full rounded-xl border border-earth-200 bg-white px-3 py-2 text-base text-earth-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";
const button =
  "min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-earth-200 bg-white px-3 py-2 text-sm text-primary-800 hover:bg-primary-50 disabled:opacity-50";
export function CourseStaffWorkspace({
  counterpartChoices=[],
  displayOrder,
  financeScope=null,
  teacherChoices=[],
  accountKind,
  feeEnabled:feeAccess=true,
  canEditFees:editFeeAccess=true,
  staff: sourceStaff,
  maxStaff,
  templates,
  customers,
  canManage,
  permissionGroups,
  music = false,
}: {
  counterpartChoices?:{id:string;name:string;phone:string;birthday:string;emergencyContactName:string;emergencyContactPhone:string;emergencyContactRelation:string;linked:boolean}[];
  financeScope?:string[]|null;
  teacherChoices?:{id:string;name:string}[];
  displayOrder?:CourseOrderSnapshot;
  accountKind?:"manager"|"coach";
  feeEnabled?:boolean;
  canEditFees?:boolean;
  staff: Person[];
  maxStaff: number | null;
  templates:TeacherPlan[];
  customers: { id: string; name: string }[];
  canManage: boolean;
  music?:boolean;
  permissionGroups: {
    label: string;
    codes: { code: string; label: string }[];
  }[];
}) {
  const [staffPage,setStaffPage]=useState(0);
  const [showInactive,setShowInactive]=useState(false);
  const [staff,applyStatus,busyIds,setStatusBusy]=useCourseStatusRows(sourceStaff,"active");
  const [linkedStaffId,setLinkedStaffId]=useState("");
  const selectedCounterpart=counterpartChoices.find(c=>c.id===linkedStaffId);
 const [hideTestData,setHideTestData]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [role, setRole] = useState("all"),
    [open, setOpen] = useState(false),
    [person, setPerson] = useState<Person | null>(null),
    [kind, setKind] = useState<"coach" | "manager">("coach"),
    [error, setError] = useState(""),
    [key, setKey] = useState("");
  const feeEnabled=feeAccess&&(financeScope===null||!!person&&financeScope.includes(person.id));
  const canEditFees=editFeeAccess&&(financeScope===null||!!person&&financeScope.includes(person.id));
  const [financeTeacherIds,setFinanceTeacherIds]=useState<string[]|null>(null);
  const [coachEnabled,setCoachEnabled]=useState(true);
  const [qualificationIds,setQualificationIds]=useState<string[]>([]);
  const [qualificationSearch,setQualificationSearch]=useState("");
  const [qualificationScope,setQualificationScope]=useState("all");
  const [qualificationPage,setQualificationPage]=useState(0);
  const matchingTemplates=templates.filter(t=>t.name.toLocaleLowerCase().includes(qualificationSearch.trim().toLocaleLowerCase()) && (qualificationScope!=="selected" || qualificationIds.includes(t.id)));
  const qualificationPages=Math.max(1,Math.ceil(matchingTemplates.length/10));
  const visibleQualificationPage=Math.min(qualificationPage,qualificationPages-1);
  const [qualificationsTouched,setQualificationsTouched]=useState(false);
  const [conflicts,setConflicts]=useState<ConflictItem[]>([]);
  const [tab,setTab]=useState("basic");
  const [readOnly,setReadOnly]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [teachingDirty,setTeachingDirty]=useState(false);
  const [fees,setFees]=useState<Record<string,TeacherFeeDraft>>({});
  const [musicSettings,setMusicSettings]=useState<MusicTeacherSettings>({defaultRatio:null,subjectRules:{},revision:0});
  const [teachingVersion,setTeachingVersion]=useState<string>();
  const [defaultFeeDirty,setDefaultFeeDirty]=useState(false);
  const [feesReady,setFeesReady]=useState(false);
  const [feesError,setFeesError]=useState("");
  const [reloadFees,setReloadFees]=useState(0);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty]);
  useEffect(() => {
    if (!open || tab!=="qualifications" || feesReady || !person || (!canManage && !feeEnabled)) return;
    let active = true;
    readCourseStaffTeaching(person.id).then(result => {
      if (!active) return;
      if (!result.success) { setFeesError(result.error); return; }
      const loadedFees:Record<string,TeacherFeeDraft>=Object.fromEntries(result.fees.map(f => [f.templateId, {
        mode: !f.rules.length ? "INHERIT" : f.rules.length === 1 && f.rules[0].mode === "SHARE" ? "SHARE" : "CLASS",
        value: f.rules.length === 1 && (f.rules[0].mode === "CLASS" || (music && f.rules[0].mode === "SHARE")) ? String(f.rules[0].value) : "",
        revision: f.revision,
      }]));
      const loadedSettings=result.musicSettings??{defaultRatio:null,subjectRules:{},revision:0};
      for(const template of templates){const draft=loadedFees[template.id];const subjectRule=template.musicSubjectId?loadedSettings.subjectRules[template.musicSubjectId]:undefined;if(result.qualificationIds.includes(template.id)&&draft?.mode==="INHERIT"&&subjectRule)loadedFees[template.id]={...draft,mode:subjectRule.mode==="SHARE"?"SHARE":"CLASS",value:String(subjectRule.value)};}
      setFees(loadedFees);
      setMusicSettings({...loadedSettings,subjectRules:{}});
      setTeachingVersion(result.version);
      setQualificationIds(result.qualificationIds);
      setFeesReady(true);
    }).catch(() => { if (active) setFeesError("授課費讀取失敗，請重試；尚未覆蓋原設定。"); });
    return () => { active = false; };
  }, [open, tab, feesReady, person, canManage, reloadFees, music, feeEnabled, templates]);
  const activeCount = staff.filter(p => p.active).length;
  const atLimit = maxStaff !== null && activeCount >= maxStaff;
  const order=useCourseDisplayOrder("staff",staff,displayOrder,canManage&&!search&&filter==="all"&&role==="all"&&!hideTestData&&!busyIds.length,p=>p.active);
  const rows = staff
    .filter(
      (s) =>
        (!hideTestData||!isCourseTestData(s.name)) && `${s.name} ${s.phone} ${s.email}`.includes(search) &&
        (filter === "all" || s.active === (filter === "active")) &&
        (role === "all" || (role === "coach" ? s.coachEnabled : role === "both" ? s.kind === "manager" && s.coachEnabled : s.kind === role)),
    )
    .sort((a, b) => Number(b.active) - Number(a.active)||order.compare(a,b));
  const allowedPermissionCodes = permissionGroups.flatMap((group) => group.codes.map((item) => item.code));
  const permissionQuery = permissionSearch.trim().toLocaleLowerCase();
  const visiblePermissionGroups = permissionGroups
    .map((group) => ({
      ...group,
      codes: group.codes.filter(({ code, label }) =>
        !permissionQuery || `${label} ${code}`.toLocaleLowerCase().includes(permissionQuery),
      ),
    }))
    .filter((group) => group.codes.length);
  const activeRows=rows.filter(p=>p.active),inactiveRows=rows.filter(p=>!p.active);
  const inactiveForced=filter==="inactive"||!!search||role!=="all";
  const inactiveExpanded=inactiveForced||showInactive;
  const staffPages=Math.max(1,Math.ceil(activeRows.length/20));
  const currentStaffPage=Math.min(staffPage,staffPages-1);
  const visibleRows=[...activeRows.slice(currentStaffPage*20,(currentStaffPage+1)*20),...(inactiveExpanded?inactiveRows:[])];
  function edit(p: Person | null) {
    setLinkedStaffId(p?.linkedStaffId??"");
    setMusicSettings({defaultRatio:null,subjectRules:{},revision:0});
    setDirty(false);setTeachingDirty(false);setDefaultFeeDirty(false);setFees({});setTeachingVersion(undefined);setFeesReady(!p);setFeesError("");
    setPerson(p);setCoachEnabled(p?.coachEnabled ?? accountKind!=="manager");setQualificationIds(p?.qualificationIds ?? []);setQualificationSearch("");setQualificationScope("all");setQualificationPage(0);setQualificationsTouched(false);setConflicts([]);setTab("basic");setReadOnly(!canManage);
    const allowed = new Set(permissionGroups.flatMap((g) => g.codes.map((c) => c.code)));
    setPermissions((p?.permissions ?? []).filter((permission) => allowed.has(permission)));
    setFinanceTeacherIds(p?.financeTeacherIds??financeScope);
    setPermissionSearch("");
    setKind(p?.kind ?? accountKind ?? "coach");
    setError("");
    setKey(crypto.randomUUID());
    setOpen(true);
  }
  function close() {
    if (pending || (dirty && !window.confirm("尚有未儲存的修改，確定關閉？"))) return;
    setOpen(false);
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${field} max-w-xs`}
          aria-label="搜尋人員"
          placeholder="搜尋姓名／電話／信箱"
          value={search}
          onChange={(e) => {setSelected([]);setSearch(e.target.value);setStaffPage(0);}}
        />
        <select
          className={button}
          aria-label="人員角色"
          value={role}
          onChange={(e)=>{setSelected([]);setRole(e.target.value);}}
        >
          <option value="all">全部角色</option>
          <option value="manager">店長</option>
          <option value="coach">{music?"老師":"教練"}</option>{staff.some(s=>s.kind==="manager"&&s.coachEnabled)&&<option value="both">舊資料兼任（待拆分）</option>}
        </select>
        <select
          className={button}
          aria-label="人員狀態"
          value={filter}
          onChange={(e) => {setSelected([]);setFilter(e.target.value);setStaffPage(0);}}
        >
          <option value="all">全部狀態</option>
          <option value="active">啟用</option>
          <option value="inactive">停用</option>
        </select>

        {canManage && (
          <button className={button} onClick={() => edit(null)}>
            {accountKind==="coach"?(music?"新增教師":"新增教練"):"新增人員"}
          </button>
        )}
      </div>
      {canManage && atLimit && <p className="text-xs text-amber-800">啟用人員已達上限（{activeCount}／{maxStaff}）。可建立停用人員；啟用時須有剩餘名額。</p>}
<div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {music&&<CourseTestDataFilter names={staff.map(p=>p.name)} checked={hideTestData} onChange={v=>{setSelected([]);setStaffPage(0);setHideTestData(v);}}/>}
      {canManage && <CourseBatchBar key={`${hideTestData}:${search}:${filter}:${role}:${inactiveExpanded}`} canDelete={canManage} names={Object.fromEntries(visibleRows.map(p=>[p.id,p.name]))} kind="staff" blockedIds={busyIds} states={Object.fromEntries(visibleRows.map(p=>[p.id,p.active]))} onApplied={applyStatus} onPendingChange={setStatusBusy} ids={visibleRows.map(p=>p.id)} selected={selected} onChange={setSelected}/>}
</div>
      <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-earth-50">
            <tr>
              {["姓名", "聯絡方式", "身分", "系統通知", "操作"].map((t) => (
                <th key={t} className={`px-3 py-2 font-medium ${!music&&t==="操作"?"w-[72px] min-w-[72px] max-w-[72px] text-center":""}`}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100">
            {visibleRows.map((p,index) => (
              <Fragment key={p.id}>
              {!p.active&&(index===0||visibleRows[index-1]?.active)&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={5} className="px-3 py-2"><button type="button" disabled={inactiveForced} className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600 disabled:cursor-default" onClick={()=>{setSelected([]);setShowInactive(v=>!v);}}><span>停用人員（{inactiveRows.length}）</span><span>{inactiveForced?"篩選結果":inactiveExpanded?"收合":"展開"}</span></button></td></tr>}
              <tr
                {...order.rowProps(p.id)}
                className={p.active ? "" : "bg-earth-50/80 text-earth-400"}
              >
                <td className="whitespace-nowrap px-3 py-2">{canManage&&order.handle(p.id,p.name)}{canManage && <input type="checkbox" aria-label={`選取 ${p.name}`} className="mr-2" disabled={busyIds.includes(p.id)} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>}{music?<span className="font-medium">{p.name}</span>:<button type="button" className="min-h-11 font-medium text-primary-900 hover:underline" onClick={()=>{edit(p);setReadOnly(!canManage);}}>{p.name}</button>}{!p.active && p.assignments.length>0 && <span className="ml-2 text-xs text-amber-800">{p.assignments.length} 堂待交接</span>}</td>
                <td className="px-3 py-2"><a className="block whitespace-nowrap text-primary-800 hover:underline" href={p.phone?`tel:${p.phone}`:undefined}>{p.phone||"未填電話"}</a><span className="block max-w-56 truncate text-xs text-earth-500">{p.kind==="manager"?p.email:p.contactEmail||"未填 Email"}</span></td>
                <td className="px-3 py-2">{identity(p,music)}<span className="block whitespace-nowrap text-xs text-earth-600">{!p.active?"停用":music?"啟用":""}{p.coachEnabled?` · ${p.qualificationsConfirmed&&p.qualificationIds.length?"授課已設定":"授課待補"}`:""}</span></td>
                <td className="px-3 py-2"><span className={p.notificationsEnabled!==false&&p.coachLoginReady?"text-primary-800":"text-earth-500"}>{p.notificationsEnabled===false?"已關閉":p.coachLoginReady?"可通知":"待連結 LINE"}</span></td>
                <td className={`whitespace-nowrap px-3 py-2 align-middle ${!music?"w-[72px] min-w-[72px] max-w-[72px] text-center":""}`}>
                  {!music ? <div className="flex items-center justify-center"><ExclusiveMenu quiet triggerText="⋯" label={`${p.name}操作`}><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>edit(p)}>{canManage?"編輯":"查看"}</button>{canManage&&<CourseStatusButton quiet kind="staff" id={p.id} disabled={busyIds.includes(p.id)} active={p.active} onApplied={applyStatus} onPendingChange={setStatusBusy}/>} {canManage&&p.coachEnabled&&<button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>{edit(p);setTab("qualifications");}}>授課設定</button>}</ExclusiveMenu></div> : <>                  {canManage&&<CourseStatusButton kind="staff" id={p.id} disabled={busyIds.includes(p.id)} active={p.active} onApplied={applyStatus} onPendingChange={setStatusBusy}/>}
                  <button className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" disabled={busyIds.includes(p.id)} onClick={() => edit(p)}>{canManage ? "編輯" : "查看"}</button>
                  {canManage && p.coachEnabled && <button className="ml-1 min-h-9 rounded-lg border border-earth-200 px-2 text-sm" onClick={() => { edit(p); setTab("qualifications"); }}>授課設定</button>}
</>}
                </td>
              </tr>
              </Fragment>
            ))}
            {!inactiveExpanded&&inactiveRows.length>0&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={5} className="px-3 py-2"><button type="button" className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600" onClick={()=>{setSelected([]);setShowInactive(true);}}><span>停用人員（{inactiveRows.length}）</span><span>展開</span></button></td></tr>}
          </tbody>
        </table>
      </div>
      {staffPages>1 && <nav aria-label="人員分頁" className="mt-3 flex flex-wrap items-center justify-end gap-3 text-sm"><span>啟用 {activeRows.length} 人 · 第 {currentStaffPage+1}／{staffPages} 頁</span><button className={button} disabled={!currentStaffPage} onClick={()=>setStaffPage(currentStaffPage-1)}>上一頁</button><button className={button} disabled={currentStaffPage+1>=staffPages} onClick={()=>setStaffPage(currentStaffPage+1)}>下一頁</button></nav>}
      {open && (
        <RightSheet presentation="centered"
          compact
          open
          onClose={close}
          width={920}
          labelledById="course-staff-title"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2">
            <h2 id="course-staff-title" className="font-semibold">
              {person ? (readOnly ? (accountKind==="coach" ? (music?"查看教師":"查看教練"):"查看人員"):(accountKind==="coach" ? (music?"編輯教師":"編輯教練"):"編輯人員")) : (accountKind==="coach" ? (music?"新增教師":"新增教練"):"新增人員")}
            </h2>
            <button
              className={button}
              disabled={pending}
              onClick={close}
            >
              關閉
            </button>
          </header>
          <nav className="flex flex-wrap gap-2 border-b border-earth-200 px-4 py-2">{[["basic","基本資料"],...(coachEnabled?[["qualifications",feeEnabled?(music?"授課與拆帳":"授課費設定"):"授課資格"],["work","工作與授課安排"]]:[]),...(kind==="manager"?[["permissions","後台帳號／權限"]]:[])].map(([id,label])=><button key={id} type="button" className={`${button} ${tab===id ? "!border-primary-300 !bg-primary-50 font-medium !text-primary-900" : ""}`} onClick={()=>setTab(id)} aria-pressed={tab===id}>{label}</button>)}</nav>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {!person && <p className={`mb-3 text-sm ${atLimit ? "text-amber-800" : "text-earth-600"}`}>啟用人員 {activeCount}／{maxStaff ?? "不限"}。{atLimit ? "啟用人員已達上限，可選停用建立；日後啟用仍須檢查額度。" : `店務使用信箱登入，${music?"教師":"教練"}另建帳號並連結 LINE 會員。`}</p>}
            <CourseConflicts items={conflicts}/>
            {error && (
              <p role="alert" className="mb-3 text-red-700">
                {error}
              </p>
            )}
            {readOnly && person && <section className="space-y-3">
              {tab === "basic" && <dl className={music?"divide-y divide-earth-100":"grid gap-x-6 sm:grid-cols-2"}>{[["姓名",person.name],["身分",identity(person,music)],["電話",person.phone || "未填"],["Email",person.kind==="manager"?person.email:person.contactEmail||"未填"],["系統通知",person.notificationsEnabled===false?"關閉":"開啟"],["生日",person.birthday || "未填（選填）"],["緊急聯絡",[person.emergencyContactName || "姓名待補",person.emergencyContactRelation || "關係待補",person.emergencyContactPhone || "電話待補"].join("／")],["狀態",person.active ? "啟用":"停用"]].map(([label,value])=><div key={label} className="grid grid-cols-[6rem_1fr] gap-2 border-b border-earth-100 py-2 text-sm"><dt className="text-earth-500">{label}</dt><dd>{value}</dd></div>)}</dl>}
              {(tab === "qualifications" || tab === "work") && <><h3 className="font-medium">授課設定狀態</h3><p>{person.qualificationsConfirmed && qualificationIds.length ? "已設定可教授課程" : "授課設定待補"}</p><h3 className="font-medium">可教授課程</h3><p>{templates.filter(t=>qualificationIds.includes(t.id)).map(t=>t.name).join("、") || "尚未設定"}</p><h3 className="pt-3 font-medium">{music?"老師登入狀態":"教練登入狀態"}</h3><p>{person.coachLoginReady ? (music?"已開通老師登入":"已開通教練登入") : (music?"尚未開通老師登入":"尚未開通教練登入")}</p>{!person.coachLoginReady && <p className="text-sm text-earth-600">先由授課人員完成本店會員登入，再編輯此頁「連結既有顧客」並儲存。授課設定與登入分開，不影響店長依資格排課。</p>}<h3 className="pt-3 font-medium">會員連結</h3><p>{person.customerId ? customers.find(c=>c.id===person.customerId)?.name ?? "已連結會員" : "尚未連結 · 我的工作尚不可使用"}</p>{person.customerId && <p>{person.memberEnabled ? "會員專區／我的工作":"僅我的工作"}</p>}{person.assignments.length ? <CourseStaffAssignments items={person.assignments} label={person.active?"目前授課":"待交接課次"}/> : <p className="pt-3 text-earth-500">沒有未結束且未取消的課次。</p>}</>}
              {tab === "qualifications" && music && feeEnabled && feesReady && <MusicTeacherFeeEditor readOnly templates={templates.filter(t=>qualificationIds.includes(t.id))} qualificationIds={qualificationIds} fees={fees} settings={musicSettings} onSettings={()=>{}} onFees={()=>{}} onQualification={()=>{}}/>}
              {tab === "permissions" && <><h3 className="font-medium">後台登入</h3><p>{person.email}</p><h3 className="pt-3 font-medium">店內管理權限</h3>{permissionGroups.map(g=><details key={g.label}><summary className="min-h-11 cursor-pointer py-3">{g.label} · {g.codes.filter(c=>permissions.includes(c.code)).length} 項</summary><p>{g.codes.filter(c=>permissions.includes(c.code)).map(c=>c.label).join("、") || "未開啟"}</p></details>)}</>}
            </section>}
            <form
              id="course-staff-form"
              noValidate
              hidden={readOnly}
              onInvalidCapture={(e)=>{const group=(e.target as HTMLElement).closest<HTMLElement>("[data-staff-tab]");if(group)setTab(group.dataset.staffTab!);}}
              onChangeCapture={e=>{if(!(e.target as HTMLElement).closest("[data-browse-control]")){setDirty(true);if((e.target as HTMLElement).closest('[data-staff-tab="qualifications"]'))setTeachingDirty(true);}}}
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (pending || (teachingDirty && !feesReady)) return;

                const invalidFee=teachingDirty && coachEnabled && feeEnabled && canEditFees ? qualificationIds.find(id=>{if(!fees[id]||fees[id].mode==="INHERIT")return false;const raw=fees[id].value;const value=Number(raw);return !raw.trim() || !Number.isFinite(value) || value<0 || value>1000000 || Math.abs(value*100-Math.round(value*100))>0.000001;}) : undefined;

                if(invalidFee){setTab("qualifications");setQualificationSearch("");setQualificationScope("all");setQualificationPage(Math.max(0,Math.floor(templates.findIndex(t=>t.id===invalidFee)/10)));setError(`請填寫「${templates.find(t=>t.id===invalidFee)?.name??"課程"}」的每堂授課費（0 至 1,000,000 元，最多兩位小數）。`);return;}
                const invalid=e.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement>("input:invalid,select:invalid,textarea:invalid");
                if(invalid){const group=invalid.closest<HTMLElement>("[data-staff-tab]");if(group)setTab(group.dataset.staffTab!);setQualificationSearch("");requestAnimationFrame(()=>invalid.reportValidity());return;}
                const d = new FormData(e.currentTarget);
                const deactivating=person?.active && d.get("active")==="no";
                if(person?.linkedStaffId && !linkedStaffId && !window.confirm("確定解除同一人連結？兩個身分及過往紀錄都會保留。"))return;
                if(deactivating && !window.confirm(`確認停用？立即撤銷所有工作存取，${person.assignments.length} 堂未結束課次保留待交接；會員與歷史不變。`)) return;
                start(async () => {
                  try {
                    const r = await saveCourseStaff({
                      id: person?.id,
                      linkedStaffId,
                      name: d.get("name"),
                      kind,
                      coachEnabled,
                      qualificationIds: coachEnabled ? qualificationIds : person?.qualificationIds ?? [],
                      qualificationsConfirmed: coachEnabled ? (!person || person.qualificationsConfirmed || qualificationsTouched) : person?.qualificationsConfirmed ?? false,
                      teachingVersion,

                      musicSettings: teachingDirty && music && coachEnabled && feeEnabled && canEditFees ? musicSettings : undefined,
                      teachingFees: teachingDirty && coachEnabled && feeEnabled && canEditFees ? qualificationIds.map(templateId => ({templateId, value: !fees[templateId] || fees[templateId].mode==="INHERIT" ? null : {mode: fees[templateId].mode, value: Number(fees[templateId].value)}, revision: fees[templateId]?.revision ?? 0})) : undefined,

                      emergencyContactRelation:d.get("emergencyContactRelation"),
                      birthday:d.get("birthday"),
                      confirmDeactivate:!!deactivating,
                      phone: d.get("phone"),
                      defaultClassFee:!music&&kind==="coach"&&feeEnabled&&canEditFees&&(!person||defaultFeeDirty) ? (d.get("defaultClassFee") ? Number(d.get("defaultClassFee")) : null) : undefined,
                      contactEmail: kind === "coach" ? d.get("contactEmail") : undefined,
                      emergencyContactName: d.get("emergencyContactName"),
                      emergencyContactPhone: d.get("emergencyContactPhone"),
                      email:
                        kind === "manager"
                          ? d.get("email")
                          : undefined,
                      password:
                        kind === "manager"
                          ? d.get("password") || undefined
                          : undefined,
                      customerId:
                        coachEnabled
                          ? d.get("customerId") || undefined
                          : undefined,
                      active: d.get("active") === "yes",
                      memberEnabled:
                        coachEnabled
                          ? d.get("memberEnabled") === "yes"
                          : person?.memberEnabled ?? true,
                      financeTeacherIds:music&&kind==="manager"?financeTeacherIds:undefined,
                      permissions:
                        kind === "manager" ? permissions : undefined,
                      requestKey: key,
                    });
                    if (!r.success) {setError(r.error);setConflicts(r.conflicts ?? []);}
                    else {
                      setOpen(false);
                      router.refresh();
                    }
                  } catch {
                    setError("儲存失敗，請重試");
                  }
                });
              }}
            >
              <fieldset disabled={readOnly || pending} className="contents">
              <div data-staff-tab="basic" hidden={tab!=="basic"} className={tab==="basic" ? "grid grid-cols-1 gap-3 min-[400px]:grid-cols-2" : "hidden"}>
              {music ? <>
              <label className="col-span-full block">連結同一人（選填）
                <select className={field} aria-label="連結既有身分" value={linkedStaffId} onChange={e=>{setLinkedStaffId(e.target.value);setDirty(true);}}>
                  <option value="">不連結</option>
                  {counterpartChoices.filter(c=>!c.linked||c.id===person?.linkedStaffId).map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?`（${c.phone}）`:""}</option>)}
                </select>
                <span className="text-xs text-earth-500">請核對是本店同一人。登入、授課設定及後台權限仍各自獨立。</span>
              </label>
              {person?.linkedStaffId&&<p className="col-span-full text-sm text-primary-800">已連結：{person.linkedStaffName}。解除連結不會刪除身分或紀錄。</p>}
              <label className="block">
                姓名（必填）
                <input
                  className={field}
                  name="name"
                  key={`name:${linkedStaffId}`}
                  defaultValue={person?.name??selectedCounterpart?.name}
                  required
                />
              </label>
              <label className="block">
                身分
                <select
                  className={field}
                  value={kind}
                  disabled={!!person || !!accountKind}
                  onChange={(e) => {setKind(e.target.value as typeof kind);setCoachEnabled(e.target.value === "coach");}}
                >
                  <option value="coach">{music?"老師：前台我的工作":"教練：前台我的工作"}</option>
                  <option value="manager">店長：後台管理</option>
                </select>
              </label>
              {kind === "manager" && coachEnabled && <label className="col-span-full flex min-h-11 items-center gap-2"><input type="checkbox" checked={coachEnabled} onChange={e=>setCoachEnabled(e.target.checked)}/>舊資料兼任授課：交接後可關閉，往後請另建{music?"老師":"教練"}身分</label>}
              <label className="block">生日（選填）<input key={`birthday:${linkedStaffId}`} className={field} type="date" name="birthday" defaultValue={person?.birthday??selectedCounterpart?.birthday}/></label>
              {([
                ["phone", "電話"],
                ["emergencyContactName", "緊急聯絡人姓名"],
                ["emergencyContactPhone", "緊急聯絡人電話"],
                ["emergencyContactRelation", "緊急聯絡人關係"],
              ] as const).map(([name, label]) => <label className="block" key={name}>{label}{name!=="phone" ? (!person ? "（必填）" : !person[name] ? "（待補）" : "") : "（選填）"}<input key={`${name}:${linkedStaffId}`} className={field} name={name} type={name.endsWith("Phone") || name === "phone" ? "tel" : "text"} defaultValue={person?.[name]??selectedCounterpart?.[name]} required={!person && name!=="phone"} /></label>)}
              {kind==="coach"&&<><label className="block">Email（選填）<input className={field} name="contactEmail" type="email" defaultValue={person?.contactEmail}/></label><div className="self-end rounded-lg bg-earth-50 px-3 py-2 text-sm"><strong>系統通知</strong><span className="ml-2 text-earth-600">{person?.coachLoginReady?"已開啟":"連結 LINE 後自動開啟"}</span></div></>}
              <label className="block">
                狀態
                <select
                  className={field}
                  name="active"
                  defaultValue={person?.active === false ? "no" : "yes"}
                >
                  <option value="yes">啟用</option>
                  <option value="no">停用</option>
                </select>
              </label>
</> : <>
              <label className="block">
                姓名（必填）
                <input
                  className={field}
                  name="name"
                  key={`name:${linkedStaffId}`}
                  defaultValue={person?.name??selectedCounterpart?.name}
                  required
                />
              </label>
              <label className="block">
                身分
                <select
                  className={field}
                  value={kind}
                  disabled={!!person || !!accountKind}
                  onChange={(e) => {setKind(e.target.value as typeof kind);setCoachEnabled(e.target.value === "coach");}}
                >
                  <option value="coach">{music?"老師：前台我的工作":"教練：前台我的工作"}</option>
                  <option value="manager">店長：後台管理</option>
                </select>
              </label>
              {kind === "manager" && coachEnabled && <label className="col-span-full flex min-h-11 items-center gap-2"><input type="checkbox" checked={coachEnabled} onChange={e=>setCoachEnabled(e.target.checked)}/>舊資料兼任授課：交接後可關閉，往後請另建{music?"老師":"教練"}身分</label>}
              <label className="block">電話（選填）<input key={`phone:${linkedStaffId}`} className={field} name="phone" type="tel" defaultValue={person?.phone??selectedCounterpart?.phone}/></label>
              <details name="staff-basic-details" className="col-span-full" open={music||kind==="manager"?true:undefined}><summary className="min-h-11 cursor-pointer border-t border-earth-100 py-2 text-sm">更多資料{!music&&kind==="coach"?"（選填）":""}</summary><div className="grid gap-2 sm:grid-cols-2">              <label className="col-span-full block">連結同一人（選填）
                <select className={field} aria-label="連結既有身分" value={linkedStaffId} onChange={e=>{setLinkedStaffId(e.target.value);setDirty(true);}}>
                  <option value="">不連結</option>
                  {counterpartChoices.filter(c=>!c.linked||c.id===person?.linkedStaffId).map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?`（${c.phone}）`:""}</option>)}
                </select>
                <span className="text-xs text-earth-500">請核對是本店同一人。登入、授課設定及後台權限仍各自獨立。</span>
              </label>
              {person?.linkedStaffId&&<p className="col-span-full text-sm text-primary-800">已連結：{person.linkedStaffName}。解除連結不會刪除身分或紀錄。</p>}
              <label className="block">生日（選填）<input key={`birthday:${linkedStaffId}`} className={field} type="date" name="birthday" defaultValue={person?.birthday??selectedCounterpart?.birthday}/></label>
              {([

                ["emergencyContactName", "緊急聯絡人姓名"],
                ["emergencyContactPhone", "緊急聯絡人電話"],
                ["emergencyContactRelation", "緊急聯絡人關係"],
              ] as const).map(([name, label]) => <label className="block" key={name}>{label}{(music||kind==="manager") ? (!person ? "（必填）" : !person[name] ? "（待補）" : "") : "（選填）"}<input key={`${name}:${linkedStaffId}`} className={field} name={name} type={name.endsWith("Phone") ? "tel" : "text"} defaultValue={person?.[name]??selectedCounterpart?.[name]} required={!person && (music || kind==="manager")} /></label>)}
</div></details>
              {kind==="coach"&&<><label className="block">Email（選填）<input className={field} name="contactEmail" type="email" defaultValue={person?.contactEmail}/></label><div className="self-end rounded-lg bg-earth-50 px-3 py-2 text-sm"><strong>系統通知</strong><span className="ml-2 text-earth-600">{person?.coachLoginReady?"已開啟":"連結 LINE 後自動開啟"}</span></div></>}
              <label className="block">
                狀態
                <select
                  className={field}
                  name="active"
                  defaultValue={person?.active === false ? "no" : "yes"}
                >
                  <option value="yes">啟用</option>
                  <option value="no">停用</option>
                </select>
              </label>
</>}
              </div>
              <div data-staff-tab="qualifications" hidden={tab!=="qualifications" || !coachEnabled} className="space-y-3">
                <section className="space-y-2">

                  <h3 className="font-medium text-primary-900">{feeEnabled?"可教授課程與每堂授課費":"可教授課程"}</h3>
                  <p className="text-xs text-earth-500">套用新課次　ⓘ</p>
                  {!music && feeEnabled && canEditFees && <label className="block max-w-xs text-sm">預設授課費（元／堂）<input className={field} type="number" name="defaultClassFee" min="0" max="1000000" step="1" placeholder="未設定" defaultValue={person?.defaultClassFee??""} onChange={()=>{setDefaultFeeDirty(true);setTeachingDirty(true);}}/><span className="text-xs text-earth-500">課程留空沿用預設；全部留空為待核對，0 表示免費。</span></label>}

                  {person && !person.qualificationsConfirmed && <p className="rounded-lg bg-secondary-50 p-2 text-sm text-earth-700">舊資料待補：調整可教授課程後儲存即可；未調整時維持待補，既有課次保留。</p>}
                  {!music&&<div data-browse-control className="flex flex-wrap gap-2"><input className={`${field} min-w-0 flex-1`} aria-label="搜尋可教授課程" placeholder="搜尋課程名稱" value={qualificationSearch} onChange={e=>{setQualificationSearch(e.target.value);setQualificationPage(0);}}/>
                  <select className="min-h-11 rounded-xl border border-earth-200 px-2 text-sm" aria-label="授課課程篩選" value={qualificationScope} onChange={e=>{setQualificationScope(e.target.value);setQualificationPage(0);}}><option value="all">全部課程（{templates.length}）</option><option value="selected">已選（{qualificationIds.length}）</option></select></div>}
                  {!music&&<p className="text-sm text-earth-500">已選 {qualificationIds.length} 門課</p>}
                  {feeEnabled&&!feesReady ? <p role="status" className="rounded-lg bg-earth-50 p-3 text-sm">{feesError || "讀取授課設定中…"}{feesError && <button type="button" className={button} onClick={()=>{setFeesError("");setReloadFees(v=>v+1);}}>重試</button>}</p> : music && feeEnabled ? <MusicTeacherFeeEditor templates={templates} qualificationIds={qualificationIds} fees={fees} settings={musicSettings} readOnly={!canEditFees} qualificationReadOnly={!canManage} onSettings={v=>{setMusicSettings(v);setDirty(true);setTeachingDirty(true);}} onFees={v=>{setFees(v);setDirty(true);setTeachingDirty(true);}} onQualification={(id,selected)=>{setQualificationsTouched(true);setDirty(true);setTeachingDirty(true);setQualificationIds(ids=>selected?[...new Set([...ids,id])]:ids.filter(v=>v!==id));}}/> : <div className="rounded-xl border border-earth-200 divide-y divide-earth-100">
                    {matchingTemplates.slice(visibleQualificationPage*10,(visibleQualificationPage+1)*10).map(t => {
                      const selected = qualificationIds.includes(t.id);
                      return <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,9rem)] items-center gap-2 px-3 py-1">
                        <label className="flex min-h-11 min-w-0 items-center gap-3 break-words [overflow-wrap:anywhere]"><input className="h-4 w-4 shrink-0 accent-primary-700" type="checkbox" checked={selected} onChange={e=>{setQualificationsTouched(true);setQualificationIds(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id));}}/>{t.name}</label>

                        {selected && feeEnabled ? <label className="flex items-center gap-1"><input aria-label={`${t.name}每堂授課費`} className={`${field} min-w-0`} type="number" inputMode="decimal" min="0" max="1000000" step="0.01" placeholder="沿用預設" value={fees[t.id]?.value ?? ""} onChange={e=>setFees(old=>({...old,[t.id]:e.target.value?{mode:"CLASS",value:e.target.value,revision:old[t.id]?.revision??0}:{mode:"INHERIT",value:"",revision:old[t.id]?.revision??0}}))}/><span className="shrink-0 text-xs">元／堂</span></label> : <span className="text-center text-earth-400">—</span>}

                      </div>;
                    })}
                    {!matchingTemplates.length && <p className="p-3 text-sm text-earth-500">沒有符合的課程</p>}
                  </div>}
                  {!music&&qualificationPages>1 && <nav aria-label="授課設定分頁" className="flex flex-wrap items-center justify-end gap-2 text-sm"><span>第 {visibleQualificationPage+1}／{qualificationPages} 頁</span><button type="button" className={button} disabled={!visibleQualificationPage} onClick={()=>setQualificationPage(visibleQualificationPage-1)}>上一頁</button><button type="button" className={button} disabled={visibleQualificationPage+1>=qualificationPages} onClick={()=>setQualificationPage(visibleQualificationPage+1)}>下一頁</button></nav>}
                </section>
              </div>
              <div data-staff-tab="work" hidden={tab!=="work" || !coachEnabled} className="space-y-3">
                <h3 className="pt-2 font-medium text-primary-900">工作入口與會員連結</h3>
              {coachEnabled && (
                <label className="block">
                  連結既有顧客
                  <CourseCustomerPicker enabled={!readOnly && tab==="work"} name="customerId" initial={person?.customerId ? [{id:person.customerId,name:customers.find(c=>c.id===person.customerId)?.name??"已連結顧客"}] : []} onChange={()=>setDirty(true)}/>

                  <span className="text-xs text-earth-500">
                    授課人員工作入口使用已驗證的會員帳號，與店長後台登入分開。
                  </span>
                </label>
              )}
              {coachEnabled && (
                <label className="block">
                  連結後的前台身分
                  <select
                    className={field}
                    name="memberEnabled"
                    defaultValue={
                      person?.memberEnabled === false ? "no" : "yes"
                    }
                  >
                    <option value="yes">{music?"老師兼顧客：會員專區／我的工作":"教練兼顧客：會員專區／我的工作"}</option>
                    <option value="no">{music?"僅老師：我的工作":"僅教練：我的工作"}</option>
                  </select>
                  <span className="text-sm text-earth-500">
                    這是連結完成後的功能設定，不代表已開通登入。沿用固定帳號，不刪除顧客與歷史紀錄。
                  </span>
                </label>
              )}

                {person && coachEnabled && tab==="work" && <CourseStaffAvailabilityEditor staffId={person.id}/>}
                {person && person.assignments.length === 0 && <p className="text-sm text-earth-500">沒有未結束且未取消的課次。</p>}
                {person && person.assignments.length > 0 && <><CourseStaffAssignments items={person.assignments} label={person.active?"目前授課":"待交接課次"}/></>}
              </div>
              <div data-staff-tab="permissions" hidden={tab!=="permissions"} className="space-y-3">
                {music&&<fieldset className="space-y-2 rounded-lg border p-3"><legend className="text-sm font-medium">教師財務範圍</legend><select aria-label="教師財務範圍" className={field} value={financeTeacherIds===null?"all":"selected"} onChange={e=>{setFinanceTeacherIds(e.target.value==="all"?null:[]);setDirty(true);}}><option value="all" disabled={financeScope!==null}>全店教師</option><option value="selected">指定教師</option></select>{financeTeacherIds!==null&&<div className="flex flex-wrap gap-3">{teacherChoices.map(t=><label key={t.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={financeTeacherIds.includes(t.id)} onChange={e=>{setFinanceTeacherIds(ids=>e.target.checked?[...(ids??[]),t.id]:(ids??[]).filter(id=>id!==t.id));setDirty(true);}}/>{t.name}</label>)}</div>}<p className="rounded bg-earth-50 p-2 text-sm text-earth-700">目前可查看：{financeTeacherIds===null?"全店教師":financeTeacherIds.length?teacherChoices.filter(t=>financeTeacherIds.includes(t.id)).map(t=>t.name).join("、"):"尚未選擇教師"}。實際能查看或操作哪些資料，仍以下方拆帳／月結權限為準。</p>{financeTeacherIds!==null&&permissions.includes("teacher.settlement.confirm")&&<p role="alert" className="rounded bg-amber-50 p-2 text-sm text-amber-900">「確認全店月結」需要全店教師範圍；目前指定教師範圍只可查看授權教師，請改選全店或關閉該權限。</p>}</fieldset>}

              {kind === "manager" && (
                  <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
                    <label className="block text-sm">
                      登入信箱（必填）
                      <input
                        className={field}
                        name="email"
                        type="email"
                        defaultValue={person?.email}
                        required
                      />
                    </label>
                    <label className="block text-sm">
                      {person ? "重設密碼（留空保留原密碼）" : "登入密碼（必填，至少 8 字元）"}
                      <input
                        className={field}
                        name="password"
                        type="password"
                        minLength={8}
                        required={!person}
                        autoComplete="new-password"
                      />
                    </label>
                  </div>
              )}

              {kind === "manager" && (
                <section className="space-y-2">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-primary-800">店內管理權限</h3>
                      <p className="text-xs text-earth-500">已開啟 {permissions.length}／{allowedPermissionCodes.length} 項；分類預設收合，需要時再展開。</p>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" className="min-h-9 rounded-lg border border-earth-200 px-2 text-xs" onClick={()=>{setPermissions(allowedPermissionCodes);setDirty(true);}}>全部開啟</button>
                      <button type="button" className="min-h-9 rounded-lg border border-earth-200 px-2 text-xs" onClick={()=>{setPermissions([]);setDirty(true);}}>全部清除</button>
                    </div>
                  </div>
                  <input
                    className={`${field} !min-h-10 !py-1.5 text-sm`}
                    aria-label="搜尋權限"
                    placeholder="搜尋權限名稱"
                    value={permissionSearch}
                    onChange={(event)=>setPermissionSearch(event.target.value)}
                    data-browse-control
                  />
                  <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2">
                    {visiblePermissionGroups.map((g) => {
                      const groupCodes = g.codes.map((item) => item.code);
                      const selectedCount = groupCodes.filter((code) => permissions.includes(code)).length;
                      return (
                        <details key={g.label} open={permissionQuery ? true : undefined} className="rounded-lg border border-earth-200 bg-white px-3">
                          <summary className="cursor-pointer py-2 text-sm font-medium text-primary-800">
                            {g.label} <span className="font-normal text-earth-500">{selectedCount}／{g.codes.length}</span>
                          </summary>
                          <div className="border-t border-earth-100 pb-2 pt-1">
                            <div className="flex justify-end gap-1 pb-1">
                              <button type="button" className="rounded-md px-2 py-1 text-xs text-primary-800 hover:bg-primary-50" onClick={()=>{setPermissions((current)=>[...new Set([...current,...groupCodes])]);setDirty(true);}}>整組開啟</button>
                              <button type="button" className="rounded-md px-2 py-1 text-xs text-earth-600 hover:bg-earth-50" onClick={()=>{setPermissions((current)=>current.filter((code)=>!groupCodes.includes(code)));setDirty(true);}}>清除</button>
                            </div>
                            <div className="grid grid-cols-1 gap-x-2 min-[520px]:grid-cols-2">
                              {g.codes.map(({ code, label }) => (
                                <label key={code} className="flex min-h-9 items-center gap-2 rounded-md px-1 text-sm hover:bg-earth-50">
                                  <input
                                    className="h-4 w-4 shrink-0 accent-primary-700"
                                    type="checkbox"
                                    name="permission"
                                    value={code}
                                    checked={permissions.includes(code)}
                                    onChange={(event) => setPermissions((current) => event.target.checked ? [...new Set([...current, code])] : current.filter((value) => value !== code))}
                                  />
                                  <span className="min-w-0 leading-tight">{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                  {!visiblePermissionGroups.length && <p className="rounded-lg border border-dashed border-earth-200 p-3 text-center text-sm text-earth-500">找不到符合的權限</p>}
                </section>
              )}
              </div></fieldset>
            </form>
          </div>
          <footer className="shrink-0 border-t border-earth-200 bg-white px-4 py-3">
            {readOnly ? <button key="edit" type="button" className={button} disabled={!canManage} onClick={(event)=>{event.preventDefault();setReadOnly(false);}}>編輯資料</button> : <>
            <div className="flex gap-2"><button type="button" className={button} disabled={pending} onClick={close}>取消</button>
            <button
              form="course-staff-form"
              type="submit"
              className={`${button} min-w-0 flex-1 !border-primary-700 !bg-primary-700 !text-white`}
              disabled={pending || (teachingDirty && !feesReady) || (!!person && !dirty)}
            >
              {pending ? "儲存中…" : "儲存"}
            </button>
            </div>
            </>}
          </footer>
        </RightSheet>
      )}
    </>
  );
}
