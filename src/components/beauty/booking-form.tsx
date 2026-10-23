"use client";
import {BeautyMemberBookingForm} from "./member-booking-form";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  bookBeautyParty,
  submitBeautyTrial,
  readBeautySlots,
} from "@/server/actions/beauty";
import {useCourseDraftGuard} from "@/components/admin/use-course-draft-guard";
import { toLocalDateStr } from "@/lib/date-utils";
import type { PartyInput } from "@/lib/beauty/contracts";
export type BeautyBookingCatalog = {
  policy?: {
    revision: number;
    selfBooking: boolean;
    selfCancel: boolean;
    selfReschedule: boolean;
    cancelDeduct: boolean;
    noShowDeduct: boolean;
    cancelLeadMinutes: number;
  };
  services: {
    id: string;
    name: string;
    duration: number;
    price: number;
    trialPrice: number | null;
    revision?: number;
  }[];
  locations?: {id:string;name:string}[];
  techs: { id: string; name: string; gender: string; serviceIds: string[] }[];
};
const control =
  "min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm";
const button =
  "min-h-11 rounded-lg border border-primary-300 px-4 py-2 text-base disabled:opacity-50";
function BeautyDetailedBookingForm({
  catalog,
  mode,
  slug,
  entry,
  customer,
  cards = [],
  members = [],
  onBooked,
  initialDate,initialTime,initialTechnicianId,initialLocationId,onStateChange,
}: {
  catalog: BeautyBookingCatalog;
  mode: "manager" | "member" | "public";
  slug: string;
  entry?: string;
  customer?: { id: string; name: string; phone: string } | null;
  cards?: {
    id: string;
    name: string;
    remaining: number;
    held: number;
    expiresAt: string;
    closed: boolean;
    memberIds: string[];
    serviceIds: string[];
    allowShared?:boolean;
  }[];
  members?: { id: string; name: string; phone: string }[];
  initialDate?:string;initialTime?:string;initialTechnicianId?:string;initialLocationId?:string;onStateChange?:(state:{dirty:boolean;pending:boolean})=>void;
  onBooked?: () => void;
}) {
  const [trial, setTrial] = useState(mode === "public"),
    [date, setDate] = useState(initialDate ?? toLocalDateStr()),
    [time, setTime] = useState(""),
    [slots, setSlots] = useState<string[]>([]),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<{ groupId: string; ids: string[] } | null>(
      null,
    ),
    [pending, start] = useTransition();
  const [dirty,setDirty]=useState(false);
  useCourseDraftGuard(dirty,pending);
  useEffect(()=>{onStateChange?.({dirty,pending});},[dirty,pending,onStateChange]);
  const blank = (): PartyInput["people"][number] => ({
    name: "",
    phone: "",
    customerId: null,
    serviceId:
      (mode === "public"
        ? catalog.services.find((s) => s.trialPrice !== null)
        : mode === "manager" && initialTechnicianId
          ? catalog.services.find(s=>catalog.techs.find(t=>t.id===initialTechnicianId)?.serviceIds.includes(s.id))
          : catalog.services[0]
      )?.id ?? "",
    serviceRevision: 0,
    preference: (mode === "manager" ? "ANY" : "") as PartyInput["people"][number]["preference"],
    specifiedTechnicianId: null,
    cardId: null,
    notes: "",
  });
  const [people, setPeople] = useState<PartyInput["people"]>([
    {
      ...blank(),
      specifiedTechnicianId: mode === "manager" ? initialTechnicianId ?? null : null,
      specifiedLocationId: mode === "manager" ? initialLocationId ?? null : null,
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      customerId: customer?.id ?? null,
    },
  ]);
  const [separateContact,setSeparateContact]=useState(false);
  const [contactName, setContactName] = useState(customer?.name ?? ""),
    [phone, setPhone] = useState(customer?.phone ?? "");
  const request = useRef(crypto.randomUUID()),
    generation = useRef(0),
    lock = useRef(false);
  function invalidate() {
    generation.current++;
    setSlots([]);
    setTime("");
    setError("");
    request.current = crypto.randomUUID();
  }
  function change(index: number, patch: Partial<PartyInput["people"][number]>) {
    invalidate();
    setPeople((p) =>
      p.map((person, i) => (i === index ? { ...person, ...patch } : person)),
    );
  }
  function data(): PartyInput {
    return {
      requestKey: request.current,
      date,
      time: time || "00:00",
      contactName: mode === "manager" && !separateContact ? people[0]?.name ?? "" : contactName,
      phone: mode === "manager" && !separateContact ? people[0]?.phone ?? "" : phone,
      isTrial: trial,
      policyRevision: catalog.policy?.revision ?? 0,
      people: people.map((p) => ({
        ...p,
        serviceRevision:
          catalog.services.find((s) => s.id === p.serviceId)?.revision ?? 0,
      })),
    };
  }
  function validate() {
    return (
      people.every(
        (p) =>
          p.serviceId &&
          p.preference &&
          p.name.trim() &&
          /^09\d{8}$/.test(p.phone),
      ) &&
      (mode === "manager" && !separateContact || contactName.trim() && /^09\d{8}$/.test(phone))
    );
  }
  function readSlots() {
    if (!validate()) {
      setError("請逐人填寫姓名、手機及服務項目");
      return;
    }
    const version = ++generation.current;
    start(async () => {
      const r = await readBeautySlots(mode, slug, data());
      if (version !== generation.current) return;
      if (r.success) {
        setSlots(r.data.slots);
        if(initialTime&&r.data.slots.includes(initialTime))setTime(initialTime);
        setError(
          r.data.slots.length ? "" : "當日沒有可安排全部同行者的時間，請換日期",
        );
      } else setError(r.error);
    });
  }
  if (mode !== "manager" && catalog.policy?.selfBooking === false)
    return <p>店家暫未開放自行預約，請聯絡店家安排。</p>;
  if (receipt)
    return (
      <section
        role="status"
        className="space-y-3 rounded-xl border border-primary-200 bg-primary-50 p-4"
      >
        <h2 className="font-semibold">預約成功</h2>
        <p>
          {date} {time}｜共{people.length}位
        </p>
        {people.map((p, i) => (
          <p key={i}>
            {p.name}：{catalog.services.find((s) => s.id === p.serviceId)?.name}
          </p>
        ))}
        <p>付款與服務狀態請向店家核對。</p>
        <button
          className={button}
          onClick={() => {
            setReceipt(null);
            invalidate();
          }}
        >
          再預約一筆
        </button>
      </section>
    );
  return (
    <form
      className="min-w-0 space-y-4"
      onChangeCapture={()=>setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault();
        if (lock.current || !time || !validate()) return;
        lock.current = true;
        start(async () => {
          try {
            const r =
              mode === "public"
                ? await submitBeautyTrial(slug, data(), entry)
                : await bookBeautyParty(mode, data());
            if (r.success) {
              setDirty(false);
              setReceipt(r.data);
              onBooked?.();
            } else setError(r.error);
          } catch {
            setError("連線失敗，請保留資料重試");
          } finally {
            lock.current = false;
          }
        });
      }}
    >
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            預約人數
            <select
              className={control}
              value={people.length}
              onChange={(e) => {
                const count = Number(e.target.value);
                invalidate();
                setPeople((p) =>
                  Array.from(
                    { length: count },
                    (_, i) => p[i] ?? { ...blank(), serviceId: p[0].serviceId },
                  ),
                );
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}人
                </option>
              ))}
            </select>
          </label>
          {mode !== "public" && (
            <label>
              預約類型
              <select
                className={control}
                value={trial ? "trial" : "regular"}
                onChange={(e) => {
                  setTrial(e.target.value === "trial");
                  invalidate();
                  setPeople((p) =>
                    p.map((person) => ({
                      ...person,
                      cardId: null,
                      specifiedTechnicianId: null,
                      serviceId:
                        (e.target.value === "trial"
                          ? catalog.services.find((s) => s.trialPrice !== null)
                          : catalog.services[0]
                        )?.id ?? "",
                    })),
                  );
                }}
              >
                <option value="regular">一般服務</option>
                <option value="trial">體驗服務</option>
              </select>
            </label>
          )}
        </div>
        {people.map((p, i) => (
          <section
            key={i}
            className="space-y-3 rounded-xl border border-earth-200 p-3"
          >
            <h3 className="font-semibold">第{i + 1}位</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {members.length > 0 && (
                <label>
                  服務者
                  <select
                    className={control}
                    value={p.customerId ?? ""}
                    onChange={(e) => {
                      const m = members.find((m) => m.id === e.target.value);
                      change(i, {
                        customerId: m?.id ?? null,
                        name: m?.name ?? "",
                        phone: m?.phone ?? "",
                        cardId: null,
                      });
                    }}
                  >
                    <option value="">其他同行者</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {mode === "manager" && p.customerId ? <details className="self-end"><summary className="flex min-h-11 cursor-pointer items-center text-sm text-earth-600">手機：{p.phone}</summary><p className="py-2 text-sm text-earth-500">顧客資料如需更正，請至顧客管理修改。</p></details> : <>              <label>
                姓名
                <input
                  required
                  className={control}
                  value={p.name}
                  onChange={(e) => change(i, { name: e.target.value })}
                />
              </label>
              <label>
                手機
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  pattern="09[0-9]{8}"
                  className={control}
                  value={p.phone}
                  onChange={(e) => change(i, { phone: e.target.value })}
                />
              </label>
</>}
              <label>
                服務項目
                <select
                  required
                  className={control}
                  value={p.serviceId}
                  onChange={(e) =>
                    change(i, {
                      serviceId: e.target.value,
                      specifiedTechnicianId: null,
                      cardId: null,
                    })
                  }
                >
                  {catalog.services
                    .filter((s) => !trial || s.trialPrice !== null)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}｜{s.duration}分鐘｜NT$
                        {trial ? s.trialPrice : s.price}
                      </option>
                    ))}
                </select>
              </label>
              {mode !== "manager" && <>              <label>
                技師性別（必選）
                <select
                  required
                  className={control}
                  value={p.preference}
                  onChange={(e) =>
                    change(i, {
                      preference: e.target.value as typeof p.preference,
                      specifiedTechnicianId: null,
                    })
                  }
                >
                  <option value="" disabled>
                    請選擇
                  </option>
                  <option value="FEMALE">女性技師</option>
                  <option value="MALE">男性技師</option>
                  <option value="ANY">男女皆可</option>
                </select>
              </label>
</>}
              <details className="self-end" open={p.specifiedTechnicianId?true:undefined}><summary className="flex min-h-11 cursor-pointer items-center text-sm text-primary-800">技師：{catalog.techs.find(t=>t.id===p.specifiedTechnicianId)?.name ?? '不指定'} · 修改</summary>              <label>
                <span className="sr-only">指定技師（選填）</span>
                <select
                  className={control}
                  value={p.specifiedTechnicianId ?? ""}
                  onChange={(e) =>
                    change(i, { specifiedTechnicianId: e.target.value || null })
                  }
                >
                  <option value="">不指定技師</option>
                  {catalog.techs
                    .filter(
                      (t) =>
                        t.serviceIds.includes(p.serviceId) &&
                        (mode === "manager" || p.preference === "ANY" || p.preference === t.gender),
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}（{t.gender === "FEMALE" ? "女" : "男"}）
                      </option>
                    ))}
                </select>
              </label>
