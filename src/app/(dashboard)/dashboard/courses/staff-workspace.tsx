"use client";
import {CourseStaffAssignments} from "@/components/admin/course-staff-assignments";
import {CourseCustomerPicker} from "@/components/admin/course-customer-picker";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";
import {CourseConflicts,type ConflictItem} from "@/components/admin/course-conflicts";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";

import { readCourseStaffTeaching, saveCourseStaff } from "@/server/actions/course-staff";
type Person = {
  updatedAt?: string;
  coachLoginReady:boolean;
  coachEnabled:boolean;
  qualificationIds:string[];
  qualificationsConfirmed:boolean;
  birthday:string;
  emergencyContactRelation:string;
  assignments:ConflictItem[];
  id: string;
  name: string;
  kind: "manager" | "coach";
  email: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  active: boolean;
  memberEnabled: boolean;
  permissions: string[];
  customerId: string;
};
function identity(p: Pick<Person,"kind"|"coachEnabled"|"memberEnabled"|"customerId">) {
  return p.kind === "manager" ? (p.coachEnabled ? "店長兼教練":"店長") : !p.coachEnabled ? "未啟用工作身分" : p.memberEnabled && p.customerId ? "教練兼顧客":"教練";
}
const field = "min-h-11 min-w-0 max-w-full w-full rounded-xl border border-earth-200 bg-white px-3 py-2 text-base text-earth-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";
const button =
  "min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-earth-200 bg-white px-3 py-2 text-sm text-primary-800 hover:bg-primary-50 disabled:opacity-50";
