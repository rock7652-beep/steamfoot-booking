"use client";
import { createPortal } from "react-dom";

import styles from "@/components/admin/management-layout.module.css";
import { StaffAccountEditor, emptyStaffAccountPolicy, type StaffAccountPolicy } from "./staff-account-editor";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SubmitButton } from "@/components/submit-button";
import { ResetPasswordButton } from "./reset-password-button";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { StaffStatusToggle } from "./staff-status-toggle";
import type { SpaProviderSpecialty } from "@/lib/spa-scheduling";
import {useConfirmedSettingsRows} from "@/components/admin/use-confirmed-settings-rows";
import {useSettingsSave} from "@/components/admin/use-settings-save";
import {savedStaffPerson} from "@/lib/staff-settings-save";
import {usePathname} from "next/navigation";
const StaffSaveGuardContext=createContext({pending:false,uncertain:false,error:""});
function StaffDraftFields({children}:{children:React.ReactNode}){const guard=useContext(StaffSaveGuardContext);return <fieldset disabled={guard.pending||guard.uncertain} className="contents">{children}</fieldset>;}

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
  specialtyKeys: readonly SpaProviderSpecialty[];
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

const WEEK_DAYS = [
  { dayOfWeek: 1, short: "一" },
  { dayOfWeek: 2, short: "二" },
  { dayOfWeek: 3, short: "三" },
  { dayOfWeek: 4, short: "四" },
  { dayOfWeek: 5, short: "五" },
  { dayOfWeek: 6, short: "六" },
  { dayOfWeek: 0, short: "日" },
] as const;

const SPECIALTY_OPTIONS: readonly {
  key: SpaProviderSpecialty;
  label: string;
  hint: string;
}[] = [
  { key: "body", label: "身體芳療", hint: "全身、深層、精油療程" },
  { key: "head", label: "頭部／肩頸", hint: "頭部舒壓、肩頸放鬆" },
  { key: "foot", label: "足部療程", hint: "足部按摩與加購" },
  { key: "face", label: "臉部保養", hint: "保濕、亮顏與臉部護理" },
] as const;

const TIME_OPTIONS = Array.from({ length: 25 }, (_, index) => {
  const totalMinutes = 9 * 60 + index * 30;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
});
const inputClass =
  "mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200";