</details>
              {!trial && cards.length > 0 && (
                <label>
                  付款／方案
                  <select
                    className={control}
                    value={p.cardId ?? ""}
                    onChange={(e) => {
                      const card = cards.find((c) => c.id === e.target.value);
                      change(i, {
                        cardId: card?.id ?? null,
                        customerId: p.customerId,
                      });
                    }}
                  >
                    <option value="">單次付款</option>
                    {cards
                      .filter(
                        (c) =>
                          !c.closed &&
                          c.remaining - c.held > 0 &&
                          c.serviceIds.includes(p.serviceId) &&
                          c.memberIds.includes(p.customerId ?? "") &&
                          new Date(c.expiresAt) > new Date(),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}｜可用{c.remaining - c.held}次
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {mode === "manager" && <label>位置<select className={control} aria-label={`第${i+1}位位置`} value={p.specifiedLocationId ?? ""} onChange={e=>change(i,{specifiedLocationId:e.target.value||null})}><option value="">自動安排</option>{catalog.locations?.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
              <label className="sm:col-span-2">
                本次備註（選填）
                <input
                  className={control}
                  value={p.notes}
                  maxLength={1000}
                  onChange={(e) => change(i, { notes: e.target.value })}
                />
              </label>
            </div>
          </section>
        ))}
        {mode === "manager" && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={separateContact} onChange={e=>{setSeparateContact(e.target.checked);invalidate();}}/>另設聯絡人</label>}
        <div className={`grid items-end gap-3 ${slots.length?"sm:grid-cols-3":"sm:grid-cols-2"}`}>
          {(mode !== "manager" || separateContact) && <>
          <label>
            聯絡人姓名
            <input
              required
              className={control}
              value={contactName}
              onChange={(e) => {
                setContactName(e.target.value);
                invalidate();
              }}
            />
          </label>
          <label>
            聯絡人手機
            <input
              required
              className={control}
              type="tel"
              pattern="09[0-9]{8}"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                invalidate();
              }}
            />
          </label>
</>}
          <label>
            日期
            <input
              required
              type="date"
              min={toLocalDateStr()}
              className={control}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                invalidate();
              }}
            />
          </label>
          {!!slots.length&&<label>開始時間<select className={control} required value={time} onChange={e=>setTime(e.target.value)}><option value="">請選擇時間</option>{slots.map(s=><option key={s} value={s}>{s}</option>)}</select></label>}
          <button type="button" className={button} onClick={readSlots}>
            查詢時段
          </button>
        </div>
        <p>
          共{people.length}位，{trial ? "體驗" : "一般"}原價合計 NT$
          {people.reduce((sum, p) => {
            const s = catalog.services.find((s) => s.id === p.serviceId);
            return sum + (s ? (trial ? (s.trialPrice ?? 0) : s.price) : 0);
          }, 0)}
          {time&&` · ${time}`}
        </p>
        <details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3">預約規則</summary>        {catalog.policy && (
          <p>
            取消{catalog.policy.cancelDeduct ? "扣1次" : "不扣次"}；未到
            {catalog.policy.noShowDeduct ? "扣1次" : "不扣次"}。
            {catalog.policy.selfCancel
              ? `自行取消須在服務前${catalog.policy.cancelLeadMinutes}分鐘完成。`
              : "取消請聯絡店家。"}
          </p>
        )}
        {trial && (
          <p>
            每人每項服務限體驗一次；有效預約、完成或未到占用資格，取消後可重新預約。
          </p>
        )}
</details>
        <button
          className={`${button} bg-primary-700 text-white`}
          disabled={!time || !catalog.services.length}
        >
          {pending ? "處理中…" : "確認預約"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

export function BeautyBookingForm(props:Parameters<typeof BeautyDetailedBookingForm>[0]&{onViewBookings?:()=>void}){
 if(props.mode==='member')return <BeautyMemberBookingForm {...props}/>;
 return <BeautyDetailedBookingForm {...props}/>;
}
