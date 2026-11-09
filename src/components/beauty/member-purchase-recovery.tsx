"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { CoursePortalSheet } from '@/components/course-portal-sheet';
import { CopyButton } from '@/app/(customer)/book/shop/[planId]/checkout/copy-button';
import { createPurchaseIntentCoordinator, type PurchaseRecoveryState } from '@/lib/purchase-intent-coordinator';
import { memberPurchaseRecoveryTransport, type MemberPurchaseInput } from '@/lib/beauty-member-purchase-recovery-transport';
import { requestBeautyPlan } from '@/server/actions/beauty';
import { prepareBeautyMemberPurchaseIntent, readBeautyMemberPurchaseIntent, cancelBeautyMemberPurchaseIntent, acknowledgeBeautyMemberPurchaseIntent } from '@/server/actions/beauty-member-purchase-intent';

type Controller = ReturnType<typeof createPurchaseIntentCoordinator<MemberPurchaseInput>>;
type View = PurchaseRecoveryState | { kind: 'checking' };
type Props = {
  storeId: string; customerId: string; scopeKey: string;
  plan: { id: string; name: string; price: number; sessions: number; revision: number } | null;
  bank: { bankName: string | null; bankCode: string | null; bankAccountNumber: string | null; shopPhone?: string | null } | null;
  onClose: () => void; onSubmitted: () => void;
};

