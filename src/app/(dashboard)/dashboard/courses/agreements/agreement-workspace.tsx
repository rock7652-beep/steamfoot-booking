'use client';
import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { DashboardLink } from '@/components/dashboard-link';
import { SettingsListRow, SettingsWorkspaceFrame, SettingsWorkspaceNav } from '@/components/settings/settings-workspace';
import { beautyServiceTypes, beautyServiceTemplates, toggleBeautyService } from '@/lib/beauty-agreement-templates';
import { CourseAgreementBody } from '@/components/course-agreements/body';
import { courseAgreementTitle, beautyAgreementFields } from '@/lib/course-agreement';
import type { CourseAgreementDraft, CourseAgreementPreview, CourseAgreementResult, CourseAgreementState } from '@/lib/course-agreement';

export type AgreementWorkspaceProps = {
  initial: CourseAgreementState;
  recordsHref?: string;
  save: (input: { storeId: string; revision: number; draft: CourseAgreementDraft }) => Promise<CourseAgreementResult<CourseAgreementPreview>>;
  pause?: (input: { storeId: string; revision: number; activeVersionId: string }) => Promise<CourseAgreementResult<CourseAgreementState>>;
  share?: (storeId: string) => Promise<CourseAgreementResult<{ url: string; qrDataUrl: string }>>;
  publish: (input: { storeId: string; revision: number; documentHash: string; acknowledged: true }) => Promise<CourseAgreementResult<CourseAgreementState>>;
};
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-200 px-4 text-sm font-medium disabled:cursor-wait disabled:opacity-50';
const primary = `${button} bg-primary-700 text-white`;
const inputClass = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-earth-300 bg-white px-3 py-2 text-base';
function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className="min-w-0 text-sm font-medium text-earth-700"><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}
const commonGroups = [{ id: 'store', label: '店家資料' }, { id: 'rules', label: '課程規則' }, { id: 'privacy', label: '個資告知' }];