export function CourseStaffWorkspace({
  staff,
  maxStaff,
  templates,
  customers,
  canManage,
  permissionGroups,
}: {
  staff: Person[];
  maxStaff: number | null;
  templates:{id:string;name:string}[];
  customers: { id: string; name: string }[];
  canManage: boolean;
  permissionGroups: {
    label: string;
    codes: { code: string; label: string }[];
  }[];
}) {
  const [staffPage,setStaffPage]=useState(0);
  const [selected,setSelected]=useState<string[]>([]);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [role, setRole] = useState("all"),
    [open, setOpen] = useState(false),
    [person, setPerson] = useState<Person | null>(null),
    [kind, setKind] = useState<"coach" | "manager">("coach"),
    [error, setError] = useState(""),
    [key, setKey] = useState("");
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
  const [fees,setFees]=useState<Record<string,{value:string;revision:number}>>({});
  const [teachingVersion,setTeachingVersion]=useState<string>();
  const [feesReady,setFeesReady]=useState(false);
  const [feesError,setFeesError]=useState("");
  const [reloadFees,setReloadFees]=useState(0);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!open || !person || !canManage) return;
    let active = true;
    readCourseStaffTeaching(person.id).then(result => {
      if (!active) return;
      if (!result.success) { setFeesError(result.error); return; }
      if (person.updatedAt && result.version !== person.updatedAt) { setFeesError("人員資料已變更，請關閉並重新整理頁面後再編輯。"); return; }
      setFees(Object.fromEntries(result.fees.map(f => [f.templateId, {
        value: f.rules.length === 1 && f.rules[0].mode === "CLASS" ? String(f.rules[0].value) : "",
        revision: f.revision,
      }])));
      setTeachingVersion(result.version);
      setQualificationIds(result.qualificationIds);
      setFeesReady(true);
    }).catch(() => { if (active) setFeesError("授課費讀取失敗，請重試；尚未覆蓋原設定。"); });
    return () => { active = false; };
  }, [open, person, canManage, reloadFees]);
  const activeCount = staff.filter(p => p.active).length;
  const atLimit = maxStaff !== null && activeCount >= maxStaff;
  const rows = staff
    .filter(
      (s) =>
        `${s.name} ${s.phone} ${s.email}`.includes(search) &&
        (filter === "all" || s.active === (filter === "active")) &&
        (role === "all" || (role === "coach" ? s.coachEnabled : role === "both" ? s.kind === "manager" && s.coachEnabled : s.kind === role)),
    )
    .sort((a, b) => Number(b.active) - Number(a.active));
  const staffPages=Math.max(1,Math.ceil(rows.length/20));
  const currentStaffPage=Math.min(staffPage,staffPages-1);
  function edit(p: Person | null) {
    setDirty(false);setFees({});setTeachingVersion(undefined);setFeesReady(!p);setFeesError("");
    setPerson(p);setCoachEnabled(p?.coachEnabled ?? true);setQualificationIds(p?.qualificationIds ?? []);setQualificationSearch("");setQualificationScope("all");setQualificationPage(0);setQualificationsTouched(false);setConflicts([]);setTab("basic");setReadOnly(!canManage);
    setPermissions(p?.permissions ?? permissionGroups.flatMap((g) => g.codes.map((c) => c.code)));
    setKind(p?.kind ?? "coach");
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
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className={`${field} max-w-xs`}
          aria-label="搜尋人員"
          placeholder="搜尋姓名／電話／信箱"
          value={search}
          onChange={(e) => {setSearch(e.target.value);setStaffPage(0);}}
        />
        <select
          className={button}
          aria-label="人員角色"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="all">全部角色</option>
          <option value="manager">店長</option>
          <option value="coach">教練</option><option value="both">店長兼教練</option>
        </select>
        <select
          className={button}
          aria-label="人員狀態"
          value={filter}
          onChange={(e) => {setFilter(e.target.value);setStaffPage(0);}}
        >
          <option value="all">全部狀態</option>
          <option value="active">啟用</option>
          <option value="inactive">停用</option>
        </select>
        {canManage && (
          <button className={button} onClick={() => edit(null)}>
            新增人員
          </button>
        )}
      </div>
      {canManage && atLimit && <p className="mb-3 text-sm text-amber-800">啟用人員已達上限（{activeCount}／{maxStaff}）。可建立停用人員；啟用時須有剩餘名額。同一人兼任只計一位。</p>}
      {canManage && <CourseBatchBar canDelete={canManage} names={Object.fromEntries(rows.map(p=>[p.id,p.name]))} kind="staff" ids={rows.map(p=>p.id)} selected={selected} onChange={setSelected}/>}
      <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["姓名", "身分", "登入／連結", "狀態", "操作"].map((t) => (
                <th key={t} className="p-3">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100">
            {rows.slice(currentStaffPage*20,(currentStaffPage+1)*20).map((p) => (
              <tr
                key={p.id}
                className={p.active ? "" : "text-earth-400 bg-earth-50"}
              >
                <td className="p-3">{canManage && <input type="checkbox" aria-label={`選取 ${p.name}`} className="mr-3" checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>} {p.name}{(!p.emergencyContactName || !p.emergencyContactPhone || !p.emergencyContactRelation) && <span className="block text-xs text-amber-800">緊急聯絡待補</span>}{!p.active && p.assignments.length>0 && <span className="block text-amber-800">{p.assignments.length} 堂待交接</span>}</td>
                <td className="p-3">
                  {identity(p)}{p.coachEnabled && <span className="block text-xs text-earth-600">{p.qualificationsConfirmed && p.qualificationIds.length ? "已設定可教授課程" : "授課設定待補"}；{p.coachLoginReady ? "已開通教練登入" : "尚未開通教練登入"}</span>}
                </td>
                <td className="p-3">
                  {p.kind === "manager"
                    ? p.email
                    : (customers.find((c) => c.id === p.customerId)?.name ??
                      "尚未連結會員帳號")}
                </td>
                <td className="p-3">{p.active ? "啟用" : "停用"}</td>
                <td className="p-3">
                  <button className={button} onClick={() => edit(p)}>{canManage ? "編輯" : "查看"}</button>
                  {canManage && p.coachEnabled && <button className={`${button} ml-2`} onClick={() => { edit(p); setTab("qualifications"); }}>授課設定</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {staffPages>1 && <nav aria-label="人員分頁" className="mt-3 flex flex-wrap items-center justify-end gap-3 text-sm"><span>共 {rows.length} 人 · 第 {currentStaffPage+1}／{staffPages} 頁</span><button className={button} disabled={!currentStaffPage} onClick={()=>setStaffPage(currentStaffPage-1)}>上一頁</button><button className={button} disabled={currentStaffPage+1>=staffPages} onClick={()=>setStaffPage(currentStaffPage+1)}>下一頁</button></nav>}
      {open && (
        <RightSheet
          compact
          open
          onClose={close}
          width={640}
          labelledById="course-staff-title"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2">
            <h2 id="course-staff-title" className="font-semibold">
              {person ? (readOnly ? "查看人員":"編輯人員") : "新增人員"}
            </h2>
            <button
              className={button}
              disabled={pending}
              onClick={close}
            >
              關閉
            </button>
          </header>
          <nav className="flex flex-wrap gap-2 border-b border-earth-200 px-4 py-2">{[["basic","基本資料"],...(coachEnabled?[["qualifications","授課費設定"],["work","工作與授課安排"]]:[]),...(kind==="manager"?[["permissions","後台帳號／權限"]]:[])].map(([id,label])=><button key={id} type="button" className={`${button} ${tab===id ? "!border-primary-300 !bg-primary-50 font-medium !text-primary-900" : ""}`} onClick={()=>setTab(id)} aria-pressed={tab===id}>{label}</button>)}</nav>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {!person && <p className={`mb-3 text-sm ${atLimit ? "text-amber-800" : "text-earth-600"}`}>啟用人員 {activeCount}／{maxStaff ?? "不限"}。{atLimit ? "啟用人員已達上限，可選停用建立；日後啟用仍須檢查額度。" : "同一人兼任店長與教練只計一位。"}</p>}
            <CourseConflicts items={conflicts}/>
            {error && (
              <p role="alert" className="mb-3 text-red-700">
                {error}
              </p>
            )}
            {readOnly && person && <section className="space-y-3">
              {tab === "basic" && <dl className="divide-y divide-earth-100">{[["姓名",person.name],["身分",identity(person)],["電話",person.phone || "未填"],["生日",person.birthday || "未填（選填）"],["緊急聯絡",[person.emergencyContactName || "姓名待補",person.emergencyContactRelation || "關係待補",person.emergencyContactPhone || "電話待補"].join("／")],["狀態",person.active ? "啟用":"停用"]].map(([label,value])=><div key={label} className="grid grid-cols-[6rem_1fr] gap-3 py-3"><dt className="text-earth-500">{label}</dt><dd>{value}</dd></div>)}</dl>}
              {(tab === "qualifications" || tab === "work") && <><h3 className="font-medium">授課設定狀態</h3><p>{person.qualificationsConfirmed && qualificationIds.length ? "已設定可教授課程" : "授課設定待補"}</p><h3 className="font-medium">可教授課程</h3><p>{templates.filter(t=>qualificationIds.includes(t.id)).map(t=>t.name).join("、") || "尚未設定"}</p><h3 className="pt-3 font-medium">教練登入狀態</h3><p>{person.coachLoginReady ? "已開通教練登入" : "尚未開通教練登入"}</p>{!person.coachLoginReady && <p className="text-sm text-earth-600">先由教練完成本店會員登入，再編輯此頁「連結既有顧客」並儲存。授課設定與登入分開，不影響店長依資格排課。</p>}<h3 className="pt-3 font-medium">會員連結</h3><p>{person.customerId ? customers.find(c=>c.id===person.customerId)?.name ?? "已連結會員" : "尚未連結 · 我的工作尚不可使用"}</p>{person.customerId && <p>{person.memberEnabled ? "會員專區／我的工作":"僅我的工作"}</p>}{person.assignments.length ? <CourseStaffAssignments items={person.assignments} label={person.active?"目前授課":"待交接課次"}/> : <p className="pt-3 text-earth-500">沒有未結束且未取消的課次。</p>}</>}
              {tab === "permissions" && <><h3 className="font-medium">後台登入</h3><p>{person.email}</p><h3 className="pt-3 font-medium">店內管理權限</h3>{permissionGroups.map(g=><details key={g.label}><summary className="min-h-11 cursor-pointer py-3">{g.label} · {g.codes.filter(c=>permissions.includes(c.code)).length} 項</summary><p>{g.codes.filter(c=>permissions.includes(c.code)).map(c=>c.label).join("、") || "未開啟"}</p></details>)}</>}
            </section>}
            <form
              id="course-staff-form"
              noValidate
              hidden={readOnly}
              onInvalidCapture={(e)=>{const group=(e.target as HTMLElement).closest<HTMLElement>("[data-staff-tab]");if(group)setTab(group.dataset.staffTab!);}}
              onChangeCapture={e=>{if(!(e.target as HTMLElement).closest("[data-browse-control]"))setDirty(true);}}
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (pending || !feesReady) return;
                const invalidFee=coachEnabled ? qualificationIds.find(id=>{const raw=fees[id]?.value??"0";const value=Number(raw);return !raw.trim() || !Number.isFinite(value) || value<0 || value>1000000 || Math.abs(value*100-Math.round(value*100))>0.000001;}) : undefined;
                if(invalidFee){setTab("qualifications");setQualificationSearch("");setQualificationScope("all");setQualificationPage(Math.max(0,Math.floor(templates.findIndex(t=>t.id===invalidFee)/10)));setError(`請填寫「${templates.find(t=>t.id===invalidFee)?.name??"課程"}」的每堂授課費（0 至 1,000,000 元，最多兩位小數）。`);return;}
                const invalid=e.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement>("input:invalid,select:invalid,textarea:invalid");
                if(invalid){const group=invalid.closest<HTMLElement>("[data-staff-tab]");if(group)setTab(group.dataset.staffTab!);setQualificationSearch("");requestAnimationFrame(()=>invalid.reportValidity());return;}
                const d = new FormData(e.currentTarget);
                const deactivating=person?.active && d.get("active")==="no";
                if(deactivating && !window.confirm(`確認停用？立即撤銷所有工作存取，${person.assignments.length} 堂未結束課次保留待交接；會員與歷史不變。`)) return;
                start(async () => {
                  try {
                    const r = await saveCourseStaff({
                      id: person?.id,
                      name: d.get("name"),
                      kind,
                      coachEnabled,
                      qualificationIds: coachEnabled ? qualificationIds : person?.qualificationIds ?? [],
                      qualificationsConfirmed: coachEnabled ? (!person || person.qualificationsConfirmed || qualificationsTouched) : person?.qualificationsConfirmed ?? false,
                      teachingVersion,
                      teachingFees: coachEnabled ? qualificationIds.map(templateId => ({templateId, value: {mode: "CLASS", value: Number(fees[templateId]?.value ?? "0")}, revision: fees[templateId]?.revision ?? 0})) : undefined,
                      emergencyContactRelation:d.get("emergencyContactRelation"),
                      birthday:d.get("birthday"),
                      confirmDeactivate:!!deactivating,
                      phone: d.get("phone"),
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
              <fieldset disabled={readOnly || pending || !feesReady} className="contents">
              <div data-staff-tab="basic" hidden={tab!=="basic"} className={tab==="basic" ? "grid grid-cols-1 gap-3 min-[400px]:grid-cols-2" : "hidden"}>
              <label className="block">
                姓名（必填）
                <input
                  className={field}
                  name="name"
                  defaultValue={person?.name}
                  required
                />
              </label>
              <label className="block">
                身分
                <select
                  className={field}
                  value={kind}
                  disabled={!!person}
                  onChange={(e) => {setKind(e.target.value as typeof kind);setCoachEnabled(e.target.value === "coach");}}
                >
                  <option value="coach">教練：前台我的工作</option>
                  <option value="manager">店長：後台管理</option>
                </select>
              </label>
              {kind === "manager" && <label className="col-span-full flex min-h-11 items-center gap-2"><input type="checkbox" checked={coachEnabled} onChange={e=>setCoachEnabled(e.target.checked)}/>兼任教練</label>}
              <label className="block">生日（選填）<input className={field} type="date" name="birthday" defaultValue={person?.birthday}/></label>
              {([
                ["phone", "電話"],
                ["emergencyContactName", "緊急聯絡人姓名"],
                ["emergencyContactPhone", "緊急聯絡人電話"],
                ["emergencyContactRelation", "緊急聯絡人關係"],
              ] as const).map(([name, label]) => <label className="block" key={name}>{label}{name!=="phone" ? (!person ? "（必填）" : !person[name] ? "（待補）" : "") : "（選填）"}<input className={field} name={name} type={name.endsWith("Phone") || name === "phone" ? "tel" : "text"} defaultValue={person?.[name]} required={!person && name!=="phone"} /></label>)}
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
              </div>
              <div data-staff-tab="qualifications" hidden={tab!=="qualifications" || !coachEnabled} className="space-y-3">
                <section className="space-y-2">
                  <h3 className="font-medium text-primary-900">可教授課程與每堂授課費</h3>
                  <p className="text-sm text-earth-600">勾選可教授課程並填費用，最後一次儲存。0 元表示不另計；每堂計一次，變更適用新排課，既有課次不變。</p>
                  {person && !person.qualificationsConfirmed && <p className="rounded-lg bg-secondary-50 p-2 text-sm text-earth-700">舊資料待補：調整可教授課程後儲存即可；未調整時維持待補，既有課次保留。</p>}
                  <div data-browse-control className="flex flex-wrap gap-2"><input className={`${field} min-w-0 flex-1`} aria-label="搜尋可教授課程" placeholder="搜尋課程名稱" value={qualificationSearch} onChange={e=>{setQualificationSearch(e.target.value);setQualificationPage(0);}}/>
                  <select className="min-h-11 rounded-xl border border-earth-200 px-2 text-sm" aria-label="授課課程篩選" value={qualificationScope} onChange={e=>{setQualificationScope(e.target.value);setQualificationPage(0);}}><option value="all">全部課程（{templates.length}）</option><option value="selected">已選（{qualificationIds.length}）</option></select></div>
                  <p className="text-sm text-earth-500">已選 {qualificationIds.length} 項 · 篩選及換頁會保留未儲存的費用</p>
                  <div className="rounded-xl border border-earth-200 divide-y divide-earth-100">
                    {matchingTemplates.slice(visibleQualificationPage*10,(visibleQualificationPage+1)*10).map(t => {
                      const selected = qualificationIds.includes(t.id);
                      return <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 px-3 py-2">
                        <label className="flex min-h-11 min-w-0 items-center gap-3 break-words [overflow-wrap:anywhere]"><input className="h-4 w-4 shrink-0 accent-primary-700" type="checkbox" checked={selected} onChange={e=>{setQualificationsTouched(true);setQualificationIds(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id));}}/>{t.name}</label>
                        {selected ? <label className="flex items-center gap-1"><input aria-label={`${t.name}每堂授課費`} className={`${field} min-w-0`} type="number" inputMode="decimal" min="0" max="1000000" step="0.01" required value={fees[t.id]?.value ?? "0"} onChange={e=>setFees(old=>({...old,[t.id]:{value:e.target.value,revision:old[t.id]?.revision??0}}))}/><span className="shrink-0 text-xs">元／堂</span></label> : <span className="text-center text-earth-400">—</span>}
                      </div>;
                    })}
                    {!matchingTemplates.length && <p className="p-3 text-sm text-earth-500">沒有符合的課程</p>}
                  </div>
                  {qualificationPages>1 && <nav aria-label="授課設定分頁" className="flex flex-wrap items-center justify-end gap-2 text-sm"><span>第 {visibleQualificationPage+1}／{qualificationPages} 頁</span><button type="button" className={button} disabled={!visibleQualificationPage} onClick={()=>setQualificationPage(visibleQualificationPage-1)}>上一頁</button><button type="button" className={button} disabled={visibleQualificationPage+1>=qualificationPages} onClick={()=>setQualificationPage(visibleQualificationPage+1)}>下一頁</button></nav>}
                </section>
              </div>
              <div data-staff-tab="work" hidden={tab!=="work" || !coachEnabled} className="space-y-3">
                <h3 className="pt-2 font-medium text-primary-900">工作入口與會員連結</h3>
              {coachEnabled && (
                <label className="block">
                  連結既有顧客
                  <CourseCustomerPicker enabled={!readOnly && tab==="work"} name="customerId" initial={person?.customerId ? [{id:person.customerId,name:customers.find(c=>c.id===person.customerId)?.name??"已連結顧客"}] : []} onChange={()=>setDirty(true)}/>

                  <span className="text-xs text-earth-500">
                    教練工作入口使用已驗證的會員帳號，與店長後台登入分開。
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
                    <option value="yes">教練兼顧客：會員專區／我的工作</option>
                    <option value="no">僅教練：我的工作</option>
                  </select>
                  <span className="text-sm text-earth-500">
                    這是連結完成後的功能設定，不代表已開通登入。沿用固定帳號，不刪除顧客與歷史紀錄。
                  </span>
                </label>
              )}

                {person && person.assignments.length === 0 && <p className="text-sm text-earth-500">沒有未結束且未取消的課次。</p>}
                {person && person.assignments.length > 0 && <><CourseStaffAssignments items={person.assignments} label={person.active?"目前授課":"待交接課次"}/></>}
              </div>
              <div data-staff-tab="permissions" hidden={tab!=="permissions"}>
              {kind === "manager" && (
                  <>
                    <label className="block">
                      登入信箱（必填）
                      <input
                        className={field}
                        name="email"
                        type="email"
                        defaultValue={person?.email}
                        required
                      />
                    </label>
                    <label className="block">
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
                  </>
              )}

              {kind === "manager" && (
                <section>
                  <h3 className="font-semibold text-primary-800">店內管理權限 · 已開啟 {permissions.length} 項</h3>
                  {permissionGroups.map((g) => (
                    <details key={g.label} className="mt-2 rounded-lg border border-earth-200 px-3">
                      <summary className="cursor-pointer py-3 font-medium text-primary-800">{g.label} · {g.codes.filter((c) => permissions.includes(c.code)).length}／{g.codes.length} 已開啟</summary>
                      {g.codes.map(({ code, label }) => (
                        <label
                          key={code}
                          className="flex min-h-11 items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="permission"
                            value={code}
                            checked={permissions.includes(code)}
                            onChange={(e) => setPermissions((p) => e.target.checked ? [...p, code] : p.filter((v) => v !== code))}
                          />
                          {label}
                        </label>
                      ))}
                    </details>
                  ))}
                </section>
              )}
              </div></fieldset>
            </form>
          </div>
          <footer className="shrink-0 border-t border-earth-200 bg-white px-4 py-3">
            {canManage && !feesReady && <p role="status" className="mb-2 text-sm">{feesError || "讀取授課設定中…"}{feesError && <button type="button" className={button} onClick={()=>{setFeesError("");setReloadFees(v=>v+1);}}>重試</button>}</p>}
            {readOnly ? <button key="edit" type="button" className={button} disabled={!canManage} onClick={(event)=>{event.preventDefault();setReadOnly(false);}}>編輯資料</button> : <>
            <div className="flex gap-2"><button type="button" className={button} disabled={pending} onClick={close}>取消</button>
            <button
              form="course-staff-form"
              type="submit"
              className={`${button} min-w-0 flex-1 !border-primary-700 !bg-primary-700 !text-white`}
              disabled={pending || !feesReady || (!!person && !dirty)}
            >
              {pending ? "儲存中…" : "儲存變更"}
            </button>
            </div>
            </>}
          </footer>
        </RightSheet>
      )}
    </>
  );
}
