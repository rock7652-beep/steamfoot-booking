"use client";

import { useState, useTransition, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  createTrialBooking,
  loadTrialBookingFormData,
} from "@/server/actions/trial-booking";
import { fetchDaySlots } from "@/server/actions/slots";
import { useBookingRequestKey } from "@/hooks/use-booking-request-key";

interface SlotOpt {
  startTime: string;
  available: number;
  isEnabled: boolean;
  isPast?: boolean;
}

interface TrialSettings {
  trialEnabled: boolean;
  trialDefaultPrice: number;
  trialAllowPriceEdit: boolean;
  trialMinPrice: number;
  trialMaxPrice: number;
}

interface Props {
  /** 從顧客頁進入時帶入既有顧客 */
  preset?: { customerId?: string; customerName?: string; date?: string };
  triggerLabel?: string;
  triggerClassName?: string;
}

const inputCls =
  "mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

export function TrialBookingDrawer({
  preset,
  triggerLabel = "建立體驗預約",
  triggerClassName = "rounded-md bg-primary-600 px-3 py-2 text-center text-xs font-medium text-white hover:bg-primary-700",
}: Props) {
  const requestKey = useBookingRequestKey();
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<TrialSettings | null>(null);
  const [staff, setStaff] = useState<{ id: string; displayName: string }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [assignedStaffId, setAssignedStaffId] = useState("");
  const [bookingDate, setBookingDate] = useState(preset?.date ?? "");
  const [slotTime, setSlotTime] = useState("");
  const [slots, setSlots] = useState<SlotOpt[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsLoadedFor, setSlotsLoadedFor] = useState<string | null>(null);
  // PR-3c：人數 1~4，預設 1。改人數時若 amount 未手動編輯，自動連動「總額」
  // = 單價 × people；手動編輯後切人數則保留店長輸入值（手動高於自動）。
  const [people, setPeople] = useState(1);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [notes, setNotes] = useState("");

  async function loadSlots(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setSlotsLoading(true);
    setSlotTime("");
    try {
      const r = await fetchDaySlots(date);
      const usable = (r?.slots ?? []).filter(
        (s) => s.isEnabled && s.available > 0 && !s.isPast,
      );
      setSlots(usable);
      setSlotsLoadedFor(date);
    } catch {
      setSlots([]);
      setSlotsLoadedFor(date);
    } finally {
      setSlotsLoading(false);
    }
  }

  const isExisting = Boolean(preset?.customerId);

  // 效能：滑入 / focus 觸發按鈕時就先載表單資料（設定 + 店長清單），
  // 等真的點開時多半已就緒 → drawer 開啟更即時、少看到「載入中…」。
  // 用 ref 去重；消費後清掉，下次 hover 再重新取最新。
  const prewarmRef = useRef<ReturnType<typeof loadTrialBookingFormData> | null>(null);
  function prewarmFormData() {
    if (!prewarmRef.current) prewarmRef.current = loadTrialBookingFormData();
  }

  async function handleOpen() {
    requestKey.complete();
    setOpen(true);
    setLoading(true);
    setLoadErr(null);
    const r = await (prewarmRef.current ?? loadTrialBookingFormData());
    prewarmRef.current = null;
    setLoading(false);
    if (!r.success) {
      setLoadErr(r.error);
      return;
    }
    setSettings(r.data.settings);
    setStaff(r.data.staffOptions);
    // 初始 1 人 → 預設等於單價（× 1）。
    setAmount(String(r.data.settings.trialDefaultPrice));
    setAmountTouched(false);
    if (preset?.date) void loadSlots(preset.date); // calendar entry → prefilled date
  }

  function reset() {
    setNewName("");
    setNewPhone("");
    setAssignedStaffId("");
    setBookingDate(preset?.date ?? "");
    setSlotTime("");
    setNotes("");
    setPeople(1);
    setAmountTouched(false);
    if (settings) setAmount(String(settings.trialDefaultPrice));
  }

  function changePeople(n: number) {
    setPeople(n);
    // 未手動改價 → 連動帶出新總額；已手動編輯 → 不蓋掉店長輸入。
    if (settings && !amountTouched) {
      setAmount(String(settings.trialDefaultPrice * n));
    }
  }

  function close() {
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    if (!assignedStaffId) {
      toast.error("請選擇直屬店長");
      return;
    }
    if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      toast.error("請選擇預約日期");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(slotTime)) {
      toast.error("請選擇時段");
      return;
    }
    if (!isExisting && (!newName.trim() || !/^09\d{8}$/.test(newPhone.replace(/\D/g, "")))) {
      toast.error("請填寫新顧客姓名與手機（09 開頭共 10 碼）");
      return;
    }

    const amountNum = settings.trialAllowPriceEdit
      ? Math.round(Number(amount))
      : settings.trialDefaultPrice * people;
    // 若店長沒手動改價 → 不傳 expectedAmount，讓 server 用 clampTrialTotal
    // 帶 default × people（與這裡顯示一致）。手動改過才把店長輸入值送過去。
    const sendAmount = amountTouched
      ? (Number.isFinite(amountNum) ? amountNum : undefined)
      : undefined;

    startTransition(async () => {
      const startedAt = Date.now();
      const marks: { label: string; ms: number }[] = [
        { label: "submit start", ms: 0 },
      ];
      const mark = (label: string) => {
        marks.push({ label, ms: Date.now() - startedAt });
      };
      console.info("[trial-booking] drawer submit timing", {
        bookingDate,
        slotTime,
        people,
        hasExistingCustomer: isExisting,
        marks,
      });
      const r = await createTrialBooking({
        ...(isExisting
          ? { customerId: preset!.customerId }
          : { newCustomer: { name: newName.trim(), phone: newPhone } }),
        assignedStaffId,
        bookingDate,
        slotTime,
        people,
        expectedAmount: sendAmount,
        notes: notes.trim() || undefined,
        requestKey: requestKey.current(),
      });
      mark("createTrialBooking returned");
      if (r.success) {
        requestKey.complete();
        toast.success("已建立體驗預約（未收款）");
        reset();
        setOpen(false);
        mark("router.refresh start");
        router.refresh();
        mark("router.refresh triggered");
      } else {
        requestKey.handleError(r.error);
        toast.error(r.error ?? "建立失敗");
      }
      console.info("[trial-booking] drawer submit timing", {
        bookingDate,
        slotTime,
        people,
        hasExistingCustomer: isExisting,
        outcome: r.success ? "success" : "failed",
        totalMs: Date.now() - startedAt,
        marks,
      });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        onMouseEnter={prewarmFormData}
        onFocus={prewarmFormData}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      <RightSheet open={open} onClose={close} labelledById={titleId}>
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-earth-100 px-5 py-4">
            <h2 id={titleId} className="text-sm font-semibold text-earth-900">
              建立體驗預約
            </h2>
            <button
              type="button"
              onClick={close}
              className="rounded-md p-1 text-earth-400 hover:bg-earth-50 hover:text-earth-600"
              aria-label="關閉"
            >
              ✕
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <p className="text-sm text-earth-500">載入中…</p>
            ) : loadErr ? (
              <p className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">{loadErr}</p>
            ) : settings && !settings.trialEnabled ? (
              <p className="rounded-md bg-earth-50 px-3 py-4 text-center text-sm text-earth-500">
                體驗單功能已停用，請於「設定 → 體驗課設定」開啟。
              </p>
            ) : settings ? (
              <form onSubmit={submit} className="space-y-4">
                {isExisting ? (
                  <div className="rounded-lg border border-earth-200 bg-earth-50/50 px-3 py-2 text-sm text-earth-700">
                    顧客：<span className="font-medium">{preset?.customerName ?? "（既有顧客）"}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>顧客姓名</label>
                      <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={100} />
                    </div>
                    <div>
                      <label className={labelCls}>手機</label>
                      <input className={inputCls} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="09xxxxxxxx" />
                    </div>
                  </div>
                )}

                <div>
                  <label className={labelCls}>直屬店長</label>
                  <select className={inputCls} value={assignedStaffId} onChange={(e) => setAssignedStaffId(e.target.value)}>
                    <option value="">請選擇</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.displayName}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-earth-400">每位體驗客必有直屬店長；既有顧客若已指派則不會被覆蓋。</p>
                </div>

                {/* PR-3c：人數（1~4）。雙人 / 多人同行直接於此設定，金額會自動 × 人數。 */}
                <div>
                  <label className={labelCls}>人數</label>
                  <select
                    className={inputCls}
                    value={people}
                    onChange={(e) => changePeople(Number(e.target.value))}
                  >
                    <option value={1}>1 人</option>
                    <option value={2}>2 人</option>
                    <option value={3}>3 人</option>
                    <option value={4}>4 人</option>
                  </select>
                  <p className="mt-1 text-[11px] text-earth-400">
                    人數會佔用對應的時段名額；預設金額 = 單價 × 人數，店長可手動覆蓋。
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>預約日期</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={bookingDate}
                      onChange={(e) => {
                        const dt = e.target.value;
                        setBookingDate(dt);
                        void loadSlots(dt);
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>時段</label>
                    <select
                      className={`${inputCls} disabled:bg-earth-50 disabled:text-earth-400`}
                      value={slotTime}
                      disabled={!bookingDate || slotsLoading}
                      onChange={(e) => setSlotTime(e.target.value)}
                    >
                      <option value="">
                        {!bookingDate
                          ? "請先選日期"
                          : slotsLoading
                            ? "載入時段中…"
                            : slots.length === 0
                              ? (slotsLoadedFor === bookingDate ? "該日無可預約時段" : "請選擇")
                              : "請選擇時段"}
                      </option>
                      {slots.map((s) => (
                        <option key={s.startTime} value={s.startTime}>
                          {s.startTime}（剩 {s.available}）
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-earth-400">
                      只列出尚有名額的時段；體驗預約會佔用名額。
                    </p>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>
                    體驗金額（NT$，本次合計）
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      className={`${inputCls} mt-0 disabled:bg-earth-50 disabled:text-earth-400`}
                      value={amount}
                      min={settings.trialMinPrice * people}
                      max={settings.trialMaxPrice * people}
                      disabled={!settings.trialAllowPriceEdit}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setAmountTouched(true);
                      }}
                    />
                    {settings.trialAllowPriceEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAmount(String(settings.trialDefaultPrice * people));
                          setAmountTouched(false);
                        }}
                        className="shrink-0 rounded-md border border-earth-200 bg-white px-2 py-1.5 text-[11px] text-earth-600 hover:bg-earth-50"
                      >
                        恢復預設
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-earth-400">
                    {settings.trialAllowPriceEdit
                      ? people > 1
                        ? `${people} 人合計可輸入 NT$${settings.trialMinPrice * people}–${settings.trialMaxPrice * people}（預設 ${settings.trialDefaultPrice * people} = ${settings.trialDefaultPrice} × ${people}）；雙人 899 直接輸入合計即可，不需分筆。`
                        : `可輸入 NT$${settings.trialMinPrice}–${settings.trialMaxPrice}；建立後快照，日後改價不影響本筆。`
                      : "店家設定不允許調整，將以預設價建立。"}
                  </p>
                </div>

                <div>
                  <label className={labelCls}>備註（選填）</label>
                  <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="例：雙人同行 / 活動優惠" />
                </div>

                <div className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                  此步驟僅建立「未收款」體驗預約：會佔用名額、出現在月曆，但
                  <b>不建立交易、不產生營收</b>。現場到店收款於後續步驟處理。
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-earth-100 pt-4">
                  <button type="button" onClick={close} className="rounded-lg border border-earth-200 px-4 py-2 text-sm text-earth-600 hover:bg-earth-50">
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    {pending ? "建立中…" : "建立體驗預約（未收款）"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </RightSheet>
    </>
  );
}