// Timeouts end waiting, not the request. A key is retained until a server
// acknowledgement or cancellation barrier has been verified.
function bounded<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    Promise.resolve().then(fn).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function BeautyMemberPurchaseRecovery({ storeId, customerId, scopeKey, plan, bank, onClose, onSubmitted }: Props) {
  const [state, setState] = useState<View>({ kind: 'checking' });
  const [lastFour, setLastFour] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const controller = useRef<Controller | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const transport = useMemo(() => memberPurchaseRecoveryTransport(storeId, {
    prepare: input => {
      const version = generation.current;
      return bounded(() => prepareBeautyMemberPurchaseIntent(input)).then(response => {
        if (!response.success && version === generation.current) setError(response.error);
        return response;
      });
    },
    read: input => bounded(() => readBeautyMemberPurchaseIntent(input)),
    cancel: input => bounded(() => cancelBeautyMemberPurchaseIntent(input)),
    acknowledge: input => bounded(() => acknowledgeBeautyMemberPurchaseIntent(input)),
  }), [storeId]);

  useEffect(() => {
    const generationRef = generation;
    const version = ++generationRef.current;
    setState({ kind: 'checking' }); setError(''); setSent(false);
    try {
      // Include the authenticated session scope to prevent a different user
      // who opens the same store/customer on this tab from reusing the key.
      const c = createPurchaseIntentCoordinator<MemberPurchaseInput>({
        family: 'beauty-member:' + scopeKey, storeId, customerId,
        storage: window.sessionStorage, randomUUID: () => crypto.randomUUID(), transport,
      });
      controller.current = c;
      void c.inspect().then(next => { if (version === generationRef.current) setState(next); });
    } catch { setState({ kind: 'uncertain', reason: 'storage' }); }
    return () => { ++generationRef.current; controller.current = null; };
  }, [storeId, customerId, scopeKey, transport]);

  async function run(work: (c: Controller) => Promise<PurchaseRecoveryState>) {
    const c = controller.current;
    if (!c || running.current) return null;
    running.current = true; setBusy(true); setError('');
    const version = generation.current;
    try {
      const next = await work(c);
      if (version !== generation.current) return null;
      setState(next);
      return next;
    } finally {
      if (version === generation.current) { running.current = false; setBusy(false); }
    }
  }

  async function submit() {
    if (busy || !plan || !/^\d{4}$/.test(lastFour) || !bank?.bankAccountNumber) return;
    const selectedPlan = plan;
    const current = state;
    if (current.kind !== 'none-known' && !(current.kind === 'intent' && current.intent.status === 'PREPARED')) return;
    const snapshot = { expectedName: selectedPlan.name, expectedPrice: selectedPlan.price, expectedSessions: selectedPlan.sessions, expectedRevision: selectedPlan.revision };
    const input: MemberPurchaseInput = { customerId, planId: selectedPlan.id, lastFour, requestKey: '', ...snapshot };
    const version = generation.current;
    await run(async c => {
      const registered = current.kind === 'none-known' ? await c.start(input) : await c.retry(input);
      if (version !== generation.current) return { kind: 'uncertain', reason: 'concurrent' };
      if (registered.kind !== 'intent' || registered.intent.status !== 'PREPARED') return registered;
      try {
        const response = await bounded(() => requestBeautyPlan({ planId: selectedPlan.id, lastFour, requestKey: registered.intent.requestKey, ...snapshot }));
        if (version === generation.current) {
          if (response.success) setSent(true);
          else setError(response.error);
        }
      } catch { if (version === generation.current) setError('連線暫時中斷，請先核對原申請，勿重複送出。'); }
      return c.inspect();
    });
  }

  async function acknowledge(status: 'COMMITTED' | 'CANCELLED') {
    const result = await run(c => c.acknowledge(status));
    if (result?.kind !== 'none-known') return;
    if (status === 'COMMITTED') onSubmitted();
    else { setSent(false); setLastFour(''); }
  }

  const unresolved = state.kind === 'uncertain';
  const intent = state.kind === 'intent' ? state.intent : null;
  const showForm = !!plan && !sent && (state.kind === 'none-known' || intent?.status === 'PREPARED');
  const canSubmit = !!plan && !busy && !sent && (state.kind === 'none-known' || intent?.status === 'PREPARED') && /^\d{4}$/.test(lastFour) && !!bank?.bankAccountNumber;
  const controls = 'min-h-11 rounded-lg border px-3 py-2 disabled:opacity-50';
  return <CoursePortalSheet title={plan ? '購買方案' : '購買申請狀態'} busy={busy} close={onClose} footer={<>
    <button disabled={busy} onClick={onClose}>返回</button>
    {plan && <button className="primary" disabled={!canSubmit} onClick={() => void submit()}>{busy ? '處理中…' : '已匯款，送出核帳資料'}</button>}
  </>}>
    {showForm && plan && <>{intent?.status === 'PREPARED' && <p>下方是目前選擇的方案，未必是原申請；請選擇原方案並輸入原資料，系統會先核對是否相符。</p>}<h2>{plan.name}</h2><p>NT$ {plan.price.toLocaleString('zh-TW')} · {plan.sessions}次</p>
    <p>{bank?.bankName}（{bank?.bankCode}）</p>
    <div className="cp-bank-account"><strong>{bank?.bankAccountNumber ?? '店家尚未提供收款帳號'}</strong>{bank?.bankAccountNumber && <CopyButton value={bank.bankAccountNumber} label="複製帳號"/>}</div>
    <p>送出申請後由店家核帳，並非立即取得方案額度。</p>
    <label>轉出帳號後四碼<input aria-label="轉出帳號後四碼" inputMode="numeric" autoComplete="off" maxLength={4} value={lastFour} disabled={busy} onChange={event => setLastFour(event.target.value.replace(/\D/g, '').slice(0, 4))}/></label></>}
    {state.kind === 'checking' && <p role="status">正在核對申請狀態…</p>}
    {!plan && state.kind === 'none-known' && <p role="status">目前沒有可查到的待確認申請。如剛在其他裝置送出，請先至原裝置核對。</p>}
    {(unresolved || sent && intent?.status !== 'COMMITTED') && <section role="alert" className="cp-error">
      <p>{sent ? '核帳資料已送出，正在核對申請狀態；請勿重複送出。' : '申請結果尚未確認，查無紀錄不代表失敗。請勿重複送出；已匯款者可聯絡店家核對。'}</p>
      <button className={controls} disabled={busy} onClick={() => void run(c => c.inspect())}>重新核對</button>{!sent && state.kind === 'uncertain' && state.reason !== 'storage' && <button className={controls} disabled={busy} onClick={() => void run(c => c.cancel())}>取消原申請</button>}
      {bank?.shopPhone && <p><a href={'tel:' + bank.shopPhone}>聯絡店家</a></p>}
    </section>}
    {intent?.status === 'PREPARED' && !sent && <section role="status" className="cp-error"><p>{plan ? '有一筆待確認的申請；可填寫相同資料繼續核對，或取消原申請。' : '有一筆待確認的申請；如需繼續送出，請返回並選擇原方案，或取消原申請。'}</p><button className={controls} disabled={busy} onClick={() => void run(c => c.cancel())}>取消原申請</button></section>}
    {intent?.status === 'COMMITTED' && <section role="status" className="cp-error"><p>原申請已送出，請至購買進度查看最新核帳狀態；請勿重複送出。</p><button className={controls} disabled={busy} onClick={() => void acknowledge('COMMITTED')}>我已了解</button></section>}
    {intent?.status === 'CANCELLED' && <section role="status" className="cp-error"><p>原申請已取消，若您已匯款請聯絡店家。</p><button className={controls} disabled={busy} onClick={() => void acknowledge('CANCELLED')}>確認取消</button></section>}
    {error && <p role="alert" className="cp-error">{error} 申請狀態尚待核對。</p>}
  </CoursePortalSheet>;
}
