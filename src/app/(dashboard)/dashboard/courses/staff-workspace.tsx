"use client";
import {CourseConflicts,type ConflictItem} from "@/components/admin/course-conflicts";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";

import { saveCourseStaff } from "@/server/actions/course-staff";
type Person = {
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
const field = "min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 py-2 text-base text-earth-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";
const button =
  "min-h-11 rounded-xl border border-earth-200 bg-white px-3 py-2 text-sm text-primary-800 hover:bg-primary-50 disabled:opacity-50";
export function CourseStaffWorkspace({
  staff,
  templates,
  customers,
  canManage,
  permissionGroups,
}: {
  staff: Person[];
  templates:{id:string;name:string}[];
  customers: { id: string; name: string }[];
  canManage: boolean;
  permissionGroups: {
    label: string;
    codes: { code: string; label: string }[];
  }[];
}) {
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
  const [qualificationsTouched,setQualificationsTouched]=useState(false);
  const [conflicts,setConflicts]=useState<ConflictItem[]>([]);
  const [tab,setTab]=useState("basic");
  const [readOnly,setReadOnly]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const rows = staff
    .filter(
      (s) =>
        `${s.name} ${s.phone} ${s.email}`.includes(search) &&
        (filter === "all" || s.active === (filter === "active")) &&
        (role === "all" || (role === "coach" ? s.coachEnabled : role === "both" ? s.kind === "manager" && s.coachEnabled : s.kind === role)),
    )
    .sort((a, b) => Number(b.active) - Number(a.active));
  function edit(p: Person | null) {
    setDirty(false);
    setPerson(p);setCoachEnabled(p?.coachEnabled ?? true);setQualificationIds(p?.qualificationIds ?? []);setQualificationSearch("");setQualificationsTouched(false);setConflicts([]);setTab("basic");setReadOnly(!!p);
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
          onChange={(e) => setSearch(e.target.value)}
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
          onChange={(e) => setFilter(e.target.value)}
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
            {rows.map((p) => (
              <tr
                key={p.id}
                className={p.active ? "" : "text-earth-400 bg-earth-50"}
              >
                <td className="p-3">{p.name}{(!p.emergencyContactName || !p.emergencyContactPhone || !p.emergencyContactRelation) && <span className="block text-xs text-amber-800">緊急聯絡待補</span>}{!p.active && p.assignments.length>0 && <span className="block text-amber-800">{p.assignments.length} 堂待交接</span>}</td>
                <td className="p-3">
                  {identity(p)}
                </td>
                <td className="p-3">
                  {p.kind === "manager"
                    ? p.email
                    : (customers.find((c) => c.id === p.customerId)?.name ??
                      "尚未連結會員帳號")}
                </td>
                <td className="p-3">{p.active ? "啟用" : "停用"}</td>
                <td className="p-3">
                  <button className={button} onClick={() => edit(p)}>查看</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <RightSheet
          compact
          open
          onClose={close}
          width={520}
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
          <nav className="flex flex-wrap gap-2 border-b border-earth-200 px-4 py-2">{[["basic","基本資料"],...(coachEnabled?[["qualifications","授課與工作"]]:[]),...(kind==="manager"?[["permissions","後台帳號／權限"]]:[])].map(([id,label])=><button key={id} type="button" className={`${button} ${tab===id ? "!border-primary-300 !bg-primary-50 font-medium !text-primary-900" : ""}`} onClick={()=>setTab(id)} aria-pressed={tab===id}>{label}</button>)}</nav>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <CourseConflicts items={conflicts}/>
            {error && (
              <p role="alert" className="mb-3 text-red-700">
                {error}
              </p>
            )}
            {readOnly && person && <section className="space-y-3">
              {tab === "basic" && <dl className="divide-y divide-earth-100">{[["姓名",person.name],["身分",identity(person)],["電話",person.phone || "未填"],["生日",person.birthday || "未填（選填）"],["緊急聯絡",[person.emergencyContactName,person.emergencyContactRelation,person.emergencyContactPhone].filter(Boolean).join("／") || "待補"],["狀態",person.active ? "啟用":"停用"]].map(([label,value])=><div key={label} className="grid grid-cols-[6rem_1fr] gap-3 py-3"><dt className="text-earth-500">{label}</dt><dd>{value}</dd></div>)}</dl>}
              {tab === "qualifications" && <><h3 className="font-medium">可教授課程</h3><p>{templates.filter(t=>qualificationIds.includes(t.id)).map(t=>t.name).join("、") || "尚未設定"}</p><h3 className="pt-3 font-medium">前台工作／會員連結</h3><p>{person.customerId ? customers.find(c=>c.id===person.customerId)?.name ?? "已連結會員" : "尚未連結 · 我的工作尚不可使用"}</p>{person.customerId && <p>{person.memberEnabled ? "會員專區／我的工作":"僅我的工作"}</p>}{person.assignments.length ? <CourseConflicts items={person.assignments} label={person.active?"目前授課":"待交接課次"}/> : <p className="pt-3 text-earth-500">沒有未結束且未取消的課次。</p>}</>}
              {tab === "permissions" && <><h3 className="font-medium">後台登入</h3><p>{person.email}</p><h3 className="pt-3 font-medium">店內管理權限</h3>{permissionGroups.map(g=><details key={g.label}><summary className="min-h-11 cursor-pointer py-3">{g.label} · {g.codes.filter(c=>permissions.includes(c.code)).length} 項</summary><p>{g.codes.filter(c=>permissions.includes(c.code)).map(c=>c.label).join("、") || "未開啟"}</p></details>)}</>}
            </section>}
            <form
              id="course-staff-form"
              noValidate
              hidden={readOnly}
              onInvalidCapture={(e)=>{const group=(e.target as HTMLElement).closest<HTMLElement>("[data-staff-tab]");if(group)setTab(group.dataset.staffTab!);}}
              onChangeCapture={()=>setDirty(true)}
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const invalid=e.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement>("input:invalid,select:invalid,textarea:invalid");
                if(invalid){const group=invalid.closest<HTMLElement>("[data-staff-tab]");if(group)setTab(group.dataset.staffTab!);requestAnimationFrame(()=>invalid.reportValidity());return;}
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
              <fieldset disabled={readOnly} className="contents">
              <div data-staff-tab="basic" hidden={tab!=="basic"} className={tab==="basic" ? "grid grid-cols-1 gap-3 min-[400px]:grid-cols-2" : "hidden"}>
              <label className="block">
                姓名
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
              ] as const).map(([name, label]) => <label className="block" key={name}>{label}<input className={field} name={name} type={name.endsWith("Phone") || name === "phone" ? "tel" : "text"} defaultValue={person?.[name]} required={!person && name!=="phone"} /></label>)}
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
                  <h3 className="font-medium text-primary-900">可教授課程</h3>
                  <p className="text-sm text-earth-600">選擇這位教練可以教授的課程，排課時依此篩選。</p>
                  {person && !person.qualificationsConfirmed && <p className="rounded-lg bg-secondary-50 p-2 text-sm text-earth-700">舊資料待補：調整可教授課程後儲存即可；未調整時維持待補，既有課次保留。</p>}
                  <input className={field} aria-label="搜尋可教授課程" placeholder="搜尋課程名稱" value={qualificationSearch} onChange={e=>setQualificationSearch(e.target.value)}/>
                  <p className="text-sm text-earth-500">已選 {qualificationIds.length} 項</p>
                  <div className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-earth-200 divide-y divide-earth-100">
                    {templates.filter(t=>t.name.includes(qualificationSearch.trim())).map(t=><label key={t.id} className={`flex min-h-11 items-center gap-3 px-3 py-2 ${qualificationIds.includes(t.id)?"bg-primary-50 text-primary-900":""}`}><input className="h-4 w-4 accent-primary-700" type="checkbox" checked={qualificationIds.includes(t.id)} onChange={e=>{setQualificationsTouched(true);setQualificationIds(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id));}}/>{t.name}</label>)}
                    {!templates.some(t=>t.name.includes(qualificationSearch.trim())) && <p className="p-3 text-sm text-earth-500">沒有符合的課程</p>}
                  </div>
                </section>
                <h3 className="pt-2 font-medium text-primary-900">工作入口與會員連結</h3>
              {coachEnabled && (
                <label className="block">
                  連結既有顧客
                  <select
                    className={field}
                    name="customerId"
                    defaultValue={person?.customerId}
                  >
                    <option value="">尚未連結（工作入口不可使用）</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-earth-500">
                    教練工作入口使用已驗證的會員帳號，與店長後台登入分開。
                  </span>
                </label>
              )}
              {coachEnabled && (
                <label className="block">
                  前台身分
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
                    沿用同一個固定帳號。切換身分不刪除顧客與歷史紀錄。
                  </span>
                </label>
              )}

                {person && person.assignments.length === 0 && <p className="text-sm text-earth-500">沒有未結束且未取消的課次。</p>}
                {person && person.assignments.length > 0 && <><h3>{person.active?"目前授課":"待交接課次"}</h3><CourseConflicts items={person.assignments} label={person.active?"目前授課":"待交接課次"}/></>}
              </div>
              <div data-staff-tab="permissions" hidden={tab!=="permissions"}>
              {kind === "manager" && (
                  <>
                    <label className="block">
                      登入信箱
                      <input
                        className={field}
                        name="email"
                        type="email"
                        defaultValue={person?.email}
                        required
                      />
                    </label>
                    <label className="block">
                      {person ? "重設密碼（留空保留原密碼）" : "登入密碼"}
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
            {readOnly ? <button key="edit" type="button" className={button} disabled={!canManage} onClick={(event)=>{event.preventDefault();setReadOnly(false);}}>編輯資料</button> : <>
            <button
              form="course-staff-form"
              type="submit"
              className={`${button} w-full !border-primary-700 !bg-primary-700 !text-white`}
              disabled={pending}
            >
              儲存人員
            </button>
            </>}
          </footer>
        </RightSheet>
      )}
    </>
  );
}