// The page keys this workspace by authenticated store; a late response from an
// unmounted store cannot populate the next store's draft.
export function CourseAgreementWorkspace({ initial, save, publish, pause, share, recordsHref }: AgreementWorkspaceProps) {
  const [confirmed, setConfirmed] = useState(initial);
  const [draft, setDraft] = useState(initial.draft);
  const beauty = draft.profile === 'BEAUTY';
  const person = beauty ? '顧客' : '學員', noun = beauty ? '服務' : '課程';
  const settingsHref = beauty ? '/dashboard/beauty?tab=設定&section=store' : '/dashboard/courses?view=settings&section=store';
  const baseGroups = beauty ? [commonGroups[0], {id:'rules',label:'服務規則'},commonGroups[2]] : commonGroups;
  const groups = beauty ? [...baseGroups.slice(0, 2), { id: 'risk', label: '服務風險與照護' }, baseGroups[2]] : baseGroups;
  const [stage, setStage] = useState<'summary' | 'edit' | 'preview'>('summary');
  const [group, setGroup] = useState('store');
  const [preview, setPreview] = useState<CourseAgreementPreview | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [sharing, setSharing] = useState<{ url: string; qrDataUrl: string } | null>(null);
  useEffect(() => {
    if (!pending) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const intercept = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href]')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', intercept, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', intercept, true); };
  }, [pending]);
  function set<K extends keyof CourseAgreementDraft>(field: K, value: CourseAgreementDraft[K]) {
    setDraft(current => ({ ...current, [field]: value })); setError(''); setNotice('');
  }
  function line(field: 'brand' | 'entity' | 'responsible' | 'city' | 'address' | 'contact' | 'leaveChannel', label: string) {
    return <Field label={label}><input className={inputClass} value={draft[field]} maxLength={200} onChange={event => set(field, event.target.value)} /></Field>;
  }
  function paragraph(field: 'makeup' | 'groupRule' | 'lateRule' | 'pauseRule' | 'equipment' | 'extra' | 'privacyNotice', label: string, rows = 3) {
    return <Field label={label}><textarea className={inputClass} rows={rows} maxLength={4000} value={draft[field]} onChange={event => set(field, event.target.value)} /></Field>;
  }
  async function savePreview() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try {
      const result = await save({ storeId: confirmed.storeId, revision: confirmed.revision, draft });
      if (!result.success) { setError(result.error); return; }
      setConfirmed(result.data); setDraft(result.data.draft); setPreview(result.data);
      setAcknowledged(false); setStage('preview'); setNotice('草稿已儲存');
    } catch { setError('尚未確認儲存結果，輸入已保留；請重試相同操作。'); }
    finally { busy.current = false; setPending(false); }
  }
  async function activate() {
    if (busy.current || !preview || !acknowledged) return;
    busy.current = true; setPending(true); setError('');
    try {
      const result = await publish({ storeId: confirmed.storeId, revision: preview.revision, documentHash: preview.documentHash, acknowledged: true });
      if (!result.success) { setError(result.error); return; }
      setConfirmed(result.data); setDraft(result.data.draft); setStage('summary');
      setPreview(null); setSharing(null); setNotice(`已啟用 v${result.data.active?.version}.0`);
    } catch { setError('尚未確認啟用結果，請保留畫面並重試相同操作。'); }
    finally { busy.current = false; setPending(false); }
  }
  async function showSharing() {
    if (busy.current || !share) return;
    busy.current = true; setPending(true); setError('');
    try { const result = await share(confirmed.storeId); if (result.success) setSharing(result.data); else setError(result.error); }
    catch { setError('暫時無法取得簽署連結，請再試一次'); }
    finally { busy.current = false; setPending(false); }
  }
  async function pauseSigning() {
    if (busy.current || !pause || !confirmed.active) return;
    busy.current = true; setPending(true); setError('');
    try {
      const result = await pause({ storeId: confirmed.storeId, revision: confirmed.revision, activeVersionId: confirmed.active.id });
      if (!result.success) { setError(result.error); return; }
      setConfirmed(result.data); setSharing(null); setConfirmPause(false); setNotice('已暫停新簽署；既有簽署文件仍保留');
    } catch { setError('尚未確認暫停結果，請以相同操作重試'); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="min-w-0 space-y-4" aria-busy={pending}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div><h1 className="admin-page-title">{noun}共同約定</h1><p className="mt-1 text-sm text-earth-600">{beauty ? '把服務方式與注意事項說清楚，讓顧客、店家與服務人員有共同依據。' : <>把上課方式說清楚，讓學員、店家與老師有共同依據。</>}</p></div>
      {recordsHref && <DashboardLink className={button} href={recordsHref}>簽署紀錄</DashboardLink>}<DashboardLink className={button} aria-disabled={pending} href={settingsHref}>返回{noun}設定</DashboardLink>
    </div>
    <SettingsWorkspaceFrame
      nav={<><div className="md:hidden text-sm text-earth-600">{stage === 'edit' ? groups.find(item => item.id === group)?.label : stage === 'preview' ? '預覽約定書' : '共同約定'}</div><SettingsWorkspaceNav activeId={stage === 'edit' ? group : stage} items={stage === 'edit' ? groups : [{ id: stage, label: stage === 'preview' ? '預覽約定書' : '共同約定' }]} onSelect={id => { if (!pending && stage === 'edit') setGroup(id); }} /></>}
      header={<p className="text-sm text-earth-700">{confirmed.active ? `已啟用 v${confirmed.active.version}.0` : '尚未啟用'}{stage === 'edit' && JSON.stringify(draft) !== JSON.stringify(confirmed.draft) ? ' · 未儲存' : ''}{stage === 'preview' ? ' · 草稿預覽' : ''}</p>}
    >
      {error && <p role="alert" className="my-4 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="my-3 text-sm text-primary-700">{notice}</p>}
      {stage === 'summary' && <>
        <SettingsListRow title="共同約定" summary={confirmed.active ? `v${confirmed.active.version}.0 · 修改草稿不影響已簽文件` : beauty ? '共同規則設定一次；每次服務內容及風險另行確認' : '設定一次，續購沿用；重要條款變更另行確認'} controls={<button type="button" className={button} onClick={() => { setStage('edit'); setGroup('store'); setNotice(''); }}>{confirmed.active ? '修改草稿' : '開始設定'}</button>} expanded={false} />
        <p className="py-4 text-sm text-earth-600">{beauty ? '每次服務項目、產品、時間與費用，依雙方確認紀錄辦理。共同約定為選用功能，不啟用也能正常預約及提供服務。' : '每期費用、堂數與上課期間，沿用課程購買紀錄。共同約定為選用功能，不啟用也能正常排課、購課與上課。'}</p>
      </>}
      {stage === 'summary' && confirmed.active && <div className="space-y-4 py-4">
        <div className="flex flex-wrap gap-3">{share && <button type="button" disabled={pending} className={primary} onClick={() => void showSharing()}>讓{person}簽署</button>}{pause && <button type="button" disabled={pending} className={button} onClick={() => setConfirmPause(true)}>暫停新簽署</button>}</div>
        {confirmPause && <div className="space-y-3 rounded-lg border border-earth-200 p-4"><p className="text-sm leading-6">暫停後，簽署連結將不再接受新簽署。已簽文件仍保留，既有營運不受影響。</p><div className="flex flex-wrap gap-3"><button type="button" disabled={pending} className={button} onClick={() => setConfirmPause(false)}>取消</button><button type="button" disabled={pending} className={primary} onClick={() => void pauseSigning()}>確認暫停</button></div></div>}
        {sharing && <section className="space-y-3 rounded-lg border border-earth-200 p-4" aria-label={`${person}簽署連結`}><h2 className="text-lg font-semibold">{person}簽署連結</h2>
          {/* QR is generated locally, never sent to an external image service. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sharing.qrDataUrl} width={320} height={320} alt={`${person}簽署 QR Code`} className="mx-auto h-auto max-w-full" />
          <a className="block break-all text-base text-primary-800 underline" href={sharing.url} target="_blank" rel="noopener noreferrer">開啟{person}簽署頁</a>
          <p className="break-all text-sm text-earth-600">{sharing.url}</p><a className={button} href={sharing.qrDataUrl} download="course-agreement-qr.png">下載 QR Code</a>
        </section>}
      </div>}
      {stage === 'edit' && <form className="space-y-5 py-5" onSubmit={event => { event.preventDefault(); const next = groups[groups.findIndex(item => item.id === group) + 1]; if (next) setGroup(next.id); else void savePreview(); }}>
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <legend className="mb-4 text-lg font-semibold text-primary-900">{groups.find(item => item.id === group)?.label}</legend>
          {group === 'store' && <>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">{line('brand', '品牌／店名')}{line('entity', '營業登記名稱')}{line('responsible', '負責人')}{line('city', '所在縣市')}{line('contact', '聯絡方式')}{line('address', '地址')}</div>
            <Field label="範本適用類型"><select value={draft.business} className={inputClass} onChange={event => set('business', event.target.value as CourseAgreementDraft['business'])}><option value="pending">尚未確認（可存草稿）</option>{beauty ? <option value="beauty">已確認適用本店一般非醫療美業服務</option> : <option value="cram">已確認適用短期補習班規範</option>}</select></Field>
          </>}
          {group === 'rules' && <>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">{!beauty && <Field label="單堂時間（分鐘）"><input className={inputClass} type="number" min={1} max={480} value={draft.duration} onChange={event => set('duration', Number(event.target.value))} /></Field>}{line('leaveChannel', beauty ? '取消改期聯絡管道' : '請假聯絡管道')}</div>
            <Field label={beauty ? '取消或改期期限' : '請假期限'}><select className={inputClass} value={draft.leave.mode} onChange={event => set('leave', event.target.value === 'hours' ? { mode: 'hours', hours: 24 } : event.target.value === 'deadline' ? { mode: 'deadline', days: 1, time: '21:00' } : { mode: 'custom', rule: '' })}><option value="hours">提前幾小時</option><option value="deadline">指定日期與時間</option><option value="custom">自訂文字</option></select></Field>
            {draft.leave.mode === 'hours' && <Field label="提前時數"><input type="number" min={0} max={720} className={inputClass} value={draft.leave.hours} onChange={event => set('leave', { mode: 'hours', hours: Number(event.target.value) })} /></Field>}
            {draft.leave.mode === 'deadline' && <div className="grid min-w-0 gap-4 sm:grid-cols-2"><Field label={beauty ? '預約前幾日（0 為當日）' : '上課前幾日（0 為當日）'}><input type="number" min={0} max={30} className={inputClass} value={draft.leave.days} onChange={event => draft.leave.mode === 'deadline' && set('leave', { ...draft.leave, days: Number(event.target.value) })} /></Field><Field label="截止時間（台灣時間）"><input type="time" className={inputClass} value={draft.leave.time} onChange={event => draft.leave.mode === 'deadline' && set('leave', { ...draft.leave, time: event.target.value })} /></Field></div>}
            {draft.leave.mode === 'custom' && <Field label={beauty ? '自訂取消改期期限' : '自訂請假期限'}><textarea className={inputClass} maxLength={4000} rows={3} value={draft.leave.rule} onChange={event => set('leave', { mode: 'custom', rule: event.target.value })} /></Field>}
            <p className="text-sm text-earth-600">這裡設定約定內容；不會變更預約系統的取消截止，請確認與實際執行方式一致。</p>
            {paragraph('makeup', beauty ? '取消與改期處理' : '補課方式')}
            <details><summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-700">其他{noun}規則（選填）</summary><div className="space-y-4 pt-3">{!beauty && paragraph('groupRule', '團體課補充規則')}{paragraph('lateRule', '遲到處理')}{paragraph('pauseRule', beauty ? '暫停或中止服務' : '暫停課程')}{paragraph('equipment', beauty ? '環境與器具衛生' : '設備使用')}{paragraph('extra', '其他約定')}</div></details>
            <p className="text-sm text-earth-600">{beauty ? '請在「服務風險與照護」填寫適用本店服務的退費及解約規則。' : '退費條文沿用本店所在地適用的補習班法規，完整文字可於下一步預覽。'}</p>
          </>}
          {group === 'risk' && beauty && <><p className="text-sm text-earth-600">請依本店實際服務填寫；每次更換項目或產品，仍須說明並確認。不在此蒐集完整病史，公開行銷影像須另外授權。</p><fieldset className="min-w-0 space-y-3 rounded-lg border border-earth-200 p-4"><legend className="px-1 text-sm font-medium">服務類型（可複選）</legend><p className="text-sm text-earth-600">勾選後帶入可修改範例，請依實際產品及操作確認。取消勾選會保留文字，但不列入本次約定書。</p><div className="flex flex-wrap gap-3">{beautyServiceTypes.map(type => <label key={type} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.beautyServices?.selected.includes(type) ?? false} onChange={event => set('beautyServices', toggleBeautyService(draft.beautyServices, type, event.target.checked))}/>{beautyServiceTemplates[type].label}</label>)}</div>{beautyServiceTypes.filter(type => draft.beautyServices?.selected.includes(type)).map(type => <Field key={type} label={`${beautyServiceTemplates[type].label}風險與照護說明`}><textarea className={inputClass} rows={8} maxLength={4000} value={draft.beautyServices?.content[type] ?? ''} onChange={event => set('beautyServices', { selected: draft.beautyServices?.selected ?? [], content: { ...draft.beautyServices?.content, [type]: event.target.value } })}/></Field>)}</fieldset>{Object.entries(beautyAgreementFields).map(([key,label])=>{const field=key as keyof typeof beautyAgreementFields;return <Field key={key} label={label}><textarea className={inputClass} rows={3} maxLength={4000} value={draft.beauty?.[field]??''} onChange={event=>set('beauty',{serviceScope:'',productsAndMethods:'',specificRisks:'',precautions:'',aftercare:'',emergencyProcedure:'',refundRule:'',...draft.beauty,[field]:event.target.value})}/></Field>;})}</>}
          {group === 'privacy' && <>{paragraph('privacyNotice', '個人資料告知', 10)}<p className="text-sm text-earth-600">請載明蒐集者、目的、資料類別、利用期間／地區／對象／方式、當事人權利與聯絡方式，以及不提供資料的影響。儲存地區與保存期限須依實際服務填寫。</p></>}
        </fieldset>
        <div className="flex flex-wrap justify-between gap-3 border-t border-earth-200 pt-4">
          <button type="button" className={button} disabled={pending} onClick={() => { if (group === 'store') { setDraft(confirmed.draft); setStage('summary'); setError(''); } else setGroup(groups[Math.max(0, groups.findIndex(item => item.id === group) - 1)].id); }}>{group === 'store' ? '取消修改' : '上一步'}</button>
          <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={pending} onClick={() => void savePreview()}>儲存並預覽</button><button className={primary} disabled={pending} type="submit">{pending ? '儲存中…' : groups[groups.findIndex(item => item.id === group) + 1] ? `下一步：${groups[groups.findIndex(item => item.id === group) + 1].label}` : '下一步：預覽約定書'}</button></div>
        </div>
      </form>}
      {stage === 'preview' && preview && <div className="space-y-5 py-5">
        <article className="min-w-0 space-y-5 break-words"><h2 className="text-xl font-semibold text-primary-900">{preview.draft.brand || '店家'}｜{courseAgreementTitle(preview.draft.profile)}</h2><p className="text-sm text-earth-600">草稿 · 尚未啟用</p>{preview.document.map((clause, index) => <section key={clause.title}><h3 className="mb-2 text-base font-semibold text-primary-900">{index + 1}．{clause.title}</h3><CourseAgreementBody clause={clause} /></section>)}</article>
        <label className="flex items-start gap-3 border-t border-earth-200 pt-5 text-sm leading-6"><input className="mt-1 size-5 shrink-0" type="checkbox" checked={acknowledged} disabled={pending} onChange={event => setAcknowledged(event.target.checked)} />我已確認店家資料、範本適用性、個資告知及實際執行規則一致。啟用後新簽署使用此版本，舊簽署文件仍保留。</label>
        <div className="flex flex-wrap justify-between gap-3"><button className={button} disabled={pending} type="button" onClick={() => { setStage('edit'); setAcknowledged(false); setError(''); }}>返回修改</button><button className={primary} disabled={pending || !acknowledged} type="button" onClick={() => void activate()}>{pending ? '啟用中…' : '確認啟用'}</button></div>
      </div>}
    </SettingsWorkspaceFrame>
  </div>;
}
