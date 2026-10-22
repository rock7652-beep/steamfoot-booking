"use client";
import {CustomerPanelTabs} from "@/components/admin/customer-panel-tabs";
import { useState, useTransition } from "react";
import {fitnessEditorFooter,fitnessEditorSave} from "@/components/admin/course-editor-styles";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  saveBeautyCatalog,
  saveBeautyLocation,
  saveBeautySettings,
} from "@/server/actions/beauty";
import type { BeautyDashboardData } from "@/server/beauty/queries";
export type EditorKind =
  "service" | "plan" | "technician" | "location" | "settings";
type Draft = {
  id?: string;
  revision?: number;
  name?: string;
  category?: string;
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
};
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 px-3 py-2 text-sm";
export function BeautyCatalogEditor({
  kind,
  data,
  draft = {},
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
    <RightSheet
      open
      className="fitness-management-editor"
      presentation="centered"
      width={900}
      onClose={close}
      labelledById="beauty-editor-title"
      closeOnEscape={!pending}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-earth-100 bg-primary-50/60 px-4 py-2">
        <h2 id="beauty-editor-title">
          {readOnly ? "查看" : draft.id ? "編輯" : "新增"}
          {title}
        </h2>
        <button
          className={field + " !w-auto"}
          disabled={pending}
          onClick={close}
        >
          關閉
        </button>
      </header>
      {kind==='technician'&&<CustomerPanelTabs ariaLabel="技師編輯分類" disabled={pending} value={techTab} items={[{id:'basic',label:'基本資料'},{id:'services',label:'服務與拆帳'},{id:'availability',label:'可服務時間'},{id:'work',label:'會員與工作權限'}]} onSelect={setTechTab}/>}
      <form
        onInvalidCapture={e=>{const group=(e.target as HTMLElement).closest<HTMLElement>('[data-tech-tab]');if(group?.dataset.techTab){setTechTab(group.dataset.techTab);setError('請完成必填欄位後再儲存。');}}}
        className="min-h-0 overflow-y-auto p-4"
        onChange={() => setDirty(true)}
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
                  name: str("name"),
                  active: bool("active"),
                };
              else if (kind === "service")
                payload = {
                  id: draft.id,
                  revision: draft.revision ?? 0,
                  name: str("name"),
                  category: str("category"),
                  duration: num("duration"),
                  buffer: num("buffer"),
                  price: num("price"),
                  trialPrice:
                    str("trialPrice") === "" ? null : num("trialPrice"),
                  active: bool("active"),
                };
              else if (kind === "plan")
                payload = {
                  id: draft.id,
                  revision: draft.revision ?? 0,
                  name: str("name"),
                  sessions: num("sessions"),
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
                  active: bool("active"),
                };
              const r =
                kind === "settings"
                  ? await saveBeautySettings(payload)
                  : kind === "location"
                    ? await saveBeautyLocation(payload)
                    : await saveBeautyCatalog(kind, payload);
              if (r.success) {
                setDirty(false);
                onSaved();
              } else setError(r.error);
            } catch {
              setError("儲存失敗，輸入已保留，請重試");
            }
          });
        }}
      >
        <fieldset disabled={pending||readOnly} className="grid gap-4 sm:grid-cols-2">
          {kind !== "settings" && (
            <div className={kind!=="technician"||techTab==="basic"?"contents":"hidden"} data-tech-tab="basic">
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
              <label>
                單次價格
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
                體驗價格（留空不開放）
                <input
                  className={field}
                  type="number"
                  min={0}
                  name="trialPrice"
                  defaultValue={draft.trialPrice ?? ""}
                />
              </label>
            </>
          )}
          {kind === "plan" && (
            <>
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
              <div data-tech-tab="basic" className={techTab==='basic'?'contents':'hidden'}>
              <label>
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
              </label>
              <label>
                固定排序
                <input
                  className={field}
                  type="number"
                  min={0}
                  name="sort"
                  defaultValue={draft.sort ?? 0}
                />
              </label>
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
              <fieldset className="sm:col-span-2 space-y-2">
                <legend>我的工作權限</legend>
                <div className="flex flex-wrap gap-4">
                  {[
                    ["complete", "服務完成／更正"],
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
                    className="grid grid-cols-2 gap-2 sm:grid-cols-4"
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
                      移除此時段
                    </button>
                  </div>
                ))}
                <button
                  className={field}
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
          {kind === "technician" && (
            <fieldset data-tech-tab="availability" className={"space-y-3 sm:col-span-2 "+(techTab==='availability'?'':'hidden')}>
              <legend>指定日期休假／調班</legend>
              {exceptions.map((e, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-4">
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
              {data.services.map((s) => (
                <div key={s.id} className="space-y-2 border-b py-2">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={serviceIds.includes(s.id)}
                      onChange={(e) => {
                        setServiceIds((ids) =>
                          e.target.checked
                            ? [...ids, s.id]
                            : ids.filter((id) => id !== s.id),
                        );
                        setDirty(true);
                      }}
                    />
                    {s.name}
                  </label>
                  {kind === "technician" && serviceIds.includes(s.id) && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select
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
                      </select>
                      <input
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
                      />
                      {rates[s.id]?.mode === "PERCENT" && (
                        <select
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
                        </select>
                      )}
                    </div>
                  )}
                </div>
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
          {!readOnly&&<div className={fitnessEditorFooter+" sticky bottom-0 flex justify-end gap-3 sm:col-span-2"}>
            <button className={fitnessEditorSave+" bg-primary-700 text-white"}>
              {pending ? "儲存中…" : "儲存"}
            </button>
            <button type="button" className={fitnessEditorSave+" border border-earth-200"} onClick={close}>
              取消
            </button>
          </div>}
        </fieldset>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </form>
    </RightSheet>
  );
}
