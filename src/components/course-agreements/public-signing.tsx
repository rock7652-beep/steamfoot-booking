'use client';
import { useEffect, useRef, useState } from 'react';
import { ZodError } from 'zod';
import { formatTWDateTime } from '@/lib/date-utils';
import { courseAgreementSignSchema } from '@/lib/course-agreement-signing';
import type { CourseAgreementCompletion, CourseAgreementPublicDocument, CourseAgreementReviewView, CourseAgreementSignInput, SignatureStrokes } from '@/lib/course-agreement-signing';
import type { CourseAgreementResult } from '@/lib/course-agreement';
import { CourseAgreementDocument } from './document';
import { SignaturePad } from './signature-pad';
export type CourseAgreementSignResult = CourseAgreementResult<CourseAgreementCompletion> & { retrySame?: boolean };
export type PublicSigningProps = {
  initial: CourseAgreementPublicDocument;
  begin: (fresh?: boolean) => Promise<CourseAgreementResult<CourseAgreementReviewView | CourseAgreementCompletion>>;
  sign: (input: CourseAgreementSignInput) => Promise<CourseAgreementSignResult>;
};
const button = 'min-h-11 rounded-lg border border-earth-300 px-4 py-2 text-base disabled:opacity-50';
const primary = `${button} bg-primary-700 text-white`;
const field = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-earth-300 px-3 py-2 text-base';
export function PublicCourseAgreementSigning({ initial, begin, sign }: PublicSigningProps) {
  const [review, setReview] = useState<CourseAgreementReviewView | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [minor, setMinor] = useState(false);
  const [guardianName, setGuardianName] = useState(''), [guardianPhone, setGuardianPhone] = useState(''), [relation, setRelation] = useState('');
  const beauty = initial.profile === 'BEAUTY';
  const person = beauty ? '顧客' : '學員', agreement = beauty ? '服務共同約定' : '課程共同約定', riskTitle = '服務風險與注意事項告知';
  const [risk, setRisk] = useState(false);
  const [read, setRead] = useState(false), [consent, setConsent] = useState(false);
  const [strokes, setStrokes] = useState<SignatureStrokes>([]);
  const [confirmation, setConfirmation] = useState<CourseAgreementSignInput | null>(null);
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const busy = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const first = Object.keys(fieldErrors)[0];
    if (!first) return;
    const target = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'auto', block: 'center' });
  }, [fieldErrors]);
  function fieldProps(key: string) {
    return { 'data-field': key, 'aria-invalid': fieldErrors[key] ? true as const : undefined,
      'aria-describedby': fieldErrors[key] ? `sign-error-${key}` : undefined };
  }
  function fieldError(key: string) {
    return fieldErrors[key] ? <p id={`sign-error-${key}`} className="mt-1 text-base text-red-700">{fieldErrors[key]}</p> : null;
  }
  useEffect(() => {
    if (!pending && !uncertain) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [pending, uncertain]);
  async function open(fresh = false) {
    if (busy.current) return; busy.current = true; setPending(true); setError('');
    try {
      const result = await begin(fresh);
      if (!result.success) { setError(result.error); return; }
      if ('receiptPath' in result.data) { setReceipt(result.data.receiptPath); return; }
      setReview(result.data); setReceipt(null); setConfirmation(null); setUncertain(false);
      setFieldErrors({}); setName(''); setPhone(''); setMinor(false); setGuardianName(''); setGuardianPhone(''); setRelation(''); setStrokes([]); setRead(false); setConsent(false); setRisk(false);
    } catch { setError('暫時無法取得約定書，請再試一次。'); }
    finally { busy.current = false; setPending(false); }
  }
  function prepare() {
    if (!review) return;
    setError(''); setFieldErrors({});
    try {
      if (beauty && !risk) { setError(`請確認${riskTitle}`); return; }
      setConfirmation(courseAgreementSignSchema.parse({ requestKey: crypto.randomUUID(), documentHash: review.documentHash,
        signer: minor ? { name, phone, minor: true, guardian: { name: guardianName, phone: guardianPhone, relation } } : { name, phone, minor: false },
        strokes, readAcknowledged: read, electronicConsent: consent, ...(beauty ? { riskAcknowledged: risk } : {}) }));
    } catch (error) {
      if (error instanceof ZodError) {
        const messages: Record<string, string> = {};
        for (const issue of error.issues) {
          const path = issue.path.join('.');
          const key = path.startsWith('strokes') ? 'strokes' : path;
          messages[key] ??= issue.message;
        }
        setFieldErrors(messages);
        setError('請修正標示的欄位，再預覽簽署資料。');
      } else setError('請確認填寫內容');
    }
  }
  async function submit() {
    if (busy.current || !confirmation) return; busy.current = true; setPending(true); setError('');
    try {
      const result = await sign(confirmation);
      if (!result.success) { setUncertain(result.retrySame === true); setError(result.error); return; }
      setReceipt(result.data.receiptPath); setUncertain(false); setConfirmation(null);
    } catch { setUncertain(true); setError('尚未確認簽署結果，請勿修改資料；按「確認簽署」以相同資料查回結果。'); }
    finally { busy.current = false; setPending(false); }
  }
  if (receipt) return <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6"><h1 className="text-2xl font-semibold text-primary-900">已完成簽署</h1><p className="text-base leading-7">本次約定書與簽名已保存，請開啟副本自行留存。</p><a className={`${primary} inline-flex items-center`} href={receipt}>查看已簽署副本</a><p className="text-sm text-earth-600">共用店內裝置時，請先保存副本，再換下一位{person}。</p>{error && <p role="alert">{error}</p>}<button type="button" className={button} disabled={pending} onClick={() => void open(true)}>換下一位{person}</button></main>;
  return <main className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6" aria-busy={pending}>
    <CourseAgreementDocument value={review ?? initial} />
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-base text-red-700">{error}</p>}
    {!review ? <div className="space-y-3 border-t border-earth-200 pt-5"><p className="text-base leading-7">請保留足夠時間閱讀與提問。需要更多時間時，可稍後再簽。</p><button type="button" className={primary} disabled={pending} onClick={() => void open()}>{pending ? '開啟中…' : '取得約定書並開始填寫'}</button></div> : confirmation ? <section aria-label="確認簽署資料" className="space-y-5 rounded-xl border border-earth-200 p-5">
      <h2 className="text-xl font-semibold">確認簽署資料</h2><p>{person}：{confirmation.signer.name} · {confirmation.signer.phone}</p>
      {confirmation.signer.minor && <p>法定代理人：{confirmation.signer.guardian.name} · {confirmation.signer.guardian.relation} · {confirmation.signer.guardian.phone}</p>}
      <svg aria-label="簽名預覽" role="img" viewBox="0 0 1000 300" className="w-full rounded border border-earth-200">{confirmation.strokes.map((stroke, i) => <polyline key={i} points={stroke.map(p => `${p.x * 1000},${p.y * 300}`).join(' ')} fill="none" stroke="#234139" strokeWidth="3" />)}</svg>
      {beauty && <p className="text-base">已分別確認：{agreement}、{riskTitle}；以下一份簽名適用於兩部分。</p>}
      <p className="text-sm text-earth-600">將保存本次 v{review.version}.0 約定書、填寫資料及簽名。</p>
      <div className="flex flex-wrap justify-between gap-3"><button className={button} type="button" disabled={pending || uncertain} onClick={() => { setConfirmation(null); setError(''); }}>返回修改</button><button className={primary} type="button" disabled={pending} onClick={() => void submit()}>{pending ? '簽署中…' : '確認簽署'}</button></div>
    </section> : <form ref={formRef} noValidate className="space-y-5 border-t border-earth-200 pt-6" onSubmit={event => { event.preventDefault(); prepare(); }}>
      <h2 className="text-xl font-semibold text-primary-900">閱讀確認與簽署</h2><p className="text-sm text-earth-600">本次提供記錄：{formatTWDateTime(new Date(review.deliveredAt))}（台灣時間）。勾選不代表放棄依法享有的審閱權利。</p>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2"><div><label className="text-base">{person}姓名<input className={field} autoComplete="name" required maxLength={100} {...fieldProps('signer.name')} value={name} onChange={event => setName(event.target.value)} /></label>{fieldError('signer.name')}</div><div><label className="text-base">聯絡電話<input className={field} type="tel" autoComplete="tel" required maxLength={30} {...fieldProps('signer.phone')} value={phone} onChange={event => setPhone(event.target.value)} /></label>{fieldError('signer.phone')}</div></div>
      <label className="block text-base">{person}身分<select className={field} value={minor ? 'minor' : 'adult'} onChange={event => setMinor(event.target.value === 'minor')}><option value="adult">已滿 18 歲</option><option value="minor">未滿 18 歲（法定代理人簽名）</option></select></label>
      {minor && <fieldset className="space-y-4 rounded-lg border border-earth-200 p-4"><legend className="px-2 text-base font-semibold">法定代理人資料</legend><label className="block">法定代理人姓名<input className={field} required maxLength={100} {...fieldProps('signer.guardian.name')} value={guardianName} onChange={event => setGuardianName(event.target.value)} /></label>{fieldError('signer.guardian.name')}<label className="block">{beauty ? '與顧客的關係' : '與學員的關係'}<input className={field} required maxLength={50} {...fieldProps('signer.guardian.relation')} value={relation} onChange={event => setRelation(event.target.value)} /></label>{fieldError('signer.guardian.relation')}<label className="block">法定代理人電話<input type="tel" className={field} required maxLength={30} {...fieldProps('signer.guardian.phone')} value={guardianPhone} onChange={event => setGuardianPhone(event.target.value)} /></label>{fieldError('signer.guardian.phone')}</fieldset>}
      <label className="flex min-h-11 items-start gap-3 text-base leading-7"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={read} onChange={event => setRead(event.target.checked)} />{beauty ? `我已取得並閱讀第一部分「${agreement}」及個資告知，了解可向店家提問；如需更多時間，可稍後簽署。` : '我已取得並閱讀約定書與個資告知，了解可向店家提問；如需更多時間，可稍後簽署。'}</label>
      {beauty && <label className="flex min-h-11 items-start gap-3 text-base leading-7"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={risk} onChange={event => setRisk(event.target.checked)} />我已閱讀第二部分「{riskTitle}」，了解相關風險及安全注意事項。此確認不免除店家與服務人員依法應負的責任。</label>}
      <label className="flex min-h-11 items-start gap-3 text-base leading-7"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={consent} onChange={event => setConsent(event.target.checked)} />我同意使用電子文件與手寫電子簽名。</label>
      <h3 className="text-base font-semibold">{minor ? '法定代理人手寫簽名' : `${person}手寫簽名`}</h3><div {...fieldProps('strokes')} tabIndex={-1} aria-label="手寫簽名"><SignaturePad value={strokes} onChange={setStrokes} />{fieldError('strokes')}</div>
      <p className="text-sm text-earth-600">若無法使用簽名區，可聯絡店家安排其他簽署方式。</p><button type="submit" className={primary} disabled={!read || !consent || (beauty && !risk)}>預覽簽署資料</button>
    </form>}
  </main>;
}
