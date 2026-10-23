"use client";
import {CourseStaffBasicFields,CourseStaffPersonalFields,CourseStaffServiceRow} from "@/app/(dashboard)/dashboard/courses/staff-editor-fields";
import {CourseStaffAssignments} from "@/components/admin/course-staff-assignments";
import {usePathname} from "next/navigation";
import {toLocalDateStr} from "@/lib/date-utils";
import { useState, useTransition } from "react";
import {fitnessEditorFooter,fitnessEditorSave} from "@/components/admin/course-editor-styles";
import {CourseStaffEditorFrame,courseStaffEditorButton} from "@/app/(dashboard)/dashboard/courses/staff-editor-frame";
import {
  saveBeautyCatalog,
  saveBeautyLocation,
  saveBeautySettings,
} from "@/server/actions/beauty";
import type { BeautyDashboardData } from "@/server/beauty/queries";
export type EditorKind =
  "service" | "pricing" | "plan" | "technician" | "location" | "settings";
type Draft = {
  phone?:string;contactEmail?:string;birthday?:string;emergencyContactName?:string;emergencyContactPhone?:string;emergencyContactRelation?:string;
  pricingType?: "single" | "trial";
  id?: string;
  revision?: number;
  name?: string;
  category?: string;details?:string;equipment?:string;location?:string;
  duration?: number;
  buffer?: number;
  price?: number;
  trialPrice?: number | null;
  active?: boolean;
  isActive?: boolean;
  gender?: string;
  serviceIds?: string[];
  userId?: string | null;
  sort?: number;
  rates?: unknown;
  weekly?: unknown;
  exceptions?: unknown;
  grants?: string[];
  sessions?: number;
  validDays?: number;
  allowShared?: boolean;
  customerPurchasable?: boolean;
  lowBalanceEnabled?:boolean;lowBalanceThreshold?:number|null;
};
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 px-3 py-2 text-sm";
export function BeautyCatalogEditor({
  kind,
  data,
  draft:initialDraft = {},
  onClose,
  onSaved,
  readOnly=false,
  settingsSection="booking",
}: {
  kind: EditorKind;
  readOnly?:boolean;
  settingsSection?:"booking"|"notifications";
  data: BeautyDashboardData;
  draft?: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft,setConfirmedDraft]=useState(initialDraft);
  const [saveNotice,setSaveNotice]=useState("");
  const pathname=usePathname();
  const prefix=(pathname??"").split("/dashboard")[0];
  const [techTab,setTechTab]=useState("basic");
  const [error, setError] = useState(""),
    [pending, start] = useTransition(),
    [dirty, setDirty] = useState(false),
    [serviceIds, setServiceIds] = useState(draft.serviceIds ?? []);
  const [rates, setRates] = useState<
    Record<string, { mode: string; value: number; base?: string }>
  >(
    (draft.rates ?? {}) as Record<
      string,
      { mode: string; value: number; base?: string }
    >,
  );
  const [exceptions, setExceptions] = useState<
    { date: string; closed: boolean; start: string; end: string }[]
  >(
    Object.entries(
      (draft.exceptions ?? {}) as Record<
        string,
        { start: string; end: string }[]
      >,
    ).flatMap<{ date: string; closed: boolean; start: string; end: string }>(
      ([date, p]) =>
        p.length
          ? p.map((period) => ({ date, closed: false, ...period }))
          : [{ date, closed: true, start: "09:00", end: "18:00" }],
    ),
  );
  const title = {
    service: "服務項目",
    pricing: draft.pricingType==='single'?"單次收費":draft.pricingType==='trial'?"體驗收費":"單次／體驗收費",
    plan: "收費方式",
    technician: "技師管理",
    location: "位置管理",
    settings: "設定",
  }[kind];
  const [inheritHours,setInheritHours]=useState(!draft.id||(!Array.isArray(draft.weekly)&&(draft.weekly as {inheritStore?:boolean})?.inheritStore===true));
  const [weekly, setWeekly] = useState(
    (Array.isArray(draft.weekly)?draft.weekly:[]) as { day: number; start: string; end: string }[],
  );
  function close() {
    if (!pending && (!dirty || window.confirm("尚未儲存，確定離開？")))
      onClose();
  }
  return (
    <CourseStaffEditorFrame titleId="beauty-editor-title" title={<>{readOnly?'查看':draft.id?'編輯':'新增'}{kind==='technician'?'技師':title}{draft.id&&draft.name&&<span>・{draft.name}</span>}</>}
      onClose={close} locked={pending} width={kind==='technician'?920:640} fixedHeight={kind==='technician'}
      items={kind==='technician'?[["basic","基本資料"],["services","服務設定"],["work","LINE 與權限"],...(draft.id?[["schedule","服務明細"]]:[]),["availability","服務時間"]]:[]}
      value={techTab} onTabChange={setTechTab}>
      <form
        onInvalidCapture={e=>{const group=(e.target as HTMLElement).closest<HTMLElement>('[data-tech-tab]');if(group?.dataset.techTab){setTechTab(group.dataset.techTab);setError('請完成必填欄位後再儲存。');}}}
        id="beauty-catalog-form" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        onChange={() => {setDirty(true);setSaveNotice("");}}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending||readOnly) return;
          const f = new FormData(e.currentTarget),
            str = (k: string) => String(f.get(k) ?? ""),
            num = (k: string) => Number(f.get(k)),
            bool = (k: string) => f.get(k) === "on";
          if (
            exceptions.some(
              (e) =>
                e.closed &&
                exceptions.filter((other) => other.date === e.date).length > 1,
            )
          ) {
            setError("整日休假的日期不可同時設定服務時段");
            return;
          }
          const exceptionValues = Object.fromEntries(
            [...new Set(exceptions.map((e) => e.date))].map((date) => [
              date,
              exceptions
                .filter((e) => e.date === date && !e.closed)
                .map(({ start, end }) => ({ start, end })),
            ]),
          );
          start(async () => {
            try {
              let payload: unknown;
              if (kind === "settings")
                payload = {
                  ...data.policy,
                  revision: data.policy.revision,
                  selfBooking: bool("selfBooking"),
                  notifications: bool("notifications"),
                  selfCancel: bool("selfCancel"),
                  selfReschedule: bool("selfReschedule"),
                  cancelDeduct: bool("cancelDeduct"),
                  noShowDeduct: bool("noShowDeduct"),
                  leadMinutes: num("leadMinutes"),
                  cancelLeadMinutes: num("cancelLeadMinutes"),
                  bookableDays: num("bookableDays"),
                };
              else if (kind === "location")
                payload = {
                  id: draft.id,
                  name: str("name"),category:str("category"),details:str("details"),equipment:str("equipment"),location:str("location"),
                  active: bool("active"),
                };
              else if (kind === "service" || kind === "pricing")
                payload = {
                  id: draft.id,
                  revision: draft.revision ?? 0,
                  name: kind==='pricing'?draft.name:str("name"),
                  category: kind==='pricing'?draft.category:str("category"),
                  duration: kind==='pricing'?draft.duration:num("duration"),
                  buffer: kind==='pricing'?draft.buffer:num("buffer"),
                  price: kind==='service'||draft.pricingType==='trial'?(draft.price??0):num("price"),
                  trialPrice: kind==='service'||draft.pricingType==='single'?(draft.trialPrice??null):(str("trialPrice")===''?null:num("trialPrice")),
                  active: kind==='pricing'?draft.active:bool("active"),
                };
              else if (kind === "plan")
                payload = {
                  id: draft.id,
                  revision: draft.revision ?? 0,
                  name: str("name"),
                  sessions: num("sessions"),
                  lowBalanceEnabled:bool("lowBalanceEnabled"),
                  lowBalanceThreshold:str("lowBalanceThreshold")===""?null:num("lowBalanceThreshold"),
                  price: num("price"),
                  validDays: num("validDays"),
                  serviceIds,
                  allowShared: bool("allowShared"),
                  customerPurchasable: bool("customerPurchasable"),
                  active: bool("active"),
                };
              else
                payload = {
                  id: draft.id,
                  revision: draft.revision ?? 0,
                  name: str("name"),
                  gender: str("gender"),
                  phone:str("phone"),contactEmail:str("contactEmail"),birthday:str("birthday"),emergencyContactName:str("emergencyContactName"),emergencyContactPhone:str("emergencyContactPhone"),emergencyContactRelation:str("emergencyContactRelation"),
                  userId: str("userId") || null,
                  serviceIds,
                  sort: num("sort"),
                  weekly: inheritHours?{inheritStore:true}:weekly,
                  exceptions: exceptionValues,
                  rates: Object.fromEntries(
                    serviceIds.map((id) => [
                      id,
                      rates[id] ?? { mode: "FIXED", value: 0 },
                    ]),
                  ),
                  grants: ["complete", "cancel", "reschedule", "income"].filter(
                    (g) => bool(g),
                  ),
                  active: kind==='technician'?f.get("active")==="yes":bool("active"),
                };
              const r =
                kind === "settings"
                  ? await saveBeautySettings(payload)
                  : kind === "location"
                    ? await saveBeautyLocation(payload)
                    : await saveBeautyCatalog(kind==='pricing'?'service':kind, payload);
              if (r.success) {
                setDirty(false);
                if(kind==='technician'&&"record" in r.data&&r.data.record){setConfirmedDraft(r.data.record as Draft);setSaveNotice("已儲存 ✓");}
                onSaved();
              } else setError(r.error);
            } catch {
              setError("儲存失敗，輸入已保留，請重試");
            }
          });
        }}
      >
        <fieldset disabled={pending||readOnly} className="grid gap-4 sm:grid-cols-2">
          {kind !== "settings" && kind !== "pricing" && kind !== "technician" && (
            <div className="contents">
              <label>
                名稱
                <input
                  className={field}
                  name="name"
                  required
                  defaultValue={draft.name ?? ""}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={draft.active ?? draft.isActive ?? true}
                />
                啟用
              </label>
            </div>
          )}
          {kind==='location'&&<>{[['category','類別'],['location','位置說明'],['equipment','設備'],['details','備註']].map(([name,label])=><label key={name}>{label}<input className={field} name={name} defaultValue={String(draft[name as keyof Draft]??'')} maxLength={name==='details'?1000:name==='equipment'?500:300}/></label>)}</>}
          {kind === "service" && (
            <>
              <label>
                分類
                <input
                  className={field}
                  name="category"
                  defaultValue={draft.category ?? ""}
                />
              </label>
              <label>
                服務分鐘
                <input
                  className={field}
                  type="number"
                  min={5}
                  max={720}
                  required
                  name="duration"
                  defaultValue={draft.duration ?? 60}
                />
              </label>
              <label>
                整理分鐘（選填）
                <input
                  className={field}
                  type="number"
                  min={0}
                  max={240}
                  name="buffer"
                  defaultValue={draft.buffer ?? 0}
                />
              </label>
            </>
          )}
          {kind==='pricing'&&<><p className="sm:col-span-2 font-semibold">{draft.name}</p>              {draft.pricingType!=='trial'&&<label>
                單次價格
                <input
                  className={field}
                  type="number"
                  min={0}
                  required
                  name="price"
                  defaultValue={draft.price}
                />
              </label>}
              {draft.pricingType!=='single'&&<label>
                體驗價格（留空不開放）
                <input
                  className={field}
                  type="number"
                  min={0}
                  name="trialPrice"
                  defaultValue={draft.trialPrice ?? ""}
                />
              </label>}
</>}
          {kind === "plan" && (
            <>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="lowBalanceEnabled" defaultChecked={draft.lowBalanceEnabled??false}/>低可用次數提醒</label>
              <label>提醒門檻（次）<input className={field} name="lowBalanceThreshold" type="number" min={0} max={10000} defaultValue={draft.lowBalanceThreshold??''}/></label>
              <label>
                方案次數
                <input
                  className={field}
                  type="number"
                  min={1}
                  required
                  name="sessions"
                  defaultValue={draft.sessions}
                />
              </label>
              <label>
                售價
                <input
                  className={field}
                  type="number"
                  min={0}
                  required
                  name="price"
                  defaultValue={draft.price}
                />
              </label>
              <label>
                有效天數
                <input
                  className={field}
                  type="number"
                  min={1}
                  required
                  name="validDays"
                  defaultValue={draft.validDays}
                />
              </label>
              <label className="flex min-h-11 gap-2 items-center">
                <input
                  type="checkbox"
                  name="allowShared"
                  defaultChecked={draft.allowShared}
                />
                允許具名共用
              </label>
            </>
          )}
          {kind === "plan" && (
            <label className="flex min-h-11 gap-2 items-center">
              <input
                type="checkbox"
                name="customerPurchasable"
                defaultChecked={draft.customerPurchasable}
              />
              顧客可線上購買（轉帳核帳）
            </label>
          )}
          {kind === "technician" && (
            <>
              <div data-tech-tab="basic" className={techTab==='basic'?'contents':'hidden'}><CourseStaffBasicFields name={draft.name??''} active={draft.active!==false} phone={draft.phone??''}/>
              <CourseStaffPersonalFields beforeDetails={<label className="max-w-48">
                性別（必填）
                <select
                  className={field}
                  required
                  name="gender"
                  defaultValue={draft.gender ?? ""}
                >
                  <option value="" disabled>
                    請選擇
                  </option>
                  <option value="FEMALE">女性</option>
                  <option value="MALE">男性</option>
                </select>
              </label>} email={draft.contactEmail??''} birthday={draft.birthday??''} emergencyContactName={draft.emergencyContactName??''} emergencyContactPhone={draft.emergencyContactPhone??''} emergencyContactRelation={draft.emergencyContactRelation??''}>{              <label className="max-w-32">
                固定排序
                <input
                  className={field}
                  type="number"
                  min={0}
                  name="sort"
                  defaultValue={draft.sort ?? 0}
                />
              </label>}</CourseStaffPersonalFields>
              </div><div data-tech-tab="work" className={techTab==='work'?'contents':'hidden'}>
              <label>
                連結會員帳號
                <select
                  className={field}
                  name="userId"
                  defaultValue={draft.userId ?? ""}
                >
                  <option value="">尚未連結</option>
                  {data.customers
                    .filter((c) => c.userId)
                    .map((c) => (
                      <option key={c.id} value={c.userId!}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <fieldset className="@container/hours sm:col-span-2 space-y-2">
                <legend className="font-semibold">我的工作權限</legend>
                <div className="flex flex-wrap gap-4">
                  {[
                    ["complete", "服務完成／未到"],
                    ["cancel", "代客取消"],
                    ["reschedule", "代客改期"],
                    ["income", "查看本人收入"],
                  ].map(([id, label]) => (
                    <label
                      className="flex min-h-11 gap-2 items-center"
                      key={id}
                    >
                      <input
                        type="checkbox"
                        name={id}
                        defaultChecked={draft.grants?.includes(id) ?? false}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              </div><div data-tech-tab="availability" className={techTab==='availability'?'contents':'hidden'}>
              <fieldset className="sm:col-span-2 space-y-2">
                <legend>每週可服務時間</legend><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={inheritHours} onChange={e=>setInheritHours(e.target.checked)}/>沿用店家開放的服務時段</label><p className="text-sm text-earth-600">{inheritHours?'店家調整開放時間後自動沿用；休假與指定日期調班仍優先。':'依下方自訂時間安排，仍須符合店家開放時段。'}</p><fieldset disabled={inheritHours} hidden={inheritHours}>
                {weekly.map((p, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 items-center gap-2 @min-[32rem]/hours:grid-cols-[7rem_1fr_1fr_auto]"
                  >
                    <select
                      aria-label={`時段${i + 1}星期`}
                      className={field}
                      required
                      value={p.day}
                      onChange={(e) =>
                        setWeekly((ps) =>
                          ps.map((p, j) =>
                            i === j ? { ...p, day: Number(e.target.value) } : p,
                          ),
                        )
                      }
                    >
                      {Array.from({ length: 7 }, (_, day) => (
                        <option key={day} value={day}>
                          週{"日一二三四五六"[day]}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`時段${i + 1}開始`}
                      className={field}
                      required
                      type="time"
                      value={p.start}
                      onChange={(e) =>
                        setWeekly((ps) =>
                          ps.map((p, j) =>
                            i === j ? { ...p, start: e.target.value } : p,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={`時段${i + 1}結束`}
                      className={field}
                      required
                      type="time"
                      value={p.end}
                      onChange={(e) =>
                        setWeekly((ps) =>
                          ps.map((p, j) =>
                            i === j ? { ...p, end: e.target.value } : p,
                          ),
                        )
                      }
                    />
                    <button
                      className={field}
                      type="button"
                      onClick={() => {
                        setWeekly((ps) => ps.filter((_, j) => i !== j));
                        setDirty(true);
                      }}
                    >
                      移除
                    </button>
                  </div>
                ))}
                <button
                  className={field+" !w-auto mt-2"}
                  type="button"
                  onClick={() => {
                    setWeekly((ps) => [
                      ...ps,
                      { day: 1, start: "09:00", end: "18:00" },
                    ]);
                    setDirty(true);
                  }}
                >
                  新增每週服務時段
                </button>
                <p>
                  同一天可新增多段時間，例如上午與下午，中間休息不開放預約。
                </p>
                <p>未設定的日期不開放服務。</p>
              </fieldset></fieldset>
              </div>
            </>
          )}
          {kind==='technician'&&draft.id&&<section data-tech-tab="schedule" hidden={techTab!=='schedule'} className="sm:col-span-2"><CourseStaffAssignments fitness service label="已排服務" items={(data.technicianAssignments??[]).filter(row=>row.technicianId===draft.id)} itemHref={item=>`${prefix}/dashboard/beauty?tab=班表&date=${toLocalDateStr(new Date(item.startsAt))}&bookingId=${encodeURIComponent(item.id)}`}/></section>}
          {kind === "technician" && (
            <fieldset data-tech-tab="availability" className={"@container/hours space-y-3 sm:col-span-2 "+(techTab==='availability'?'':'hidden')}>
              <legend>指定日期休假／調班</legend>
              {exceptions.map((e, i) => (
                <div key={i} className="grid gap-2 @min-[32rem]/hours:grid-cols-4">
                  <input
                    aria-label="調班日期"
                    required
                    className={field}
                    type="date"
                    value={e.date}
                    onChange={(v) =>
                      setExceptions((es) =>
                        es.map((e, j) =>
                          i === j ? { ...e, date: v.target.value } : e,
                        ),
                      )
                    }
                  />
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={e.closed}
                      onChange={(v) =>
                        setExceptions((es) =>
                          es.map((e, j) =>
                            i === j ? { ...e, closed: v.target.checked } : e,
                          ),
                        )
                      }
                    />
                    整日休假
                  </label>
                  {!e.closed && (
                    <>
                      <input
                        aria-label="調班開始"
                        className={field}
                        type="time"
                        required
                        value={e.start}
                        onChange={(v) =>
                          setExceptions((es) =>
                            es.map((e, j) =>
                              i === j ? { ...e, start: v.target.value } : e,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label="調班結束"
                        className={field}
                        type="time"
                        required
                        value={e.end}
                        onChange={(v) =>
                          setExceptions((es) =>
                            es.map((e, j) =>
                              i === j ? { ...e, end: v.target.value } : e,
                            ),
                          )
                        }
                      />
                    </>
                  )}
                  <button
                    className={field}
                    type="button"
                    onClick={() =>
                      setExceptions((es) => es.filter((_, j) => i !== j))
                    }
                  >
                    移除
                  </button>
                </div>
              ))}
              <button
                className={field}
                type="button"
                onClick={() =>
                  setExceptions((es) => [
                    ...es,
                    { date: "", closed: true, start: "09:00", end: "18:00" },
                  ])
                }
              >
                新增休假／調班
              </button>
            </fieldset>
          )}
          {(kind === "plan" || kind === "technician") && (
            <fieldset data-tech-tab="services" className={"sm:col-span-2 space-y-3 "+(kind==='technician'&&techTab!=='services'?'hidden':'')}>
              <legend>
                {kind === "plan" ? "適用服務" : "可服務項目與拆帳"}
              </legend>
              {data.services.filter(s=>s.active||serviceIds.includes(s.id)).map((s) => (
                <CourseStaffServiceRow key={s.id} name={s.name} selected={serviceIds.includes(s.id)} inactiveLabel={!s.active?'已停用':undefined} wide onSelect={value=>{setServiceIds(ids=>value?[...ids,s.id]:ids.filter(id=>id!==s.id));setDirty(true);}}>
                  {kind === "technician" && data.access?.feeAccess!==false && serviceIds.includes(s.id) && (
                    <div className="grid min-w-0 gap-2 @min-[28rem]/service:grid-cols-[minmax(0,1fr)_8rem]">
                      <label className="space-y-1 text-sm">拆帳方式<select
                        aria-label={`${s.name}拆帳方式`}
                        className={field}
                        value={rates[s.id]?.mode ?? "FIXED"}
                        onChange={(e) =>
                          setRates((r) => ({
                            ...r,
                            [s.id]: {
                              mode: e.target.value,
                              value: r[s.id]?.value ?? 0,
                              ...(e.target.value === "PERCENT"
                                ? { base: "PAID" }
                                : {}),
                            },
                          }))
                        }
                      >
                        <option value="FIXED">每次固定金額</option>
                        <option value="HOURLY">固定鐘點（按服務分鐘）</option>
                        <option value="PERCENT">百分比</option>
                      </select></label>
                      <label className="space-y-1 text-sm">{rates[s.id]?.mode==='PERCENT'?'比例（%）':rates[s.id]?.mode==='HOURLY'?'每小時金額（元）':'每次金額（元）'}<input
                        aria-label={`${s.name}拆帳數值`}
                        className={field}
                        type="number"
                        min={0}
                        max={rates[s.id]?.mode === "PERCENT" ? 100 : 10000000}
                        step={rates[s.id]?.mode === "PERCENT" ? "0.01" : "1"}
                        value={rates[s.id]?.value ?? 0}
                        onChange={(e) =>
                          setRates((r) => ({
                            ...r,
                            [s.id]: {
                              ...(r[s.id] ?? { mode: "FIXED" }),
                              value: Number(e.target.value),
                            },
                          }))
                        }
                      /></label>
                      {rates[s.id]?.mode === "PERCENT" && (
                        <label className="space-y-1 text-sm @min-[28rem]/service:col-span-2">計算基準<select
                          aria-label={`${s.name}拆帳基準`}
                          className={field}
                          required
                          value={rates[s.id]?.base ?? "PAID"}
                          onChange={(e) =>
                            setRates((r) => ({
                              ...r,
                              [s.id]: { ...r[s.id], base: e.target.value },
                            }))
                          }
                        >
                          <option value="LIST">
                            按原價（方案定價÷總次數）
                          </option>
                          <option value="PAID">
                            按實收（方案實收÷總次數）
                          </option>
                        </select></label>
                      )}
                    </div>
                  )}
                </CourseStaffServiceRow>
              ))}
            </fieldset>
          )}
          {kind === "settings" && (
            <>
              {[
                ["notifications", "LINE 服務通知與前一天提醒"],
                ["selfBooking", "顧客自行預約"],
                ["selfCancel", "顧客自行取消"],
                ["selfReschedule", "顧客自行改期"],
                ["cancelDeduct", "取消扣次（未勾選不扣次）"],
                ["noShowDeduct", "未到扣次（未勾選不扣次）"],
              ].map(([key, label]) => (
                <label key={key} className={(key==='notifications'?settingsSection==='notifications':settingsSection==='booking')?"flex min-h-11 gap-2 items-center":"hidden"}>
                  <input
                    type="checkbox"
                    name={key}
                    defaultChecked={Boolean(
                      data.policy[key as keyof typeof data.policy],
                    )}
                  />
                  {label}
                </label>
              ))}
              {[
                ["leadMinutes", "提前預約分鐘"],
                ["cancelLeadMinutes", "取消截止分鐘"],
                ["bookableDays", "開放預約天數"],
              ].map(([key, label]) => (
                <label key={key} className={settingsSection==='booking'?'':'hidden'}>
                  {label}
                  <input
                    className={field}
                    type="number"
                    min={key === "bookableDays" ? 1 : 0}
                    required
                    name={key}
                    defaultValue={Number(
                      data.policy[key as keyof typeof data.policy],
                    )}
                  />
                </label>
              ))}
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </form>
      {!readOnly&&<footer className={fitnessEditorFooter}><div className="flex items-center justify-end gap-2"><span role="status" className="mr-auto text-sm text-earth-600">{pending?'儲存中…':dirty?'未儲存':saveNotice}</span><button type="button" className={courseStaffEditorButton} disabled={pending} onClick={close}>取消</button><button type="submit" form="beauty-catalog-form" className={courseStaffEditorButton+' '+fitnessEditorSave+' !border-primary-700 !bg-primary-700 !text-white'} disabled={pending}>{pending?'儲存中…':'儲存'}</button></div></footer>}
    </CourseStaffEditorFrame>
  );
}
