"use client";

import { useEffect, useRef, useState } from "react";
import { useRetainedState } from "@/components/operations/operation-scope";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { addBookingParticipant, attachBookingCompanion, createBookingCompanion, findBookingCompanionByPhone } from "@/server/actions/booking-participants";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";

type Candidate = { id: string; name: string; phoneMasked: string };
type Slot = NonNullable<BookingDrawerPayload["companions"]>["slots"][number];

function CompanionSlot({ bookingId, slot, canEdit, canCreate, blocked, onBusy, onUpdated }: { bookingId: string; slot: Slot; canEdit: boolean; canCreate: boolean; blocked: boolean; onBusy?: (busy: boolean) => void; onUpdated?: () => void }) {
  const reader = usePanelReader("booking-companion-phone", findBookingCompanionByPhone);
  const [phone, setPhone] = useRetainedState<string>(`companion-phone:${bookingId}:${slot.position}`, "",
    (value): value is string => typeof value === "string" && value.length <= 30);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newName, setNewName] = useRetainedState<string>(`companion-name:${bookingId}:${slot.position}`, "",
    (value): value is string => typeof value === "string" && value.length <= 100);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
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
  const name = slot.name ?? linked?.name;
  return <div className="border-t border-earth-100 py-2">
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
      <p className="text-base font-medium text-earth-800">同行者 {slot.position - 1} · {name ?? "待建檔"}</p>
      {canEdit && !slot.customerId && !linked && !editing && !phone && !newName && <button type="button"
        onClick={() => setEditing(true)} className="min-h-11 px-3 text-base font-medium text-primary-700">建檔／選擇顧客</button>}
    </div>
    {canEdit && !slot.customerId && !linked && (editing || phone || newName) && <div className="mt-2 space-y-2">
      <form className="flex flex-wrap gap-2" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const result = await reader.read({ bookingId, phone });
          if (!mounted.current) return;
          if (!result.success) { setCandidates([]); setMessage(result.error); return; }
          setCandidates(result.data);
          setNotFound(result.data.length === 0);
          if (!result.data.length) setMessage("本店沒有符合的顧客資料。");
        });
      }}>
        <input type="tel" inputMode="tel" autoComplete="tel" aria-label={`同行者 ${slot.position - 1} 手機號碼`}
          value={phone} maxLength={30} disabled={working || blocked} placeholder="同行者手機號碼"
          onChange={event => { setPhone(event.target.value); setCandidates([]); setNotFound(false); setMessage(""); }}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-300 px-3 text-base" />
        <button type="submit" disabled={working || blocked || !phone.trim()} className="min-h-11 rounded-lg border border-earth-300 px-3 text-base disabled:opacity-50">查詢</button>
      </form>
      {candidates.map(candidate => <button key={candidate.id} type="button" disabled={working || blocked}
        className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-primary-200 px-3 py-2 text-left text-base disabled:opacity-50"
        onClick={() => { void run(async () => {
          const result = await attachBookingCompanion({ bookingId, position: slot.position, customerId: candidate.id, revision: slot.revision });
          if (!mounted.current) return;
          if (!result.success) { setMessage(result.error); return; }
          setLinked(candidate); setPhone(""); setCandidates([]); onUpdated?.();
        }); }}>
        <span>{candidate.name} · {candidate.phoneMasked}</span><span className="font-medium text-primary-700">確認同行者</span>
      </button>)}
      {notFound && canCreate && <form className="flex flex-wrap gap-2" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const result = await createBookingCompanion({ bookingId, position: slot.position, revision: slot.revision, name: newName, phone });
          if (!mounted.current) return;
          if (!result.success) { setMessage(result.error); return; }
          setLinked({ id: result.data.customerId, name: result.data.name, phoneMasked: "" });
          setPhone(""); setNewName(""); setMessage(""); onUpdated?.();
        });
      }}>
        <input aria-label={`同行者 ${slot.position - 1} 姓名`} value={newName} maxLength={100} disabled={working || blocked}
          onChange={event => setNewName(event.target.value)} placeholder="同行者姓名"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-300 px-3 text-base" />
        <button type="submit" disabled={working || blocked || !newName.trim()} className="min-h-11 rounded-lg bg-primary-700 px-3 text-base text-white disabled:opacity-50">新增並加入</button>
      </form>}
      {working && <p role="status" className="text-sm text-earth-600">處理中…</p>}
      {message && <p role="alert" className="text-sm text-amber-800">{message}</p>}
    </div>}
  </div>;
}

export function BookingCompanionEditor({ bookingId, companions, readOnly, blocked = false, onBusy, onUpdated }: {
  bookingId: string; companions: NonNullable<BookingDrawerPayload["companions"]>; readOnly: boolean; blocked?: boolean; onBusy?: (busy: boolean) => void; onUpdated?: () => void;
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
    {companions.slots.filter(slot => !slot.customerId && (!slot.status || slot.status === "PENDING")).map(slot => <CompanionSlot key={`${bookingId}:${slot.position}`} bookingId={bookingId} slot={slot} canEdit={companions.canEdit && !readOnly && (!slot.status || slot.status === "PENDING")} canCreate={companions.canCreate} blocked={blocked || adding} onBusy={onBusy} onUpdated={onUpdated} />)}
  </div>;
}
