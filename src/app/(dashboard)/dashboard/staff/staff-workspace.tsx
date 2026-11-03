"use client";
import {RightSheet} from "@/components/admin/right-sheet";
import {CourseStaffList} from "../courses/staff-list";
import { createPortal } from "react-dom";

import styles from "@/components/admin/management-layout.module.css";
import { StaffAccountEditor, emptyStaffAccountPolicy, type StaffAccountPolicy } from "./staff-account-editor";
import { createContext, useContext, useMemo, useRef, useState } from "react";

import { SubmitButton } from "@/components/submit-button";

import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { StaffStatusToggle } from "./staff-status-toggle";

import { useConfirmedSettingsRows } from "@/components/admin/use-confirmed-settings-rows";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { savedStaffPerson } from "@/lib/staff-settings-save";
import { usePathname } from "next/navigation";
const StaffSaveGuardContext=createContext({pending:false,uncertain:false,error:""});

type Availability = { dayOfWeek: number; startTime: string; endTime: string };
type ScheduleException = {
  date: string;
  label: string;
  tone: "leave" | "extra";
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
};

export type StaffWorkspacePerson = {
  id: string;
  updatedAt?:string;
  userId: string;
  role?: string;
  permissions?: string[];
  displayName: string;
  legalName: string;
  roleLabel: string;
  email: string;
  phone: string | null;
  colorCode: string;
  status: string;
  customerCount: number;
  specialties: string;
  specialtyKeys: readonly string[];
  emergencyContact: { name: string; relation: string; phone: string } | null;
  weeklyAvailability: readonly Availability[];
  scheduleExceptions: readonly ScheduleException[];
  canEdit: boolean;
  canResetPassword: boolean;
  compensationMode: "PERCENTAGE" | "FIXED" | null;
  compensationValue: number | null;
};

type Editor =
  | { type: "details"; personId: string }
  | { type: "setup"; personId: string }
  | { type: "specialties"; personId: string }
  | { type: "schedule"; personId: string }
  | { type: "compensation"; personId: string }
  | { type: "exception"; personId?: string }
  | { type: "create" }
  | null;

Array.from({ length: 25 }, (_, index) => {
  const totalMinutes = 9 * 60 + index * 30;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
});
const inputClass =
  "mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200";

