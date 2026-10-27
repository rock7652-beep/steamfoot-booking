"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SportsTrialSlot } from "@/server/services/sports-public-trial";
import { bookPublicSportsTrial } from "@/server/actions/sports-public-trial";
import { normalizePhone } from "@/lib/normalize";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import { PublicBookingCalendar } from "@/components/public-trial/public-booking-calendar";
import { safeTrialMap } from "@/components/public-trial/public-trial-page";
import { normalizeLineOfficialUrl } from "@/lib/line-official-url";
import styles from "@/components/beauty/public-booking-form.module.css";
import ui from "@/components/public-trial/public-trial.module.css";

type Props = { slug: string; slots: SportsTrialSlot[]; entry?: string; lineEntryHref?: string; contactUrl?: string; address?: string; mapUrl?: string;
  submitTrial?: typeof bookPublicSportsTrial };
const courseKey = (slot: SportsTrialSlot) => slot.courseId ?? slot.name;
const clock = (value: string) => formatTWDateTime(new Date(value)).slice(11);

export function SportsPublicTrialForm({ slug, slots, entry, lineEntryHref, contactUrl, address, mapUrl, submitTrial = bookPublicSportsTrial }: Props) {
  const id = useId(), requestKey = useRef<string | null>(null), lock = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const [course, setCourse] = useState(""), [date, setDate] = useState(""), [sessionId, setSessionId] = useState("");
  const [name, setName] = useState(""), [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false), [stage, setStage] = useState<"service" | "contact" | "success">("service");
  const previousStage = useRef(stage);
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState("");
  const selected = slots.find(s => s.id === sessionId);
  const courses = useMemo(() => {
    const groups = new Map<string, SportsTrialSlot[]>();
    for (const slot of slots) { const key = courseKey(slot); const group = groups.get(key) ?? []; group.push(slot); groups.set(key, group); }
    return [...groups].map(([key, offers]) => ({ key, offers, name: offers[0].name, price: Math.min(...offers.map(s => s.price)), maxPrice: Math.max(...offers.map(s => s.price)),
      durations: [...new Set(offers.map(s => Math.round((+new Date(s.endsAt) - +new Date(s.startsAt)) / 60000)))] }));
  }, [slots]);
  const offers = courses.find(c => c.key === course)?.offers ?? [];
  const availableDates = new Map<string, number>();
  for (const offer of offers) { const day = toLocalDateStr(new Date(offer.startsAt)); availableDates.set(day, (availableDates.get(day) ?? 0) + 1); }
  const dayOffers = offers.filter(s => toLocalDateStr(new Date(s.startsAt)) === date);
  const contact = normalizeLineOfficialUrl(contactUrl), map = safeTrialMap(mapUrl);
  useCourseDraftGuard(stage !== "success" && !!(course || name || phone), pending || uncertain);
  useEffect(() => {
    if (previousStage.current === stage) return;
    previousStage.current = stage;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [stage]);
  function edit(work: () => void) {
    if (lock.current || uncertain) return;
    requestKey.current = null; setError(""); work();
  }
  const summary = selected && <section className={ui.receipt} aria-label="預約摘要"><h3>{selected.name}</h3>
    <dl><dt>體驗日期</dt><dd>{toLocalDateStr(new Date(selected.startsAt))}</dd><dt>上課時間</dt><dd>{clock(selected.startsAt)}–{clock(selected.endsAt)}</dd>
      <dt>課程時長</dt><dd>{Math.round((+new Date(selected.endsAt) - +new Date(selected.startsAt)) / 60000)} 分鐘</dd><dt>預約人數</dt><dd>1 位</dd>
      {address && <><dt>上課地點</dt><dd>{address}</dd></>}</dl>
    <div className={ui.receiptTotal}><span>體驗費用</span><strong>NT$ {selected.price.toLocaleString()}</strong></div></section>;
  if (stage === "success") return <section role="status" className={styles.success}>
    <span className={ui.successMark} aria-hidden="true">✓</span><h2 tabIndex={-1} ref={heading}>體驗預約成功</h2><p className={ui.note}>期待與你一起開始。請保留以下預約資訊，依約到店。</p>{summary}
    <div className={styles.card}><h3>到店前再確認</h3><p>請穿著適合活動的服裝，課程用品與付款方式請向門市確認。</p><p>提醒依店家設定發送，請加入本店官方 LINE 並保持未封鎖。</p>
      <div className={styles.actions}>{contact && <a href={contact} target="_blank" rel="noopener noreferrer">聯繫店家 ↗</a>}{map && <a href={map} target="_blank" rel="noopener noreferrer">開啟導航 ↗</a>}</div></div>
  </section>;
  return <form id="booking-form" className={styles.form} onSubmit={async e => {
    e.preventDefault();
    if (lock.current || !selected || !entry) return;
    if (stage === "service") { setStage("contact"); return; }
    if (!name.trim() || !/^09\d{8}$/.test(normalizePhone(phone)) || !consent) {
      setError("請填寫姓名、有效手機，並同意預約資料使用。"); return;
    }
    lock.current = true; setPending(true); setError("");
    try {
      requestKey.current ??= crypto.randomUUID();
      const result = await submitTrial(slug, { sessionId, name, phone, consent: true,
        expectedPrice: selected.price, requestKey: requestKey.current, entry });
      if (result.success) { setUncertain(false); setStage("success"); }
      else { setUncertain(false); setError(result.error); }
    } catch { setUncertain(true); setError("連線中斷，請按「確認原預約結果」重試，避免重複預約。"); }
    finally { lock.current = false; setPending(false); }
  }}>
    <ol className={styles.steps} aria-label="預約步驟"><li aria-current={stage === "service" ? "step" : undefined}>1 課程與時段</li><li aria-current={stage === "contact" ? "step" : undefined}>2 聯絡與確認</li></ol>
    <h2 ref={heading} className={stage === "service" ? styles.serviceHeading : undefined} tabIndex={-1}>{stage === "service" ? "選擇體驗課程" : "確認體驗預約"}</h2>
    {!entry && <div className={styles.card}><p>請先驗證 LINE 身分，再預約體驗。</p>
      {lineEntryHref ? <div className={styles.actions}><a href={lineEntryHref}>使用 LINE 開啟體驗預約</a></div> : <p>本店 LINE 入口尚未設定，請聯繫店家。</p>}
    </div>}
    {!slots.length ? <div className={ui.empty}><h2>下一次體驗，期待與你見面</h2><p>目前沒有開放預約的體驗課程，請聯繫店家安排。</p>{contact && <a href={contact}>聯繫店家</a>}</div> : <>
      <fieldset disabled={pending || uncertain}>
        {stage === "service" ? <>
          <section className={ui.formSection} aria-label="體驗課程"><h3><span className={ui.stepNumber}>01</span>選一堂想嘗試的課</h3>
            <div className={ui.choices}>{courses.map(item => <button key={item.key} type="button" className={ui.choice} aria-pressed={course === item.key}
              onClick={() => edit(() => { setCourse(item.key); setDate(""); setSessionId(""); })}>
              <span className={ui.choiceTitle}>{item.name}</span><span className={ui.choiceMeta}>{item.durations.length === 1 ? `${item.durations[0]} 分鐘` : "依所選時段"} · {item.offers.length} 個可選時段</span>
              <span className={ui.choicePrice}>NT$ {item.price.toLocaleString()}{item.price !== item.maxPrice ? " 起" : ""}</span>{course === item.key && <span className={ui.choiceCheck} aria-hidden="true">✓</span>}
            </button>)}</div>
          </section>
          <section className={ui.formSection} aria-label="體驗日期"><h3><span className={ui.stepNumber}>02</span>選擇方便的日期</h3>
            {course ? <PublicBookingCalendar key={course} value={date} availableDates={availableDates} onChange={value => edit(() => { setDate(value); setSessionId(""); })} /> : <p className={ui.note}>先選擇體驗課程，就能查看可預約日期。</p>}
          </section>
          <section className={ui.formSection} aria-label="體驗時段"><h3><span className={ui.stepNumber}>03</span>選擇上課時間</h3>
            {!date ? <p className={ui.note}>選擇日期後，會顯示當天的課程時段與剩餘名額。</p> : <div className={ui.slotList}>{dayOffers.map(slot => <button type="button" className={ui.slotButton} key={slot.id} aria-pressed={sessionId === slot.id} onClick={() => edit(() => setSessionId(slot.id))}>
              <strong>{clock(slot.startsAt)}–{clock(slot.endsAt)}</strong><span>剩餘 {slot.remaining} 位 · NT$ {slot.price.toLocaleString()}</span>
            </button>)}</div>}
          </section>{summary}
        </> : <>{summary}<section className={ui.formSection}><h3>留下聯絡資料</h3><div className={styles.grid}>
          <div className={styles.field}><label htmlFor={`${id}-name`}>姓名</label><input id={`${id}-name`} required maxLength={50} autoComplete="name" value={name} onChange={e => edit(() => setName(e.target.value))} /></div>
          <div className={styles.field}><label htmlFor={`${id}-phone`}>手機</label><input id={`${id}-phone`} required type="tel" inputMode="tel" autoComplete="tel-national" maxLength={30} placeholder="09xxxxxxxx" value={phone} onChange={e => edit(() => setPhone(e.target.value))} /></div>
        </div></section><label className={styles.check}><input type="checkbox" required checked={consent} onChange={e => edit(() => setConsent(e.target.checked))} />同意提供資料供本次預約及聯繫使用</label>
          <p className={ui.note}>每次限預約本人一位。首次預約會建立本店顧客資料。<a href="/privacy" target="_blank" rel="noopener noreferrer">隱私權政策</a></p>
        </>}
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        {stage === "contact" && <button type="button" disabled={pending || uncertain} onClick={() => setStage("service")}>返回修改課程</button>}
        <button type="submit" disabled={pending || !entry || !selected}>{pending ? "處理中…" : uncertain ? "確認原預約結果" : stage === "service" ? "下一步" : "確認預約"}</button>
      </div>
    </>}
  </form>;
}