export function StaffWorkspace({
  storeId,
  accountPolicy = emptyStaffAccountPolicy,
  accountListOnly = false,
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
  const filteredPeople = people.filter(
    (p) =>
      [p.displayName, p.legalName, p.phone ?? "", p.email].some((value) =>
        value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      ) &&
      (roleFilter === "all" || p.roleLabel === roleFilter) &&
      (statusFilter === "all" || p.status === statusFilter),
  );
  if (accountListOnly) filteredPeople.sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"));
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pathname=usePathname();
  const spaRequest=useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/spa/staff`,storeId??"",savedStaffPerson);
  const isPending=spaRequest.pending;
  const spaLock=useRef(false);
  const [spaError,setSpaError]=useState("");
  async function saveSpaPerson(kind:"setup"|"skills"|"weekly"|"compensation"|"exception",id:string,values:Record<string,unknown>){
    if(spaLock.current)return;spaLock.current=true;setSpaError("");
    try{const person=people.find(person=>person.id===id);if(!person)return;const result=await spaRequest.save({kind,id,expectedVersion:person.updatedAt??null,values});if(!result.success){setSpaError(result.error);return;}confirmSaved(result.data,result.syncWarning);setEditor(null);setNotice("人員設定已儲存");}finally{spaLock.current=false;}
  }
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
  const exceptions = servicePeople
    .flatMap((person) =>
      person.scheduleExceptions.map((exception) => ({ ...exception, person })),
    )
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  function saveSkills(id:string,skillKeys:SpaProviderSpecialty[]){void saveSpaPerson("skills",id,{skillKeys});}
  function saveCompensation(id:string,mode:"PERCENTAGE"|"FIXED",value:number){void saveSpaPerson("compensation",id,{mode,value});}
  function saveAvailability(id:string,availability:Availability[]){void saveSpaPerson("weekly",id,{availability});}
  function saveSetup(id:string,setup:{legalName:string;phone:string;email:string;displayName:string;colorCode:string;specialtyKeys:SpaProviderSpecialty[];weeklyAvailability:Availability[];compensationMode:"PERCENTAGE"|"FIXED";compensationValue:number}){void saveSpaPerson("setup",id,{legalName:setup.legalName,phone:setup.phone,email:setup.email,displayName:setup.displayName,colorCode:setup.colorCode,skillKeys:setup.specialtyKeys,availability:setup.weeklyAvailability,compensation:{mode:setup.compensationMode,value:setup.compensationValue}});}
  function addException(id:string,exception:ScheduleException){void saveSpaPerson("exception",id,{date:exception.date,type:exception.tone==="leave"?"UNAVAILABLE":"AVAILABLE",startTime:exception.startTime??null,endTime:exception.endTime??null,reason:exception.reason??null});}
  function closeSpaEditor(){if(!spaLock.current&&!spaRequest.pending&&!spaRequest.uncertain){setSpaError("");spaRequest.reset();setEditor(null);}}

  return (
    <StaffSaveGuardContext.Provider value={{pending:spaRequest.pending,uncertain:spaRequest.uncertain,error:spaError}}>
    <div className={`${styles.workspace} ${accountListOnly ? "space-y-2" : "space-y-4"}`}>
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

      {!accountListOnly && <section
        className={
          accountListOnly
            ? "flex justify-end"
            : "rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={accountListOnly ? "hidden" : undefined}>
            <h2 className="text-sm font-semibold text-earth-900">
              {accountListOnly
                ? "人員帳號"
                : "人員建好一次，平常只處理例外"}
            </h2>
            <p className="mt-1 text-xs text-earth-600">
              {accountListOnly
                ? "管理基本資料、角色與登入權限。"
                : "設定專業項目與每週固定班表後，請假、臨時加班才需要再次調整。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!accountListOnly && servicePeople.length > 0 ? (
              <button
                type="button"
                onClick={() => setEditor({ type: "exception" })}
                className="rounded-lg border border-primary-300 bg-white px-3.5 py-2 text-xs font-semibold text-primary-800 hover:bg-primary-50"
              >
                ＋ 請假／臨時加班
              </button>
            ) : null}
            {canManage ? (
              <button
                type="button"
                onClick={() => setEditor({ type: "create" })}
                className="rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700"
              >
                ＋ 新增人員
              </button>
            ) : null}
          </div>
        </div>
      </section>}

      {accountListOnly ? (
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
            共 {filteredPeople.length} 位／全部 {people.length} 位
          </p>
          <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
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
          </div>
        </section>
      ) : (
        <section
          className={`${styles.cards} gap-3`}
          aria-label="人員總覽"
        >
          {people.map((person) => (
            <article
              key={person.id}
              className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setEditor({
                      type: showSpaCompensation ? "setup" : "details",
                      personId: person.id,
                    })
                  }
                  className="flex min-w-0 items-center gap-3 text-left"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: person.colorCode }}
                  >
                    {initials(person.displayName)}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-semibold text-earth-900">
                      {person.displayName}
                    </span>
                    <span className="mt-0.5 block text-xs text-earth-500">
                      {person.roleLabel}
                    </span>
                  </span>
                </button>
                <StatusBadge status={person.status} />
              </div>
              {!accountListOnly && (
                <div className="mt-4 space-y-3 border-t border-earth-100 pt-3">
                  <QuickSetting
                    label="專業項目"
                    value={specialtySummary(
                      person.specialtyKeys,
                      person.specialties,
                    )}
                    empty="尚未設定，顧客無法指定此人員"
                    canEdit={person.canEdit}
                    onEdit={() =>
                      setEditor({
                        type: showSpaCompensation ? "setup" : "specialties",
                        personId: person.id,
                      })
                    }
                  />
                  <QuickSetting
                    label="固定班表"
                    value={scheduleSummary(person.weeklyAvailability)}
                    empty="尚未設定接客時間"
                    canEdit={person.canEdit && person.specialtyKeys.length > 0}
                    onEdit={() =>
                      setEditor({
                        type: showSpaCompensation ? "setup" : "schedule",
                        personId: person.id,
                      })
                    }
                  />
                  {showSpaCompensation ? (
                    <QuickSetting
                      label="抽成"
                      value={compensationSummary(
                        person.compensationMode,
                        person.compensationValue,
                      )}
                      empty="尚未設定"
                      canEdit={person.canEdit}
                      onEdit={() =>
                        setEditor({ type: "setup", personId: person.id })
                      }
                    />
                  ) : null}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-earth-100 pt-3 text-xs">
                <span className="text-earth-400">
                  {accountListOnly
                    ? person.phone || "尚未設定電話"
                    : `直屬顧客 ${person.customerCount} 位`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditor({
                      type: showSpaCompensation ? "setup" : "details",
                      personId: person.id,
                    })
                  }
                  className="font-medium text-primary-700 hover:underline"
                >
                  {showSpaCompensation ? "查看與設定 →" : "基本資料與聯絡人 →"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {!accountListOnly && (
        <section className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-earth-900">近期例外</h2>
              <p className="mt-0.5 text-xs text-earth-500">
                固定班表不用每天重排，這裡只顯示請假、加班或臨時改時段。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditor({ type: "exception" })}
              className="rounded-lg border border-earth-300 px-3 py-2 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              ＋ 新增例外
            </button>
          </header>
          {exceptions.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-earth-400">
              目前沒有近期例外，不需要安排
            </div>
          ) : (
            <div className="divide-y divide-earth-100">
              {exceptions.map((item) => (
                <div
                  key={`${item.person.id}-${item.date}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${item.tone === "leave" ? "bg-rose-400" : "bg-blue-400"}`}
                    />
                    <div>
                      <p className="text-sm font-semibold text-earth-900">
                        {item.person.displayName}
                      </p>
                      <p className="text-xs text-earth-500">{item.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums text-earth-700">
                      {formatDate(item.date)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditor({
                          type: "exception",
                          personId: item.person.id,
                        })
                      }
                      className="text-xs font-medium text-primary-700 hover:underline"
                    >
                      調整
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {editor?.type === "details" && selected ? (accountListOnly ? <StaffAccountEditor key={selected.id} person={selected} policy={accountPolicy} storeId={storeId} onSaved={confirmSaved} onClose={closeSpaEditor} /> :
        <PersonDrawer
          accountListOnly={accountListOnly}
          person={selected}
          showSteamfootRent={showSteamfootRent}
          showSpaCompensation={showSpaCompensation}
          onClose={closeSpaEditor}
          onSpecialties={() =>
            setEditor({ type: "specialties", personId: selected.id })
          }
          onSchedule={() =>
            setEditor({ type: "schedule", personId: selected.id })
          }
          onCompensation={() =>
            setEditor({ type: "compensation", personId: selected.id })
          }
        />
      ) : null}
      {editor?.type === "setup" && selected ? (
        <SpaStaffSetupDrawer
          person={selected}
          onClose={closeSpaEditor}
          onSave={(setup) => saveSetup(selected.id, setup)}
        />
      ) : null}
      {editor?.type === "specialties" && selected ? (
        <SpecialtyDrawer
          person={selected}
          onClose={closeSpaEditor}
          onSave={(keys) => saveSkills(selected.id, keys)}
        />
      ) : null}
      {editor?.type === "schedule" && selected ? (
        <ScheduleDrawer
          person={selected}
          onClose={closeSpaEditor}
          onSave={(weeklyAvailability) =>
            saveAvailability(selected.id, weeklyAvailability)
          }
        />
      ) : null}
      {editor?.type === "compensation" && selected ? (
        <CompensationDrawer
          person={selected}
          onClose={closeSpaEditor}
          onSave={(mode, value) => saveCompensation(selected.id, mode, value)}
        />
      ) : null}
      {editor?.type === "exception" ? (
        <ExceptionDrawer
          people={servicePeople}
          initialPersonId={editor.personId}
          today={today}
          onClose={closeSpaEditor}
          onSave={addException}
        />
      ) : null}
      {editor?.type === "create" ? (
        <CreatePersonDrawer
          canAssignRoles={canAssignRoles}
          createAction={createAction}
          storeId={storeId}
          onSaved={confirmSaved}
          showSpaCompensation={showSpaCompensation}
          onClose={closeSpaEditor}
        />
      ) : null}
      {isPending ? createPortal(
        <div className="fixed bottom-5 right-5 z-[60] rounded-lg bg-earth-900 px-4 py-2 text-sm text-white shadow-lg">
          儲存中…
        </div>, document.body
      ) : null}
    </div>
    </StaffSaveGuardContext.Provider>
  );
}

function QuickSetting({
  label,
  value,
  empty,
  canEdit,
  onEdit,
}: {
  label: string;
  value: string | null;
  empty: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] text-earth-400">{label}</p>
        <p
          className={`mt-0.5 text-xs ${value ? "font-medium text-earth-700" : "text-amber-700"}`}
        >
          {value ?? empty}
        </p>
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-md border border-earth-200 px-2.5 py-1.5 text-[11px] font-medium text-primary-700 hover:bg-primary-50"
        >
          設定
        </button>
      ) : null}
    </div>
  );
}

function SpecialtyDrawer({
  person,
  onClose,
  onSave,
}: {
  person: StaffWorkspacePerson;
  onClose: () => void;
  onSave: (keys: SpaProviderSpecialty[]) => void;
}) {
  const [selected, setSelected] = useState<SpaProviderSpecialty[]>([
    ...person.specialtyKeys,
  ]);
  function toggle(key: SpaProviderSpecialty) {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }
  return (
    <Drawer title={`設定專業項目｜${person.displayName}`} onClose={onClose}>
      <StaffDraftFields>
      <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-800">
        顧客選擇的所有服務項目，都必須在此人員的專業範圍內，才會顯示為可預約。
      </p>
      <div className="mt-4 space-y-2">
        {SPECIALTY_OPTIONS.map((option) => {
          const active = selected.includes(option.key);
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => toggle(option.key)}
              className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${active ? "border-primary-400 bg-primary-50" : "border-earth-200 hover:border-earth-300"}`}
            >
              <span>
                <span className="block text-sm font-semibold text-earth-900">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-earth-500">
                  {option.hint}
                </span>
              </span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${active ? "border-primary-600 bg-primary-600 text-white" : "border-earth-300 text-transparent"}`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>
      </StaffDraftFields>
      <DrawerActions
        onCancel={onClose}
        onSave={() => onSave(selected)}
        saveLabel="儲存專業項目"
        disabled={selected.length === 0}
      />
    </Drawer>
  );
}

function ScheduleDrawer({
  person,
  onClose,
  onSave,
}: {
  person: StaffWorkspacePerson;
  onClose: () => void;
  onSave: (availability: Availability[]) => void;
}) {
  const [days, setDays] = useState<number[]>(
    person.weeklyAvailability.map((item) => item.dayOfWeek),
  );
  const [startTime, setStartTime] = useState(
    person.weeklyAvailability[0]?.startTime ?? "10:00",
  );
  const [endTime, setEndTime] = useState(
    person.weeklyAvailability[0]?.endTime ?? "19:00",
  );
  function applyPreset(nextDays: number[], start: string, end: string) {
    setDays(nextDays);
    setStartTime(start);
    setEndTime(end);
  }
  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day],
    );
  }
  function save() {
    onSave(
      WEEK_DAYS.filter((day) => days.includes(day.dayOfWeek)).map((day) => ({
        dayOfWeek: day.dayOfWeek,
        startTime,
        endTime,
      })),
    );
  }
  return (
    <Drawer title={`固定班表｜${person.displayName}`} onClose={onClose}>
      <StaffDraftFields>
      <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-800">
        只需設定一次。之後固定沿用；請假或臨時加班請使用「新增例外」。
      </p>
      <section className="mt-5">
        <h3 className="text-sm font-semibold text-earth-800">快速套用</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <PresetButton
            label="週一至週五"
            hint="10:00–19:00"
            onClick={() => applyPreset([1, 2, 3, 4, 5], "10:00", "19:00")}
          />
          <PresetButton
            label="週二至週日"
            hint="10:00–20:00"
            onClick={() => applyPreset([2, 3, 4, 5, 6, 0], "10:00", "20:00")}
          />
        </div>
      </section>
      <section className="mt-5">
        <h3 className="text-sm font-semibold text-earth-800">每週接客日</h3>
        <div className={`${styles.weekdays} mt-2 grid gap-1.5`}>
          {WEEK_DAYS.map((day) => (
            <button
              key={day.dayOfWeek}
              type="button"
              onClick={() => toggleDay(day.dayOfWeek)}
              className={`rounded-lg border py-2.5 text-xs font-semibold ${days.includes(day.dayOfWeek) ? "border-primary-600 bg-primary-600 text-white" : "border-earth-200 text-earth-500 hover:bg-earth-50"}`}
            >
              {day.short}
            </button>
          ))}
        </div>
      </section>
      <section className="mt-5">
        <h3 className="text-sm font-semibold text-earth-800">接客時間</h3>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Field label="開始">
            <select
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={inputClass}
            >
              {TIME_OPTIONS.slice(0, -1).map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </Field>
          <span className="pb-2 text-earth-400">至</span>
          <Field label="結束">
            <select
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={inputClass}
            >
              {TIME_OPTIONS.slice(1).map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-earth-400">
          以上時間會一次套用到已選的 {days.length} 天，不必逐時段新增。
        </p>
      </section>
      </StaffDraftFields>
      <DrawerActions
        onCancel={onClose}
        onSave={save}
        saveLabel={`儲存 ${days.length} 天班表`}
        disabled={days.length === 0 || startTime >= endTime}
      />
    </Drawer>
  );
}

function CompensationDrawer({
  person,
  onClose,
  onSave,
}: {
  person: StaffWorkspacePerson;
  onClose: () => void;
  onSave: (mode: "PERCENTAGE" | "FIXED", value: number) => void;
}) {
  const [mode, setMode] = useState<"PERCENTAGE" | "FIXED">(
    person.compensationMode ?? "PERCENTAGE",
  );
  const [value, setValue] = useState(person.compensationValue ?? 0);
  const valid =
    Number.isFinite(value) &&
    value >= 0 &&
    (mode !== "PERCENTAGE" || value <= 100);
  return (
    <Drawer title={`抽成設定｜${person.displayName}`} onClose={onClose}>
      <StaffDraftFields>
      <div className={`${styles.workspace} space-y-4`}>
        <div>
          <p className="text-sm font-medium text-earth-700">計算方式</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ChoiceButton
              active={mode === "PERCENTAGE"}
              label="服務金額比例"
              onClick={() => setMode("PERCENTAGE")}
            />
            <ChoiceButton
              active={mode === "FIXED"}
              label="每位固定金額"
              onClick={() => setMode("FIXED")}
            />
          </div>
        </div>
        <Field label={mode === "PERCENTAGE" ? "抽成比例（%）" : "每位抽成金額"}>
          <input
            type="number"
            min="0"
            max={mode === "PERCENTAGE" ? 100 : 1000000}
            step={mode === "PERCENTAGE" ? "0.1" : "1"}
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
            className={inputClass}
          />
        </Field>
      </div>
      </StaffDraftFields>
      <DrawerActions
        onCancel={onClose}
        onSave={() => onSave(mode, value)}
        saveLabel="儲存抽成設定"
        disabled={!valid}
      />
    </Drawer>
  );
}

function SpaStaffSetupDrawer({
  person,
  onClose,
  onSave,
}: {
  person: StaffWorkspacePerson;
  onClose: () => void;
  onSave: (setup: {
    legalName: string;
    phone: string;
    email: string;
    displayName: string;
    colorCode: string;
    specialtyKeys: SpaProviderSpecialty[];
    weeklyAvailability: Availability[];
    compensationMode: "PERCENTAGE" | "FIXED";
    compensationValue: number;
  }) => void;
}) {
  const [legalName, setLegalName] = useState(person.legalName);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [email, setEmail] = useState(
    person.email === "尚未設定" ? "" : person.email,
  );
  const [displayName, setDisplayName] = useState(person.displayName);
  const [colorCode, setColorCode] = useState(person.colorCode);
  const [specialtyKeys, setSpecialtyKeys] = useState<SpaProviderSpecialty[]>([
    ...person.specialtyKeys,
  ]);
  const [days, setDays] = useState<number[]>(
    person.weeklyAvailability.map((item) => item.dayOfWeek),
  );
  const [startTime, setStartTime] = useState(
    person.weeklyAvailability[0]?.startTime ?? "10:00",
  );
  const [endTime, setEndTime] = useState(
    person.weeklyAvailability[0]?.endTime ?? "19:00",
  );
  const [compensationEnabled, setCompensationEnabled] = useState(
    (person.compensationValue ?? 0) > 0,
  );
  const [compensationMode, setCompensationMode] = useState<
    "PERCENTAGE" | "FIXED"
  >(person.compensationMode ?? "PERCENTAGE");
  const [compensationValue, setCompensationValue] = useState(
    person.compensationValue ?? 0,
  );
  function toggleSpecialty(key: SpaProviderSpecialty) {
    setSpecialtyKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }
  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day],
    );
  }
  const finalCompensationValue = compensationEnabled ? compensationValue : 0;
  const valid =
    legalName.trim().length > 0 &&
    /^09\d{8}$/.test(phone) &&
    (email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) &&
    displayName.trim().length > 0 &&
    specialtyKeys.length > 0 &&
    days.length > 0 &&
    startTime < endTime &&
    Number.isFinite(finalCompensationValue) &&
    finalCompensationValue >= 0 &&
    (compensationMode !== "PERCENTAGE" || finalCompensationValue <= 100);
  function save() {
    onSave({
      legalName: legalName.trim(),
      phone,
      email: email.trim(),
      displayName: displayName.trim(),
      colorCode,
      specialtyKeys,
      weeklyAvailability: WEEK_DAYS.filter((day) =>
        days.includes(day.dayOfWeek),
      ).map((day) => ({ dayOfWeek: day.dayOfWeek, startTime, endTime })),
      compensationMode,
      compensationValue: finalCompensationValue,
    });
  }
  return (
    <Drawer title={`人員設定｜${person.displayName}`} onClose={onClose}>
      <StaffDraftFields>
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-earth-900">基本資料</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="真實姓名">
              <input
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="顯示名稱">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="手機">
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-[1fr_72px] gap-3">
            <Field label="Email（選填）">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="識別色">
              <input
                type="color"
                value={colorCode}
                onChange={(event) => setColorCode(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-earth-300"
              />
            </Field>
          </div>
        </section>
        <section className="border-t border-earth-100 pt-5">
          <h3 className="text-sm font-semibold text-earth-900">可服務項目</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {SPECIALTY_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.key}
                active={specialtyKeys.includes(option.key)}
                label={option.label}
                onClick={() => toggleSpecialty(option.key)}
              />
            ))}
          </div>
        </section>
        <section className="border-t border-earth-100 pt-5">
          <h3 className="text-sm font-semibold text-earth-900">固定班表</h3>
          <div className={`${styles.weekdays} mt-3 grid gap-1.5`}>
            {WEEK_DAYS.map((day) => (
              <button
                key={day.dayOfWeek}
                type="button"
                aria-pressed={days.includes(day.dayOfWeek)}
                onClick={() => toggleDay(day.dayOfWeek)}
                className={`rounded-lg border py-2.5 text-xs font-semibold ${days.includes(day.dayOfWeek) ? "border-primary-600 bg-primary-600 text-white" : "border-earth-200 text-earth-500"}`}
              >
                {day.short}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="開始">
              <select
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={inputClass}
              >
                {TIME_OPTIONS.slice(0, -1).map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </select>
            </Field>
            <span className="pb-2 text-earth-400">至</span>
            <Field label="結束">
              <select
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className={inputClass}
              >
                {TIME_OPTIONS.slice(1).map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>
        <section className="border-t border-earth-100 pt-5">
          <h3 className="text-sm font-semibold text-earth-900">抽成</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <ChoiceButton
              active={!compensationEnabled}
              label="不計抽成"
              onClick={() => setCompensationEnabled(false)}
            />
            <ChoiceButton
              active={compensationEnabled && compensationMode === "PERCENTAGE"}
              label="服務比例"
              onClick={() => {
                setCompensationEnabled(true);
                setCompensationMode("PERCENTAGE");
              }}
            />
            <ChoiceButton
              active={compensationEnabled && compensationMode === "FIXED"}
              label="每位固定"
              onClick={() => {
                setCompensationEnabled(true);
                setCompensationMode("FIXED");
              }}
            />
          </div>
          {compensationEnabled ? (
            <div className="mt-3">
              <Field
                label={
                  compensationMode === "PERCENTAGE"
                    ? "抽成比例（%）"
                    : "每位抽成金額"
                }
              >
                <input
                  type="number"
                  min="0"
                  max={compensationMode === "PERCENTAGE" ? 100 : 1000000}
                  step={compensationMode === "PERCENTAGE" ? "0.1" : "1"}
                  value={compensationValue}
                  onChange={(event) =>
                    setCompensationValue(Number(event.target.value))
                  }
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}
        </section>
      </div>
      </StaffDraftFields>
      <DrawerActions
        onCancel={onClose}
        onSave={save}
        saveLabel="儲存人員設定"
        disabled={!valid}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {person.canEdit ? (
          <StaffStatusToggle
            staffId={person.id}
            currentStatus={person.status}
          />
        ) : null}
        {person.canResetPassword ? (
          <ResetPasswordButton
            userId={person.userId}
            displayName={person.displayName}
          />
        ) : null}
      </div>
    </Drawer>
  );
}

function ExceptionDrawer({
  people,
  initialPersonId,
  today,
  onClose,
  onSave,
}: {
  people: readonly StaffWorkspacePerson[];
  initialPersonId?: string;
  today: string;
  onClose: () => void;
  onSave: (personId: string, exception: ScheduleException) => void;
}) {
  const [personId, setPersonId] = useState(
    initialPersonId ?? people[0]?.id ?? "",
  );
  const [date, setDate] = useState(today);
  const [type, setType] = useState<"leave-day" | "leave-time" | "extra">(
    "leave-day",
  );
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const usesTime = type !== "leave-day";
  const isLeave = type !== "extra";
  const label =
    type === "leave-day"
      ? reason || "個人休假"
      : `${isLeave ? "請假" : "臨時加班"} ${startTime}–${endTime}${reason ? `・${reason}` : ""}`;
  return (
    <Drawer title="請假／臨時加班" onClose={onClose}>
      <StaffDraftFields>
      <div className={`${styles.workspace} space-y-4`}>
        <Field label="人員">
          <select
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
            className={inputClass}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="日期">
          <input
            type="date"
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={inputClass}
          />
        </Field>
        <div>
          <p className="text-sm font-medium text-earth-700">異動類型</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ChoiceButton
              active={type === "leave-day"}
              label="整天請假"
              onClick={() => setType("leave-day")}
            />
            <ChoiceButton
              active={type === "leave-time"}
              label="時段請假"
              onClick={() => setType("leave-time")}
            />
            <ChoiceButton
              active={type === "extra"}
              label="臨時加班"
              onClick={() => setType("extra")}
            />
          </div>
        </div>
        {usesTime ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始">
              <select
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={inputClass}
              >
                {TIME_OPTIONS.slice(0, -1).map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </select>
            </Field>
            <Field label="結束">
              <select
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className={inputClass}
              >
                {TIME_OPTIONS.slice(1).map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}
        <Field label="原因（選填）">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            className={inputClass}
            placeholder="例如：私人行程"
          />
        </Field>
        {isLeave ? (
          <p className="text-xs text-earth-500">
            若已有預約，請先更換芳療師後再設定請假。
          </p>
        ) : null}
      </div>
      </StaffDraftFields>
      <DrawerActions
        onCancel={onClose}
        onSave={() =>
          onSave(personId, {
            date,
            label,
            tone: isLeave ? "leave" : "extra",
            startTime: usesTime ? startTime : null,
            endTime: usesTime ? endTime : null,
            reason: reason || null,
          })
        }
        saveLabel="儲存例外"
        disabled={!personId || !date || (usesTime && startTime >= endTime)}
      />
    </Drawer>
  );
}

function PersonDrawer({
  accountListOnly = false,
  showSteamfootRent = false,
  person,
  showSpaCompensation,
  onClose,
  onSpecialties,
  onSchedule,
  onCompensation,
}: {
  accountListOnly?: boolean;
  showSteamfootRent?: boolean;
  person: StaffWorkspacePerson;
  showSpaCompensation: boolean;
  onClose: () => void;
  onSpecialties: () => void;
  onSchedule: () => void;
  onCompensation: () => void;
}) {
  return (
    <Drawer title="人員基本資料" onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-earth-100 pb-4">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: person.colorCode }}
        >
          {initials(person.displayName)}
        </span>
        <div>
          <h2 className="font-semibold text-earth-900">{person.displayName}</h2>
          <p className="text-xs text-earth-500">
            {person.roleLabel}・{person.legalName}
          </p>
        </div>
      </div>
      <InfoSection title="基本資料">
        <Info label="手機" value={person.phone || "尚未設定"} />
        <Info label="Email" value={person.email} />
        <Info
          label="狀態"
          value={person.status === "ACTIVE" ? "啟用中" : "已停用"}
        />
        {showSpaCompensation ? (
          <Info
            label="抽成"
            value={
              compensationSummary(
                person.compensationMode,
                person.compensationValue,
              ) ?? "尚未設定"
            }
          />
        ) : null}
      </InfoSection>
      <InfoSection title="緊急聯絡人">
        <Info
          label="聯絡方式"
          value={
            person.emergencyContact
              ? `${person.emergencyContact.name}（${person.emergencyContact.relation}） ${person.emergencyContact.phone}`
              : "尚未設定"
          }
        />
      </InfoSection>
      <div className="mt-6 grid grid-cols-2 gap-2 border-t border-earth-100 pt-4">
        {!accountListOnly && person.canEdit ? (
          <button
            type="button"
            onClick={onSpecialties}
            className="rounded-lg border border-primary-300 px-3 py-2 text-xs font-medium text-primary-800 hover:bg-primary-50"
          >
            設定專業項目
          </button>
        ) : null}
        {!accountListOnly &&
        person.canEdit &&
        person.specialtyKeys.length > 0 ? (
          <button
            type="button"
            onClick={onSchedule}
            className="rounded-lg border border-primary-300 px-3 py-2 text-xs font-medium text-primary-800 hover:bg-primary-50"
          >
            設定固定班表
          </button>
        ) : null}
        {person.canEdit && showSpaCompensation ? (
          <button
            type="button"
            onClick={onCompensation}
            className="rounded-lg border border-primary-300 px-3 py-2 text-xs font-medium text-primary-800 hover:bg-primary-50"
          >
            設定抽成
          </button>
        ) : null}
        {person.canEdit && showSteamfootRent && <Link href={`/dashboard/staff/${person.id}/rent`} className="inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm text-primary-700">空間租金</Link>}
        {person.canEdit ? (
          <Link
            href={`/dashboard/staff/${person.id}/edit`}
            className="rounded-lg bg-primary-600 px-3 py-2 text-center text-xs font-medium text-white hover:bg-primary-700"
          >
            編輯基本資料
          </Link>
        ) : null}
        {person.canEdit ? (
          <StaffStatusToggle
            staffId={person.id}
            currentStatus={person.status}
          />
        ) : null}
        {person.canResetPassword ? (
          <ResetPasswordButton
            userId={person.userId}
            displayName={person.displayName}
          />
        ) : null}
      </div>
    </Drawer>
  );
}

function CreatePersonDrawer({
  canAssignRoles,
  storeId="",
  onSaved,
  createAction,
  showSpaCompensation,
  onClose,
}: {
  storeId?:string;
  onSaved:(person:StaffWorkspacePerson,syncWarning:boolean)=>void;
  canAssignRoles: boolean;
  createAction: (formData: FormData) => void | Promise<void>;
  showSpaCompensation: boolean;
  onClose: () => void;
}) {
  const pathname=usePathname();
  const request=useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/staff`,storeId,savedStaffPerson);
  const submitLock=useRef(false),locked=request.pending||request.uncertain;
  const [error,setError]=useState("");
  function close(){if(!locked)onClose();}
  async function create(form:FormData){
    if(submitLock.current)return;submitLock.current=true;setError("");
    try{
      if(!storeId){await createAction(form);return;}
      const result=await request.save({expectedVersion:null,values:{name:form.get("name"),displayName:form.get("displayName"),email:String(form.get("email")??"").trim()||undefined,phone:String(form.get("phone")??"").trim(),password:form.get("password"),colorCode:form.get("colorCode"),monthlySpaceFee:Number(form.get("monthlySpaceFee")||0),role:form.get("role")||"STAFF",...(showSpaCompensation?{spaSkillKeys:form.getAll("spaSkillKeys"),spaWeeklyAvailability:form.getAll("spaAvailabilityDays").map(day=>({dayOfWeek:Number(day),startTime:form.get("spaStartTime"),endTime:form.get("spaEndTime")})),spaCompensation:{mode:form.get("compensationMode"),value:Number(form.get("compensationValue"))}}:{})}});
      if(!result.success){setError(result.error);return;}onSaved(result.data,result.syncWarning);onClose();
    }finally{submitLock.current=false;}
  }
  const [compensationMode, setCompensationMode] = useState<
    "PERCENTAGE" | "FIXED"
  >("PERCENTAGE");
  const [compensationEnabled, setCompensationEnabled] = useState(true);
  const [compensationValue, setCompensationValue] = useState(0);
  const [specialtyKeys, setSpecialtyKeys] = useState<SpaProviderSpecialty[]>([
    "body",
  ]);
  const [days, setDays] = useState<number[]>([2, 3, 4, 5, 6, 0]);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("20:00");
  function toggleSpecialty(key: SpaProviderSpecialty) {
    setSpecialtyKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }
  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day],
    );
  }
  return (
    <Drawer title="新增人員" onClose={close}>
      <form onSubmit={e=>{e.preventDefault();void create(new FormData(e.currentTarget));}} className="space-y-6">
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        <fieldset disabled={locked} className="contents">
        <section className="space-y-4">
          <Field label="人員類型">
            <select name="role" defaultValue="STAFF" className={inputClass}>
              <option value="STAFF">Staff／門市人員</option>
              {canAssignRoles && <><option value="MANAGER">Manager／店長</option><option value="OWNER">Owner／老闆</option></>}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
              className="mt-1 h-10 w-full rounded-lg border border-earth-300"
            />
          </Field>
          {!showSpaCompensation ? (
            <Field label="月度空間費">
              <input
                name="monthlySpaceFee"
                type="number"
                min="0"
                defaultValue="0"
                className={inputClass}
              />
            </Field>
          ) : (
            <input type="hidden" name="monthlySpaceFee" value="0" />
          )}
        </section>
        {showSpaCompensation ? (
          <>
            <section className="border-t border-earth-100 pt-5">
              <h3 className="text-sm font-semibold text-earth-900">
                可服務項目
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {SPECIALTY_OPTIONS.map((option) => (
                  <label
                    key={option.key}
                    className={`cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm font-medium ${specialtyKeys.includes(option.key) ? "border-primary-600 bg-primary-50 text-primary-800" : "border-earth-200 text-earth-600"}`}
                  >
                    <input
                      type="checkbox"
                      name="spaSkillKeys"
                      value={option.key}
                      checked={specialtyKeys.includes(option.key)}
                      onChange={() => toggleSpecialty(option.key)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </section>
            <section className="border-t border-earth-100 pt-5">
              <h3 className="text-sm font-semibold text-earth-900">固定班表</h3>
              <div className={`${styles.weekdays} mt-3 grid gap-1.5`}>
                {WEEK_DAYS.map((day) => (
                  <label
                    key={day.dayOfWeek}
                    className={`cursor-pointer rounded-lg border py-2.5 text-center text-xs font-semibold ${days.includes(day.dayOfWeek) ? "border-primary-600 bg-primary-600 text-white" : "border-earth-200 text-earth-500"}`}
                  >
                    <input
                      type="checkbox"
                      name="spaAvailabilityDays"
                      value={day.dayOfWeek}
                      checked={days.includes(day.dayOfWeek)}
                      onChange={() => toggleDay(day.dayOfWeek)}
                      className="sr-only"
                    />
                    {day.short}
                  </label>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <Field label="開始">
                  <select
                    name="spaStartTime"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className={inputClass}
                  >
                    {TIME_OPTIONS.slice(0, -1).map((time) => (
                      <option key={time}>{time}</option>
                    ))}
                  </select>
                </Field>
                <span className="pb-2 text-earth-400">至</span>
                <Field label="結束">
                  <select
                    name="spaEndTime"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className={inputClass}
                  >
                    {TIME_OPTIONS.slice(1).map((time) => (
                      <option key={time}>{time}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>
            <section className="border-t border-earth-100 pt-5">
              <h3 className="text-sm font-semibold text-earth-900">抽成</h3>
              <input
                type="hidden"
                name="compensationMode"
                value={compensationMode}
              />
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ChoiceButton
                  active={!compensationEnabled}
                  label="不計抽成"
                  onClick={() => setCompensationEnabled(false)}
                />
                <ChoiceButton
                  active={
                    compensationEnabled && compensationMode === "PERCENTAGE"
                  }
                  label="服務比例"
                  onClick={() => {
                    setCompensationEnabled(true);
                    setCompensationMode("PERCENTAGE");
                  }}
                />
                <ChoiceButton
                  active={compensationEnabled && compensationMode === "FIXED"}
                  label="每位固定"
                  onClick={() => {
                    setCompensationEnabled(true);
                    setCompensationMode("FIXED");
                  }}
                />
              </div>
              <Field
                label={
                  compensationEnabled
                    ? compensationMode === "PERCENTAGE"
                      ? "抽成比例（%）"
                      : "每位抽成金額"
                    : "抽成金額"
                }
              >
                <input
                  name="compensationValue"
                  type="number"
                  min="0"
                  max={compensationMode === "PERCENTAGE" ? 100 : 1000000}
                  step={compensationMode === "PERCENTAGE" ? "0.1" : "1"}
                  value={compensationEnabled ? compensationValue : 0}
                  onChange={(event) =>
                    setCompensationValue(Number(event.target.value))
                  }
                  readOnly={!compensationEnabled}
                  required
                  className={`${inputClass} ${!compensationEnabled ? "bg-earth-50 text-earth-400" : ""}`}
                />
              </Field>
            </section>
          </>
        ) : null}
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
              request.pending || showSpaCompensation &&
              (specialtyKeys.length === 0 ||
                days.length === 0 ||
                startTime >= endTime)
            }
            className="bg-primary-600 text-white hover:bg-primary-700"
          />
        </div>
      </form>
    </Drawer>
  );
}

function PresetButton({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-earth-200 p-3 text-left hover:border-primary-300 hover:bg-primary-50"
    >
      <span className="block text-sm font-semibold text-earth-800">
        {label}
      </span>
      <span className="mt-0.5 block text-xs text-earth-400">{hint}</span>
    </button>
  );
}
function ChoiceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${active ? "border-primary-600 bg-primary-50 text-primary-800" : "border-earth-200 text-earth-600"}`}
    >
      {label}
    </button>
  );
}
function DrawerActions({
  onCancel,
  onSave,
  saveLabel,
  disabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
  disabled?: boolean;
}) {
  const guard=useContext(StaffSaveGuardContext);
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-earth-100 pt-4">
      <button
        type="button"
        disabled={guard.pending||guard.uncertain}
        onClick={onCancel}
        className="rounded-lg border border-earth-300 px-4 py-2 text-sm text-earth-700 hover:bg-earth-50"
      >
        取消
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled||guard.pending}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-earth-300"
      >
        {guard.pending?"儲存中…":guard.uncertain?"重試確認儲存結果":saveLabel}
      </button>
    </div>
  );
}
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const guard=useContext(StaffSaveGuardContext);
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
function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-earth-400">
        {title}
      </h3>
      <dl className="mt-2 space-y-3">{children}</dl>
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-earth-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-earth-700">{value}</dd>
    </div>
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
function initials(name: string): string {
  const badge = name.match(/^(\d+)號/);
  return badge ? badge[1] : name.replace(/\s+/g, "").slice(0, 2);
}
function specialtyLabel(key: SpaProviderSpecialty): string {
  return SPECIALTY_OPTIONS.find((option) => option.key === key)?.label ?? key;
}
function specialtySummary(
  keys: readonly SpaProviderSpecialty[],
  fallback: string,
): string | null {
  return keys.length > 0
    ? keys.map(specialtyLabel).join("・")
    : fallback === "尚未設定專業項目" || fallback === "門店營運管理"
      ? null
      : fallback;
}
function scheduleSummary(availability: readonly Availability[]): string | null {
  if (availability.length === 0) return null;
  const days = WEEK_DAYS.filter((day) =>
    availability.some((item) => item.dayOfWeek === day.dayOfWeek),
  )
    .map((day) => day.short)
    .join("、");
  const times = new Set(
    availability.map((item) => `${item.startTime}–${item.endTime}`),
  );
  return `週${days}・${times.size === 1 ? [...times][0] : "時段各異"}`;
}
function compensationSummary(
  mode: "PERCENTAGE" | "FIXED" | null,
  value: number | null,
): string | null {
  if (!mode || value === null) return null;
  if (value === 0) return "不計抽成";
  return mode === "PERCENTAGE"
    ? `服務金額 ${value}%`
    : `每位 NT$${value.toLocaleString()}`;
}
function formatDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  const date = new Date(`${dateStr}T00:00:00Z`);
  const label = ["日", "一", "二", "三", "四", "五", "六"][date.getUTCDay()];
  return `${Number(month)}/${Number(day)}（週${label}）`;
}
function clonePerson(person: StaffWorkspacePerson): StaffWorkspacePerson {
  return {
    ...person,
    specialtyKeys: [...person.specialtyKeys],
    weeklyAvailability: person.weeklyAvailability.map((item) => ({ ...item })),
    scheduleExceptions: person.scheduleExceptions.map((item) => ({ ...item })),
  };
}