export function StaffWorkspace({
  storeId,
  accountPolicy = emptyStaffAccountPolicy,
  accountListOnly = false,
  beauty = false,
  showSteamfootRent = false,
  people: initialPeople,
  today,
  canManage,
  canAssignRoles = false,
  showSpaCompensation,
  createAction,
}: {
  storeId?:string;
  accountPolicy?: StaffAccountPolicy;
  people: readonly StaffWorkspacePerson[];
  today: string;
  canManage: boolean;
  canAssignRoles?: boolean;
  accountListOnly?: boolean;
  beauty?:boolean;
  showSteamfootRent?: boolean;
  showSpaCompensation: boolean;
  createAction: (formData: FormData) => void | Promise<void>;
}) {
  const [localPeople, setPeople] = useState(() =>
    initialPeople.map(clonePerson),
  );
  const [sourcePeople, setSourcePeople] = useState(initialPeople);
  // Route refresh preserves client state. Adopt the new authoritative snapshot
  // without remounting the workspace or discarding the open editor's draft.
  if (sourcePeople !== initialPeople) {
    setSourcePeople(initialPeople);
    setPeople(initialPeople.map(clonePerson));
  }
  const confirmed=useConfirmedSettingsRows<StaffWorkspacePerson>(localPeople,row=>row.updatedAt??JSON.stringify(row), (current,receipt)=>!!current.updatedAt&&!!receipt.updatedAt&&current.updatedAt>=receipt.updatedAt);
  const people=confirmed.rows;
  const [saveNotice,setSaveNotice]=useState("");
  function confirmSaved(person:StaffWorkspacePerson,syncWarning:boolean){confirmed.confirm(person);setSaveNotice(syncWarning?"已儲存；其他頁面更新失敗，請重新整理核對。":"");}
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const filteredPeople = people.filter(
    (p) =>
      [p.displayName, p.legalName, p.phone ?? "", p.email].some((value) =>
        value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      ) &&
      (roleFilter === "all" || p.roleLabel === roleFilter) &&
      (statusFilter === "all" || p.status === statusFilter),
  );
  if (accountListOnly) filteredPeople.sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"));
  const inactivePeople = filteredPeople.filter(person => person.status !== "ACTIVE");
  const inactiveForced = statusFilter === "INACTIVE" || !!search.trim() || roleFilter !== "all";
  const inactiveExpanded = inactiveForced || showInactive;
  const visiblePeople = filteredPeople.filter(person => person.status === "ACTIVE" || inactiveExpanded);
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);
  usePathname();
  function closeEditor(){setEditor(null);}
  const selected = useMemo(
    () =>
      editor && "personId" in editor
        ? (people.find((person) => person.id === editor.personId) ?? null)
        : null,
    [editor, people],
  );
  const servicePeople = people.filter(
    (person) =>
      person.weeklyAvailability.length > 0 || person.specialtyKeys.length > 0,
  );
  servicePeople
    .flatMap((person) =>
      person.scheduleExceptions.map((exception) => ({ ...exception, person })),
    )
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <StaffSaveGuardContext.Provider value={{pending:false,uncertain:false,error:""}}>
    <div className={`${styles.workspace} ${"space-y-2"}`}>
      {saveNotice&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{saveNotice}</p>}
      {notice ? (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="關閉提示"
          >
            ✕
          </button>
        </div>
      ) : null}

      {(
        <section
          className="space-y-2 [&_button]:min-h-11"
          aria-label="人員清單"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="min-w-48 flex-1 sm:max-w-xs">
              <span className="sr-only">搜尋人員</span>
              <input
                aria-label="搜尋人員"
                placeholder="搜尋姓名、電話或 Email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-sm"
              />
            </label>
            <select
              aria-label="篩選人員角色"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm"
            >
              <option value="all">全部角色</option>
              {[...new Set(people.map((p) => p.roleLabel))].map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <select
              aria-label="篩選人員狀態"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm"
            >
              <option value="all">全部狀態</option>
              <option value="ACTIVE">啟用中</option>
              <option value="INACTIVE">已停用</option>
            </select>
            {(search || roleFilter !== "all" || statusFilter !== "all") && <button
              className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm"
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
                setStatusFilter("all");
              }}
            >
              清除篩選
            </button>}
            {canManage && <button type="button" onClick={() => setEditor({ type: "create" })} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-primary-700 px-3 py-2 text-sm text-white hover:bg-primary-800">＋ 新增人員</button>}
          </div>
          <p className="text-sm text-earth-500">
            共 {filteredPeople.length} 位{filteredPeople.length!==people.length&&`／全部 ${people.length} 位`}
          </p>
          {beauty?<CourseStaffList inactiveCount={inactivePeople.length} inactiveForced={inactiveForced} inactiveExpanded={inactiveExpanded} onToggleInactive={()=>setShowInactive(value=>!value)} empty={<p className="p-8 text-center text-earth-500">沒有符合條件的人員。</p>} rows={visiblePeople.map(person=>({
            id:person.id,name:person.displayName,phone:person.phone,email:person.email,active:person.status==='ACTIVE',onOpen:()=>setEditor({type:'details',personId:person.id}),
            identity:<>{person.roleLabel}{person.status!=='ACTIVE'&&<span className="text-earth-500">停用</span>}</>,notifications:<span className="text-earth-500">—</span>,
            actions:<ExclusiveMenu quiet triggerText="⋯" label={`${person.displayName}操作`}><button className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>setEditor({type:'details',personId:person.id})}>{person.canEdit?'編輯':'查看'}</button>{person.canEdit&&<StaffStatusToggle staffId={person.id} currentStatus={person.status} quiet/>}</ExclusiveMenu>
          }))}/>:(          <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
            <table className="admin-list-table w-full min-w-[660px] text-left text-sm">
              <thead className="bg-earth-50 text-earth-600">
                <tr>
                  {["姓名", "角色", "電話", "Email", "狀態", "操作"].map(
                    (h) => (
                      <th scope="col" key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {filteredPeople.map((person) => (
                  <tr key={person.id} className={accountListOnly && person.status !== "ACTIVE" ? "bg-earth-50 opacity-60 hover:opacity-100 focus-within:opacity-100" : "hover:bg-primary-50/40"}>
                    <th
                      scope="row"
                      className="px-3 py-1 font-medium text-primary-900"
                    >
                      {person.displayName}
                    </th>
                    <td className="px-3 py-1">{person.roleLabel}</td>
                    <td className="px-3 py-1">{person.phone || "—"}</td>
                    <td className="break-all px-3 py-1">{person.email}</td>
                    <td className="whitespace-nowrap px-3 py-1">
                      <StatusBadge status={person.status} />
                    </td>
                    <td className="px-3 py-1">
                      <div className="flex justify-center whitespace-nowrap">
                        <ExclusiveMenu quiet triggerText="⋯" label={`${person.displayName}操作`}>
                        <button
                          className="min-h-11 w-full px-3 text-left text-sm"
                          onClick={() =>
                            setEditor({ type: "details", personId: person.id })
                          }
                        >
                          {person.canEdit ? "編輯" : "查看"}
                        </button>
                        {person.canEdit && (
                          <StaffStatusToggle
                            staffId={person.id}
                            currentStatus={person.status}
                            quiet
                          />
                        )}
                        </ExclusiveMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredPeople.length && (
              <p className="p-8 text-center text-earth-500">
                沒有符合條件的人員。
              </p>
            )}
          </div>)}
        </section>
      )}

      {editor?.type === "details" && selected ? (<StaffAccountEditor key={selected.id} person={selected} policy={accountPolicy} storeId={storeId} onSaved={confirmSaved} onClose={closeEditor} />
      ) : null}
      {editor?.type === "create" ? (
        <CreatePersonDrawer
          compact={beauty}
          canAssignRoles={canAssignRoles}
          createAction={createAction}
          storeId={storeId}
          onSaved={confirmSaved}
          showSpaCompensation={showSpaCompensation}
          onClose={closeEditor}
        />
      ) : null}
    </div>
    </StaffSaveGuardContext.Provider>
  );
}

function CreatePersonDrawer({
  compact=false,
  canAssignRoles,
  storeId="",
  onSaved,
  createAction,
  showSpaCompensation,
  onClose,
}: {
  compact?:boolean;storeId?:string;
  onSaved:(person:StaffWorkspacePerson,syncWarning:boolean)=>void;
  canAssignRoles: boolean;
  createAction: (formData: FormData) => void | Promise<void>;
  showSpaCompensation: boolean;
  onClose: () => void;
}) {
  const pathname=usePathname();
  const request=useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/staff`,storeId,savedStaffPerson);
  const submitLock=useRef(false),locked=request.pending||request.uncertain;
  const [dirty,setDirty]=useState(false);
  const [error,setError]=useState("");
  function close(){if(!locked&&(!dirty||window.confirm("尚有未儲存的人員資料，確定離開？")))onClose();}
  async function create(form:FormData){
    if(submitLock.current)return;submitLock.current=true;setError("");
    try{
      if(!storeId){await createAction(form);return;}
      const result=await request.save({expectedVersion:null,values:{name:form.get("name"),displayName:form.get("displayName"),email:String(form.get("email")??"").trim()||undefined,phone:String(form.get("phone")??"").trim(),password:form.get("password"),colorCode:form.get("colorCode"),monthlySpaceFee:Number(form.get("monthlySpaceFee")||0),role:form.get("role")||"STAFF",...({})}});
      if(!result.success){setError(result.error);return;}onSaved(result.data,result.syncWarning);onClose();
    }finally{submitLock.current=false;}
  }


  const [specialtyKeys, setSpecialtyKeys] = useState<string[]>([
    "body",
  ]);
  const [days, setDays] = useState<number[]>([2, 3, 4, 5, 6, 0]);


  return (
    <Drawer title="新增人員" centered={compact} onClose={close}>
      <form onChangeCapture={()=>setDirty(true)} onSubmit={e=>{e.preventDefault();void create(new FormData(e.currentTarget));}} className={compact?"@container/staff space-y-4 [&_input]:min-h-11 [&_select]:min-h-11":"space-y-6"}>
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        <fieldset disabled={locked} className="contents">
        <section className={compact?"grid grid-cols-1 gap-3 @min-[28rem]/staff:grid-cols-2":"space-y-4"}>
          <Field label="人員類型">
            <select name="role" defaultValue="STAFF" className={inputClass}>
              <option value="STAFF">Staff／門市人員</option>
              {canAssignRoles && <><option value="MANAGER">Manager／店長</option><option value="OWNER">Owner／老闆</option></>}
            </select>
          </Field>
          <div className={compact?"contents":"grid grid-cols-2 gap-3"}>
            <Field label="真實姓名">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="顯示名稱">
              <input
                name="displayName"
                required
                className={inputClass}
                placeholder="例如：08號 陳語安"
              />
            </Field>
          </div>
          <Field label="手機（必填）">
            <input
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              pattern="09[0-9]{8}"
              maxLength={10}
              required
              className={inputClass}
              placeholder="09xxxxxxxx"
            />
          </Field>
          <div className={compact?"contents":"grid grid-cols-2 gap-3"}>
            <Field label="初始密碼">
              <input
                name="password"
                type="password"
                minLength={6}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Email（選填）">
              <input name="email" type="email" className={inputClass} />
            </Field>
          </div>
          <Field label="識別色">
            <input
              name="colorCode"
              type="color"
              defaultValue="#8fa89b"
              className="mt-1 block h-11 w-20 rounded-lg border border-earth-300"
            />
          </Field>
          {(
            <Field label="月度空間費">
              <input
                name="monthlySpaceFee"
                type="number"
                min="0"
                defaultValue="0"
                className={inputClass}
              />
            </Field>
          )}
        </section>
        {null}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-earth-100 pt-4">
          <button
            type="button"
            disabled={locked}
            onClick={close}
            className="rounded-lg border border-earth-300 px-4 py-2 text-sm text-earth-700 hover:bg-earth-50"
          >
            取消
          </button>
          <SubmitButton
            label={request.pending?"建立中…":request.uncertain?"重試確認建立結果":"建立人員"}
            pendingLabel="建立中..."
            disabled={
              request.pending || false
            }
            className="bg-primary-600 text-white hover:bg-primary-700"
          />
        </div>
      </form>
    </Drawer>
  );
}

function Drawer({
  centered=false,
  title,
  onClose,
  children,
}: {
  centered?:boolean;title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const guard=useContext(StaffSaveGuardContext);
  if(centered)return createPortal(<RightSheet open presentation="centered" fitContent width={800} labelledById="staff-create-title" onClose={onClose} closeOnEscape={!guard.pending&&!guard.uncertain}><header className="flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2"><h2 id="staff-create-title" className="font-semibold">{title}</h2><button type="button" className="min-h-11 rounded-lg border px-3" disabled={guard.pending||guard.uncertain} onClick={onClose}>關閉</button></header><div className="min-h-0 overflow-y-auto overscroll-contain p-4">{guard.error&&<p role="alert" className="mb-3 text-sm text-red-700">{guard.error}</p>}{children}</div></RightSheet>,document.body);
  return createPortal(
    <div data-rwd-panel className={`${styles.panel} fixed inset-0 z-50 flex justify-end`}>
      <button
        type="button"
        aria-label="關閉側邊面板"
        disabled={guard.pending||guard.uncertain}
        onClick={onClose}
        className="absolute inset-0 bg-earth-950/25"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl"
      >
        <header className="mb-5 flex items-center justify-between">
          <h1 className="admin-page-title">{title}</h1>
          <button
            type="button"
            disabled={guard.pending||guard.uncertain}
        onClick={onClose}
            className="rounded-lg p-2 text-earth-500 hover:bg-earth-100"
            aria-label="關閉"
          >
            ✕
          </button>
        </header>
        {guard.error&&<p role="alert" className="mb-3 text-sm text-red-700">{guard.error}</p>}
        {children}
      </aside>
    </div>, document.body
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-earth-700">
      {label}
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-medium ${status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-earth-100 text-earth-500"}`}
    >
      {status === "ACTIVE" ? "啟用" : "停用"}
    </span>
  );
}

function clonePerson(person: StaffWorkspacePerson): StaffWorkspacePerson {
  return {
    ...person,
    specialtyKeys: [...person.specialtyKeys],
    weeklyAvailability: person.weeklyAvailability.map((item) => ({ ...item })),
    scheduleExceptions: person.scheduleExceptions.map((item) => ({ ...item })),
  };
}
