"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  createCashbookEntry,
  updateCashbookEntry,
} from "@/server/actions/cashbook";
import { CashbookFormFields } from "./cashbook-form-fields";
type Entry = {
  id: string;
  entryDate: string;
  type: "INCOME" | "EXPENSE" | "WITHDRAW" | "ADJUSTMENT";
  category: string;
  amount: string;
  paymentMethod: "CASH" | "OTHER";
  note: string;
  staffId: string | null;
};
export function CashbookEditor({
  entry,
  presentation = "centered",
  today,
  closedDates,
  staffOptions,
  canAssignStaff,
}: {
  entry?: Entry;
  presentation?: "side" | "centered";
  today: string;
  closedDates: string[];
  staffOptions: { id: string; displayName: string }[];
  canAssignStaff: boolean;
}) {
  const [open, setOpen] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    router = useRouter();
  const titleId = useId();
  const title = entry ? "編輯記帳" : "新增記帳";
  function close() {
    if (
      lock.current ||
      (dirty && !window.confirm("離開編輯？尚未儲存的內容將不保留。"))
    )
      return;
    setOpen(false);
  }
  async function save(form: FormData) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const input = {
      entryDate: String(form.get("entryDate")),
      type: String(form.get("type")) as Entry["type"],
      category: String(form.get("category") || ""),
      amount: Number(form.get("amount")),
      paymentMethod: String(
        form.get("paymentMethod"),
      ) as Entry["paymentMethod"],
      note: String(form.get("note") || ""),
      confirmClosedCashbookChange:
        form.get("confirmClosedCashbookChange") === "on",
    };
    try {
      const result = entry
        ? await updateCashbookEntry(entry.id, {
            ...input,
            ...(canAssignStaff
              ? { staffId: String(form.get("staffId") || "") || null }
              : {}),
          })
        : await createCashbookEntry({
            ...input,
            ...(canAssignStaff
              ? { staffId: String(form.get("staffId") || "") || undefined }
              : {}),
          });
      if (!result.success) {
        setError(result.error || "儲存失敗");
        return;
      }
      setOpen(false);
      setDirty(false);
      router.refresh();
      toast.success("已儲存收支紀錄");
    } catch {
      setError("儲存失敗，請重試，輸入內容已保留。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="min-h-11 rounded-lg border border-earth-200 px-4 text-sm text-primary-700"
        onClick={() => {
          setDirty(false);
          setError("");
          setOpen(true);
        }}
      >
        {entry ? "編輯" : "＋ 新增記帳"}
      </button>
      {open && (
        <RightSheet presentation={presentation} open onClose={close} width={640} labelledById={titleId}>
          <header className="flex items-center justify-between border-b p-4">
            <h2 id={titleId} className="font-semibold">
              {title}
            </h2>
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="min-h-11 px-4"
            >
              關閉
            </button>
          </header>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onChange={() => setDirty(true)}
            onSubmit={(event) => {
              event.preventDefault();
              void save(new FormData(event.currentTarget));
            }}
          >
            <fieldset
              disabled={busy}
              className="flex-1 space-y-4 overflow-y-auto p-4"
            >
              <CashbookFormFields
                closedDates={closedDates}
                defaultEntryDate={entry?.entryDate || today}
                defaultType={entry?.type || "INCOME"}
                defaultCategory={entry?.category || ""}
                defaultAmount={entry?.amount || ""}
                defaultPaymentMethod={entry?.paymentMethod || null}
              />
              {canAssignStaff && (
                <label className="block text-sm">
                  登錄人
                  <select
                    name="staffId"
                    defaultValue={entry?.staffId || ""}
                    className="mt-1 min-h-11 w-full rounded-lg border p-2"
                  >
                    <option value="">不指定</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-sm">
                備註
                <textarea
                  name="note"
                  defaultValue={entry?.note || ""}
                  rows={3}
                  className="mt-1 w-full rounded-lg border p-3"
                />
              </label>
              {entry && closedDates.includes(entry.entryDate) && (
                <p className="text-sm text-amber-700">
                  原始日期已關帳。修改現金紀錄須確認補登，不會重算關帳快照。
                </p>
              )}
              {error.includes("結帳") && (
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="confirmClosedCashbookChange" />
                  我知道這只是補紀錄，不會重算關帳快照
                </label>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
            </fieldset>
            <footer className="border-t bg-white p-4">
              <button
                disabled={busy}
                className="min-h-11 w-full rounded-lg bg-primary-600 text-white"
              >
                {busy ? "儲存中…" : "儲存"}
              </button>
            </footer>
          </form>
        </RightSheet>
      )}
    </>
  );
}
