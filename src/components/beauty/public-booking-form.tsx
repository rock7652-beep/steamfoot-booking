"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Ref } from "react";
import { readBeautySlots, submitBeautyTrial } from "@/server/actions/beauty";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import { formatTWDateTime, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";
import { normalizePhone } from "@/lib/normalize";
import { normalizeLineOfficialUrl } from "@/lib/line-official-url";
import { serviceDuration } from "@/lib/beauty/service-duration";
import type { PartyInput } from "@/lib/beauty/contracts";
import type { BeautyBookingCatalog } from "./booking-form";
import styles from "./public-booking-form.module.css";
import { PublicBookingCalendar } from "@/components/public-trial/public-booking-calendar";
import ui from "@/components/public-trial/public-trial.module.css";
import { BookingLineEntry } from "@/components/booking-line-entry";

export type PublicBookingInfo = { address?: string; mapUrl?: string; contactUrl?: string; massageReminder?: boolean; lineEntryHref?: string; lineIdentityVerified?: boolean };
type Person = { key: number; name: string; phone: string; serviceId: string; arrangement: string; technicianId: string; notes: string };
type Errors = Record<string, string>;
type Props = {
  catalog: BeautyBookingCatalog; slug: string; entry?: string; publicInfo?: PublicBookingInfo;
  readSlots?: typeof readBeautySlots; submitTrial?: typeof submitBeautyTrial;
};
const cash = (value: number) => `NT$${value.toLocaleString("zh-TW")}`;
function safeMap(value?: string) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function Summary({ catalog, date, time, people, showNames = false, headingRef }: { catalog: BeautyBookingCatalog; date: string; time: string; people: Person[]; showNames?: boolean; headingRef?: Ref<HTMLHeadingElement> }) {
  const start = parseTaipeiDateTime(date, time);
  return <section className={`${styles.card} ${styles.summary}`} aria-label="預約摘要">
    <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>預約摘要</h2><p>{date} · 共 {people.length} 位</p>
    {people.map((p, i) => {
      const service = catalog.services.find(s => s.id === p.serviceId);
      const end = start && service ? formatTWDateTime(new Date(+start + serviceDuration(service, true) * 60000)) : "";
      const technician = catalog.techs.find(t => t.id === p.technicianId);
      const arranged = p.arrangement === "SPECIFIC" ? technician?.name : p.arrangement === "FEMALE" ? "女性技師" : p.arrangement === "MALE" ? "男性技師" : "男女皆可，由店家安排";
      return <div key={p.key}>{(people.length > 1 || showNames) && <strong>{showNames ? p.name : `第 ${i + 1} 位`}</strong>}<dl>
        <dt>服務</dt><dd>{service?.name} · {service && serviceDuration(service, true)} 分鐘</dd>
        <dt>時間</dt><dd>{time}–{end.startsWith(date) ? end.slice(11) : end}（預計）</dd>
        <dt>技師</dt><dd>{arranged}</dd>{people.length > 1 && <><dt>體驗價</dt><dd>{cash(service?.trialPrice ?? 0)}</dd></>}
      </dl></div>;
    })}
    <div className={styles.total}>體驗總額 {cash(people.reduce((sum, p) => sum + (catalog.services.find(s => s.id === p.serviceId)?.trialPrice ?? 0), 0))}</div>
  </section>;
}

export function BeautyPublicBookingForm({ catalog, slug, entry, publicInfo, readSlots = readBeautySlots, submitTrial = submitBeautyTrial }: Props) {
  const services = catalog.services.filter(s => s.trialPrice !== null);
  const formId = useId();
  const sequence = useRef(1), requestKey = useRef(crypto.randomUUID()), generation = useRef(0), lock = useRef(false);
  const blank = (key: number, serviceId = services[0]?.id ?? ""): Person => ({ key, name: "", phone: "", serviceId, arrangement: "", technicianId: "", notes: "" });
  const [people, setPeople] = useState<Person[]>(() => [blank(0)]);
  const [date, setDate] = useState(toLocalDateStr), [time, setTime] = useState("");
  const [stage, setStage] = useState<"service" | "contact" | "success">("service");
  const previousStage = useRef(stage), stageHeading = useRef<HTMLHeadingElement>(null);
  const [slots, setSlots] = useState<string[]>([]), [queried, setQueried] = useState(false), [loading, setLoading] = useState(false);
  const [separateContact, setSeparateContact] = useState(false), [contactName, setContactName] = useState(""), [contactPhone, setContactPhone] = useState("");
  const [errors, setErrors] = useState<Errors>({}), [error, setError] = useState(""), [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false);
  const submission = useRef<PartyInput | null>(null);
  const [notificationLinked, setNotificationLinked] = useState(false);
  useCourseDraftGuard(stage !== "success", pending || uncertain);
  const contactUrl = normalizeLineOfficialUrl(publicInfo?.contactUrl), mapUrl = safeMap(publicInfo?.mapUrl);
  const fieldId = (key: string) => `${formId}-${key}`;
  useEffect(() => {
    const first = Object.keys(errors)[0];
    let scrollFrame: number | undefined;
    if (first) document.getElementById(`${formId}-${first}`)?.focus();
    else if (previousStage.current !== stage) {
      // Focus alone only brings the heading into view; it does not reset the
      // scroll offset retained when a mobile browser replaces the step.
      stageHeading.current?.focus({ preventScroll: true });
      stageHeading.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
      scrollFrame = window.requestAnimationFrame(() => stageHeading.current?.scrollIntoView?.({ block: "start", behavior: "instant" }));
    }
    previousStage.current = stage;
    return () => { if (scrollFrame !== undefined) window.cancelAnimationFrame(scrollFrame); };
  }, [errors, formId, stage]);
  const fieldProps = (key: string) => ({ id: fieldId(key), "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? fieldId(`${key}-error`) : undefined });
  const hint = (key: string) => errors[key] ? <p className={styles.error} id={fieldId(`${key}-error`)}>{errors[key]}</p> : null;
  function edit(invalidateSlots = false) {
    if (lock.current || uncertain) return false;
    requestKey.current = crypto.randomUUID(); setError(""); setErrors({});
    if (invalidateSlots) { generation.current++; setSlots([]); setTime(""); setQueried(false); setLoading(false); }
    return true;
  }
  function change(key: number, patch: Partial<Person>, invalidateSlots = false) {
    if (!edit(invalidateSlots)) return;
    // A phone affects eligibility. Ignore a read started with the previous phone,
    // but keep an already chosen time; submission always rechecks eligibility.
    if (patch.phone !== undefined) { generation.current++; setLoading(false); }
    setPeople(previous => previous.map(p => p.key === key ? { ...p, ...patch } : p));
  }
  function preference(p: Person): PartyInput["people"][number]["preference"] {
    if (p.arrangement === "SPECIFIC") return catalog.techs.find(t => t.id === p.technicianId)?.gender === "MALE" ? "MALE" : "FEMALE";
    return p.arrangement as PartyInput["people"][number]["preference"];
  }
  function validate(contact = false) {
    const next: Errors = {};
    const identities = new Set<string>();
    if (!parseTaipeiDateTime(date, "00:00") || date < toLocalDateStr()) next.date = "請選擇今天或之後的日期";
    people.forEach(p => {
      if (!services.some(s => s.id === p.serviceId)) next[`${p.key}-service`] = "請選擇可預約的體驗服務";
      if (!/^09\d{8}$/.test(normalizePhone(p.phone))) next[`${p.key}-phone`] = "請填寫 09 開頭的 10 碼手機";
      const identity = `${normalizePhone(p.phone)}:${p.serviceId}`;
      if (identities.has(identity)) next[`${p.key}-phone`] = "同一手機不可重複預約相同體驗服務";
      identities.add(identity);
      if (!["ANY", "FEMALE", "MALE", "SPECIFIC"].includes(p.arrangement)) next[`${p.key}-arrangement`] = "請選擇技師安排方式";
      if (p.arrangement === "SPECIFIC" && !catalog.techs.some(t => t.id === p.technicianId && t.serviceIds.includes(p.serviceId))) next[`${p.key}-technician`] = "請選擇提供此服務的技師";
      if (contact && (!p.name.trim() || p.name.trim().length > 80)) next[`${p.key}-name`] = "請填寫姓名（最多 80 字）";
    });
    if (contact && separateContact) {
      if (!contactName.trim() || contactName.trim().length > 80) next.contactName = "請填寫聯絡人姓名（最多 80 字）";
      if (!/^09\d{8}$/.test(normalizePhone(contactPhone))) next.contactPhone = "請填寫有效的聯絡人手機";
    }
    if (contact && (!time || !slots.includes(time))) next.time = "請先選擇可預約的時段";
    setErrors(next);
    if (contact && Object.keys(next).some(key => !key.endsWith("-name") && !key.endsWith("-phone") && !key.startsWith("contact"))) setStage("service");
    return Object.keys(next).length === 0;
  }
  async function query() {
    if (lock.current || !validate()) return;
    const version = ++generation.current; setLoading(true); setError("");
    try {
      const result = await readSlots("public", slug, { date, isTrial: true, people: people.map(p => ({ phone: normalizePhone(p.phone), serviceId: p.serviceId, serviceRevision: catalog.services.find(s => s.id === p.serviceId)?.revision ?? 0, preference: preference(p), specifiedTechnicianId: p.arrangement === "SPECIFIC" ? p.technicianId : null })) });
      if (version !== generation.current) return;
      setQueried(true);
      if (result.success) { setSlots(result.data.slots); setTime(current => result.data.slots.includes(current) ? current : ""); }
      else { setError(result.error); setSlots([]); setTime(""); }
    } catch { if (version === generation.current) setError("時段讀取失敗，請重試；已填資料會保留。"); }
    finally { if (version === generation.current) setLoading(false); }
  }
  function payload(): PartyInput {
    return { requestKey: requestKey.current, policyRevision: catalog.policy?.revision ?? 0, date, time,
      isTrial: true, contactName: (separateContact ? contactName : people[0].name).trim(), phone: normalizePhone(separateContact ? contactPhone : people[0].phone),
      people: people.map(p => ({ name: p.name.trim(), phone: normalizePhone(p.phone), serviceId: p.serviceId, serviceRevision: catalog.services.find(s => s.id === p.serviceId)?.revision ?? 0, preference: preference(p), specifiedTechnicianId: p.arrangement === "SPECIFIC" ? p.technicianId : null, customerId: null, cardId: null, notes: p.notes })),
    };
  }
  async function submit() {
    if (lock.current || stage !== "contact" || !uncertain && !validate(true)) return;
    lock.current = true; setPending(true); setError("");
    const sent = uncertain && submission.current ? submission.current : payload(); submission.current = sent;
    try {
      const result = await submitTrial(slug, sent, entry);
      setUncertain(false);
      if (result.success) { generation.current++; setNotificationLinked("notificationSetup" in result.data && (result.data.notificationSetup as { status?: string })?.status === "linked"); setStage("success"); }
      else setError(result.error);
    } catch { setUncertain(true); setError("尚未確認預約結果，請按「重試確認」。我們會核對同一筆預約，避免重複建立。"); }
    finally { lock.current = false; setPending(false); }
  }
  async function retryNotification() {
    if (lock.current || stage !== "success" || !entry || !submission.current) return;
    lock.current = true; setPending(true); setError("");
    try {
      // The identical requestKey/payload reopens only the committed command.
      // The backend repairs identity without creating another reservation.
      const result = await submitTrial(slug, submission.current, entry);
      const linked = result.success && "notificationSetup" in result.data && (result.data.notificationSetup as { status?: string })?.status === "linked";
      setNotificationLinked(linked);
      if (!linked) setError("預約已保留，LINE 連結尚未完成；請稍後重試或聯繫店家。");
    } catch { setError("預約已保留，暫時無法確認 LINE 連結；請稍後再試。"); }
    finally { lock.current = false; setPending(false); }
  }
  if (catalog.policy?.selfBooking === false) return <section className={ui.empty}><h2>店家暫未開放自行預約</h2><p>請聯絡店家安排適合的體驗時間。</p>{contactUrl && <a href={contactUrl}>聯絡店家</a>}</section>;
  if (!services.length) return <section className={ui.empty}><h2>目前尚無可預約的體驗服務</h2><p>請聯絡店家確認可預約的項目。</p>{contactUrl && <a href={contactUrl} target="_blank" rel="noopener noreferrer">聯絡店家</a>}</section>;
  if (stage === "success") return <section className={styles.success} aria-label="預約成功" role="status">
    <span className={ui.successMark} aria-hidden="true">✓</span><h2 ref={stageHeading} tabIndex={-1}>預約成功</h2><p className={ui.note}>已為你保留這段時間，期待到店見面。</p><Summary catalog={catalog} date={date} time={time} people={people} showNames/>
    <div className={styles.card}><h3>到店前再確認</h3><p>請依預約時間到店，付款方式與服務注意事項請向門市確認。</p><p>聯絡人：{separateContact ? contactName.trim() : people[0].name.trim()} · {normalizePhone(separateContact ? contactPhone : people[0].phone)}</p>
      <p className="font-semibold">{notificationLinked ? "LINE 通知已連結" : "預約已成功，LINE 通知尚未連結"}</p>
      <p>{notificationLinked ? "不必再輸入電話。請加入本店官方 LINE 並保持未封鎖，提醒依店家設定發送。" : "您的預約已保留。請透過官方 LINE 聯繫店家核對通知身分，無須重複預約。"}</p>
      {!notificationLinked && entry && <button type="button" disabled={pending} onClick={() => void retryNotification()}>{pending ? "確認連結中…" : "重新確認 LINE 連結"}</button>}
      {error && <p role="alert">{error}</p>}
      {publicInfo?.address && <p>{publicInfo.address}</p>}<div className={styles.actions}>
        {contactUrl && <a href={contactUrl} target="_blank" rel="noopener noreferrer">聯絡店家</a>}
        {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer">查看地圖</a>}
        <a href={`/s/${slug}/beauty`}>會員專區（需登入）</a>
      </div>
    </div>{entry
      ? <a href={publicInfo?.lineEntryHref ?? `/beauty-trial/${encodeURIComponent(slug)}`} aria-disabled={pending} onClick={event => { if (lock.current) event.preventDefault(); }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-earth-200 bg-white px-4 py-2">再預約一筆</a>
      : <button type="button" disabled={pending} onClick={() => { if (lock.current) return; requestKey.current = crypto.randomUUID(); setPeople([blank(sequence.current++)]); setTime(""); setSlots([]); setQueried(false); setSeparateContact(false); setContactName(""); setContactPhone(""); setStage("service"); setErrors({}); setError(""); }}>再預約一筆</button>}
  </section>;
  return <form id="booking-form" noValidate className={styles.form} onSubmit={event => { event.preventDefault(); if (stage === "service") void query(); else void submit(); }}>
    {stage === "service" && <BookingLineEntry href={publicInfo?.lineEntryHref} verified={publicInfo?.lineIdentityVerified} friendHref={contactUrl ?? undefined}/>}
    <ol className={styles.steps} aria-label="預約步驟"><li aria-current={stage === "service" ? "step" : undefined}>1 服務與時段</li><li aria-current={stage === "contact" ? "step" : undefined}>2 聯絡與確認</li></ol>
    <fieldset disabled={pending || uncertain}>
      {stage === "service" ? <>
        <section aria-label="服務安排"><h2 ref={stageHeading} tabIndex={-1}>選擇體驗服務 · {people.length} 位</h2><p className={ui.note}>先選擇服務與技師安排；手機用於核對首次體驗資格。</p>
          <div className={styles.form}>{people.map((p, index) => <section className={styles.card} key={p.key} aria-label={`服務安排 ${index + 1}`}>
            {people.length > 1 && <div className={styles.heading}><h3>第 {index + 1} 位</h3>{index > 0 && <button type="button" aria-label={`移除第 ${index + 1} 位`} onClick={() => { if (edit(true)) setPeople(previous => previous.filter(item => item.key !== p.key)); }}>移除</button>}</div>}
            <div className={styles.grid}>
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}><span id={fieldId(`${p.key}-service-label`)}>服務項目</span>
                <div id={fieldId(`${p.key}-service`)} className={ui.choices} role="group" aria-labelledby={fieldId(`${p.key}-service-label`)} tabIndex={-1} data-invalid={!!errors[`${p.key}-service`]}>
                  {services.map(service => <label className={ui.choice} key={service.id}>
                    <input type="radio" name={fieldId(`${p.key}-service-choice`)} value={service.id} aria-label={service.name} aria-describedby={errors[`${p.key}-service`] ? fieldId(`${p.key}-service-error`) : undefined} checked={p.serviceId === service.id}
                      onChange={() => change(p.key, { serviceId: service.id, technicianId: "" }, true)} />
                    <span className={ui.choiceTitle}>{service.name}</span><span className={ui.choiceMeta}>{serviceDuration(service, true)} 分鐘</span><span className={ui.choicePrice}>{cash(service.trialPrice!)}</span>
                    {p.serviceId === service.id && <span className={ui.choiceCheck} aria-hidden="true">✓</span>}
                  </label>)}
                </div>{hint(`${p.key}-service`)}</div>
              <div className={styles.field}><label htmlFor={fieldId(`${p.key}-phone`)}>手機</label><input {...fieldProps(`${p.key}-phone`)} autoComplete={index === 0 ? "tel-national" : "off"} inputMode="tel" type="tel" maxLength={30} placeholder="09xxxxxxxx" value={p.phone} onChange={e => change(p.key, { phone: e.target.value })}/>{hint(`${p.key}-phone`)}</div>
              <div className={styles.field}><label htmlFor={fieldId(`${p.key}-arrangement`)}>技師安排</label><select {...fieldProps(`${p.key}-arrangement`)} value={p.arrangement} onChange={e => change(p.key, { arrangement: e.target.value, technicianId: "" }, true)}><option value="" disabled>請選擇</option><option value="ANY">男女皆可</option><option value="FEMALE">女性技師</option><option value="MALE">男性技師</option><option value="SPECIFIC">指定技師</option></select>{hint(`${p.key}-arrangement`)}</div>
              {p.arrangement === "SPECIFIC" && <div className={styles.field}><label htmlFor={fieldId(`${p.key}-technician`)}>選擇技師</label><select {...fieldProps(`${p.key}-technician`)} value={p.technicianId} onChange={e => change(p.key, { technicianId: e.target.value }, true)}><option value="" disabled>請選擇技師</option>{catalog.techs.filter(t => t.serviceIds.includes(p.serviceId)).map(t => <option key={t.id} value={t.id}>{t.name}（{t.gender === "FEMALE" ? "女" : "男"}）</option>)}</select>{hint(`${p.key}-technician`)}</div>}
            </div>
          </section>)}</div>
          <button type="button" className={styles.addCompanion} disabled={people.length >= 12} onClick={() => { if (edit(true)) setPeople(previous => [...previous, blank(sequence.current++, previous[0].serviceId)]); }}>＋新增同行者</button>
        </section>
        <section className={styles.form} aria-label="日期與時段"><h2>選擇日期與時段</h2><div className={styles.field}>
          <PublicBookingCalendar id={fieldId("date")} value={date} onChange={value => { if (edit(true)) setDate(value); }} invalid={!!errors.date} describedBy={errors.date ? fieldId("date-error") : undefined}/>{hint("date")}</div>
          <button type="button" disabled={loading} onClick={() => void query()}>{loading ? "查詢時段中…" : queried ? "重新查詢時段" : "查詢可用時段"}</button>
          {loading && <p role="status">正在確認可用時段…</p>}
          {queried && !loading && !slots.length && !error && <p role="status">當日沒有可安排全部同行者的時段，請換日期或調整技師安排。</p>}
          {!!slots.length && <div className={styles.slots} role="group" aria-label="可用時段">{slots.map(slot => <button type="button" key={slot} aria-pressed={time === slot} onClick={() => { if (edit()) setTime(slot); }}>{slot}</button>)}</div>}
          {hint("time")}<button type="button" className="primary" disabled={!time || loading} onClick={() => { if (validate()) { setStage("contact"); setError(""); } }}>下一步：填寫聯絡資料</button>
        </section>
      </> : <>
        <Summary catalog={catalog} date={date} time={time} people={people} headingRef={stageHeading}/>
        <section className={styles.form} aria-label="聯絡資料"><h2>聯絡資料</h2>
          {people.map((p, index) => <section key={p.key} className={styles.card} aria-label={`聯絡資料 ${index + 1}`}>
            {people.length > 1 && <h3>第 {index + 1} 位</h3>}<div className={styles.grid}>
              <div className={styles.field}><label htmlFor={fieldId(`${p.key}-name`)}>姓名</label><input {...fieldProps(`${p.key}-name`)} autoComplete={index === 0 ? "name" : "off"} maxLength={80} value={p.name} onChange={e => change(p.key, { name: e.target.value })}/>{hint(`${p.key}-name`)}</div>
              <div className={styles.field}><label htmlFor={fieldId(`${p.key}-phone`)}>手機</label><input {...fieldProps(`${p.key}-phone`)} type="tel" inputMode="tel" autoComplete={index === 0 ? "tel-national" : "off"} maxLength={30} value={p.phone} onChange={e => change(p.key, { phone: e.target.value })}/>{hint(`${p.key}-phone`)}</div>
            </div><details><summary>特殊需求／備註（選填）</summary><div className={styles.field}><label htmlFor={fieldId(`${p.key}-notes`)}>本次備註</label><textarea id={fieldId(`${p.key}-notes`)} rows={3} maxLength={1000} value={p.notes} onChange={e => change(p.key, { notes: e.target.value })}/><p>請勿填寫敏感醫療資料。</p></div></details>
          </section>)}
          <label className={styles.check}><input type="checkbox" checked={separateContact} onChange={e => { if (edit()) setSeparateContact(e.target.checked); }}/>另設聯絡人</label>
          {separateContact ? <div className={styles.grid}><div className={styles.field}><label htmlFor={fieldId("contactName")}>聯絡人姓名</label><input {...fieldProps("contactName")} maxLength={80} value={contactName} onChange={e => { if (edit()) setContactName(e.target.value); }}/>{hint("contactName")}</div><div className={styles.field}><label htmlFor={fieldId("contactPhone")}>聯絡人手機</label><input {...fieldProps("contactPhone")} type="tel" inputMode="tel" maxLength={30} value={contactPhone} onChange={e => { if (edit()) setContactPhone(e.target.value); }}/>{hint("contactPhone")}</div></div> : people.length > 1 ? <p>聯絡人沿用第 1 位資料。</p> : null}
        </section>
        <details><summary>預約規則</summary><p>每人每項服務限體驗一次。取消後可重新預約；未到仍視為使用體驗資格。</p><p>{catalog.policy?.selfCancel ? `最晚可於服務前 ${catalog.policy.cancelLeadMinutes >= 60 && catalog.policy.cancelLeadMinutes % 60 === 0 ? `${catalog.policy.cancelLeadMinutes / 60} 小時` : `${catalog.policy.cancelLeadMinutes} 分鐘`}自行取消；請從會員專區操作，或聯絡店家協助。` : "如需取消，請聯絡店家。"}</p></details>
        <p>姓名及手機用於本次預約與聯繫。<a href="/privacy" target="_blank" rel="noopener noreferrer">隱私權政策</a></p>
      </>}
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {stage === "contact" && publicInfo?.massageReminder && <aside className={styles.massageReminder} aria-labelledby={fieldId("massage-reminder-title")}>
      <h2 id={fieldId("massage-reminder-title")}>按摩小提醒</h2>
      <ul>
        <li>有需留意的身體狀況，請先與店家確認。</li>
        <li>需避開的部位、皮膚不適或用品過敏，請事先告知。</li>
        <li>力道可隨時調整，不舒服時請直接告訴我們。</li>
      </ul>
    </aside>}
    {stage === "contact" && <div className={styles.actions}>
      <button type="button" disabled={pending || uncertain} onClick={() => { setStage("service"); setErrors({}); setError(""); }}>返回修改服務與時段</button>
      <button type="submit" className="primary" disabled={pending}>{pending ? "確認中…" : uncertain ? "重試確認" : "確認預約"}</button>
    </div>}
  </form>;
}
