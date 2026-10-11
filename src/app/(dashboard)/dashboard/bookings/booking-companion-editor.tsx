"use client";

import { useEffect, useRef, useState } from "react";
import { useRetainedState } from "@/components/operations/operation-scope";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { addBookingParticipant, attachBookingCompanion, createBookingCompanion, findBookingCompanionByPhone } from "@/server/actions/booking-participants";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";

type Candidate = { id: string; name: string; phoneMasked: string };
type Slot = NonNullable<BookingDrawerPayload["companions"]>["slots"][number];

export function CompanionSlot({ bookingId, slot, canEdit, canCreate, blocked, onBusy, onUpdated, embedded = false }: { embedded?: boolean; bookingId: string; slot: Slot; canEdit: boolean; canCreate: boolean; blocked: boolean; onBusy?: (busy: boolean) => void; onUpdated?: () => void }) {
  const reader = usePanelReader("booking-companion-phone", findBookingCompanionByPhone);
  const [phone, setPhone] = useRetainedState<string>(`companion-phone:${bookingId}:${slot.position}`, "",
    (value): value is string => typeof value === "string" && value.length <= 30);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newName, setNewName] = useRetainedState<string>(`companion-name:${bookingId}:${slot.position}`, "",
    (value): value is string => typeof value === "string" && value.length <= 100);
  const [editing, setEditing] = useState(() => !!phone || !!newName);
  const [linked, setLinked] = useState<Candidate | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!phone && !newName) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phone, newName]);
  async function run(work: () => Promise<void>) {
    if (busy.current || blocked || !canEdit) return;
    busy.current = true; setWorking(true); setMessage(""); onBusy?.(true);
    try { await work(); }
    catch { if (mounted.current) setMessage("連線中斷，電話已保留，請重試。"); }
    finally { busy.current = false; onBusy?.(false); if (mounted.current) setWorking(false); }
  }
  function finish(candidate: Candidate) {
    setLinked(candidate); setPhone(""); setNewName(""); setCandidates([]); setEditing(false); onUpdated?.();
  }
  async function lookup() {
    reader.invalidate({ bookingId, phone });
    const result = await reader.read({ bookingId, phone });
    if (!mounted.current) return;
    if (!result.success) { setMessage(result.error); return; }
    setCandidates(result.data);
    if (!result.data.length) setMessage("沒有符合的顧客資料");
  }
  const name = slot.name ?? linked?.name;
  return <div className={embedded ? "mt-1" : "border-t border-earth-100 py-2"}>
    {!embedded && <p className="text-base font-medium text-earth-800">同行者 {slot.position - 1} · {name ?? "待建檔"}</p>}
    {canEdit && !slot.customerId && !linked && !editing && <button type="button"
      disabled={blocked || working} onClick={() => setEditing(true)} className="min-h-11 px-3 text-base font-medium text-primary-700">資料建檔</button>}
    {canEdit && !slot.customerId && !linked && editing && <div className="mt-1 space-y-2">
      <form className="space-y-2" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          if (!canCreate) { await lookup(); return; }
          const result = await createBookingCompanion({ bookingId, position: slot.position, revision: slot.revision, name: newName, phone });
          if (!mounted.current) return;
          if (result.success) { finish({ id: result.data.customerId, name: result.data.name, phoneMasked: "" }); return; }
          setMessage(result.error);
          // Creation checks duplicate identity authoritatively in its transaction.
          // Only conflicts need a separate customer selection; never silently attach.
          if (result.error.includes("此手機已在本店建檔")) await lookup();
        });
      }}>
        <div className="flex flex-wrap gap-2">
          {canCreate && <input aria-label={`同行者 ${slot.position - 1} 姓名`} value={newName} maxLength={100} disabled={working || blocked}
            autoComplete="name" onChange={event => setNewName(event.target.value)} placeholder="姓名"
            className="min-h-11 min-w-0 flex-[1_1_140px] rounded-lg border border-earth-300 px-3 text-base" />}
          <input type="tel" inputMode="tel" autoComplete="tel" aria-label={`同行者 ${slot.position - 1} 手機號碼`}
            value={phone} maxLength={30} disabled={working || blocked} placeholder="電話"
            onChange={event => { setPhone(event.target.value); setCandidates([]); setMessage(""); }}
            className="min-h-11 min-w-0 flex-[1_1_180px] rounded-lg border border-earth-300 px-3 text-base" />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={working || blocked} className="min-h-11 px-3 text-base text-earth-600" onClick={() => setEditing(false)}>收合</button>
          <button type="submit" disabled={working || blocked || !phone.trim() || (canCreate && !newName.trim())}
            className="min-h-11 rounded-lg bg-primary-700 px-3 text-base text-white disabled:opacity-50">{working ? "儲存中…" : canCreate ? "儲存並加入" : "確認資料"}</button>
        </div>
      </form>
      {!!candidates.length && <div className="space-y-2">
        <p className="text-base text-earth-700">此電話已有資料</p>
        {candidates.map(candidate => <button key={candidate.id} type="button" disabled={working || blocked}
          className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-primary-200 px-3 py-2 text-left text-base disabled:opacity-50"
          onClick={() => { void run(async () => {
            const result = await attachBookingCompanion({ bookingId, position: slot.position, customerId: candidate.id, revision: slot.revision });
            if (!mounted.current) return;
            if (!result.success) { setMessage(result.error); return; }
            finish(candidate);
          }); }}>
          <span>{candidate.name} · {candidate.phoneMasked}</span><span className="font-medium text-primary-700">使用此人</span>
        </button>)}
        <button type="button" disabled={working || blocked} className="min-h-11 px-3 text-base text-earth-600" onClick={() => {
          setCandidates([]); setMessage("請改填這位同行者的電話");
        }}>不同人，修改電話</button>
      </div>}
      {message && <p role="alert" className="text-sm text-amber-800">{message}</p>}
    </div>}
  </div>;
}

export function BookingCompanionEditor({ bookingId, companions, readOnly, blocked = false, onBusy, onUpdated, addOnly = false }: {
  addOnly?: boolean; bookingId: string; companions: NonNullable<BookingDrawerPayload["companions"]>; readOnly: boolean; blocked?: boolean; onBusy?: (busy: boolean) => void; onUpdated?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const pending = useRef(false);
  return <div className="col-span-2 mt-2">
    {!readOnly && companions.canAdd && <button type="button" disabled={adding || blocked} className="min-h-11 px-3 text-base font-medium text-primary-700 disabled:opacity-50"
      onClick={async () => {
        if (pending.current || blocked || readOnly) return;
        pending.current = true; setAdding(true); setError(""); onBusy?.(true);
        requestId.current ??= crypto.randomUUID();
        try {
          const result = await addBookingParticipant({ bookingId, requestId: requestId.current });
          if (!result.success) { setError(result.error); return; }
          requestId.current = null; onUpdated?.();
        } catch { setError("連線中斷，請重試確認加人結果。"); }
        finally { pending.current = false; setAdding(false); onBusy?.(false); }
      }}>{adding ? "加入中…" : "＋ 臨時加人"}</button>}
    {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
    {!addOnly && companions.slots.filter(slot => !slot.customerId && (!slot.status || slot.status === "PENDING")).map(slot => <CompanionSlot key={`${bookingId}:${slot.position}`} bookingId={bookingId} slot={slot} canEdit={companions.canEdit && !readOnly && (!slot.status || slot.status === "PENDING")} canCreate={companions.canCreate} blocked={blocked || adding} onBusy={onBusy} onUpdated={onUpdated} />)}
  </div>;
}
