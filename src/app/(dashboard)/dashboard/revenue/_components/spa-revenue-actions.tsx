"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { editSpaPayment, voidSpaPayment } from "@/server/actions/spa-commerce";
import {
  SPA_EXTERNAL_PAYMENT_METHODS,
  SPA_PAYMENT_LABELS,
} from "@/lib/spa-payment-methods";
import { formatTWTime } from "@/lib/date-utils";
type Row = {
  id: string;
  kind: string;
  customerName: string | null;
  amount: number;
  method: string;
  last4: string | null;
  external: boolean;
  voided: boolean;
  reversed: boolean;
  revisions: {
    action: string;
    reason: string;
    at: string;
    before: { paymentMethod?: string; transferLast4?: string | null };
    after: { paymentMethod?: string; transferLast4?: string | null };
  }[];
};
const field =
  "mt-1 block w-full min-w-0 rounded-lg border border-earth-200 bg-white p-3";
export function SpaRevenueActions({
  row,
  canManage,
}: {
  row: Row;
  canManage: boolean;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const [mode, setMode] = useState<"EDIT" | "VOID" | "HISTORY" | null>(null);
  const [method, setMethod] = useState(row.method);
  const [last4, setLast4] = useState(row.last4 ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const editable =
    canManage && row.kind !== "REFUND" && !row.voided && !row.reversed;
  const open = (next: typeof mode) => {
    setMethod(row.method);
    setLast4(row.last4 ?? "");
    setReason("");
    setError("");
    if (menu.current) menu.current.open = false;
    setMode(next);
  };
  return (
    <>
      {editable || !!row.revisions?.length ? (
        <details ref={menu} className="group relative whitespace-nowrap">
          <summary
            aria-label="交易操作"
            className="cursor-pointer list-none rounded-lg px-3 py-2 text-lg text-[#596D45] hover:bg-earth-50"
          >
            ⋯
          </summary>
          <div className="flex flex-wrap gap-2 rounded-lg bg-earth-50 p-2 text-sm">
            {editable && (
              <>
                {row.external && (
                  <button
                    className="rounded-lg border border-earth-200 px-3 py-2 text-[#596D45]"
                    onClick={() => open("EDIT")}
                  >
                    編輯
                  </button>
                )}
                <button
                  className="rounded-lg px-3 py-2 text-red-700 hover:bg-red-50"
                  onClick={() => open("VOID")}
                >
                  刪除
                </button>
              </>
            )}
            {row.voided && <span className="text-earth-500">已作廢</span>}
            {!row.voided && row.reversed && (
              <span className="text-earth-500">已退款</span>
            )}
            {!!row.revisions?.length && (
              <button
                className="text-earth-500 underline"
                onClick={() => open("HISTORY")}
              >
                修改紀錄
              </button>
            )}
          </div>
        </details>
      ) : (
        <span className="text-xs text-earth-500">
          {row.voided ? "已作廢" : row.reversed ? "已退款" : ""}
        </span>
      )}
      {mode && (
        <RightSheet
          open
          width={520}
          labelledById={`payment-${row.id}`}
          onClose={() => {
            if (!pending) setMode(null);
          }}
        >
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (mode === "HISTORY") return;
              setError("");
              start(async () => {
                try {
                  const base = {
                    id: row.id,
                    kind:
                      row.kind === "SERVICE"
                        ? ("RECEIPT" as const)
                        : ("SALE" as const),
                    reason,
                  };
                  const result =
                    mode === "VOID"
                      ? await voidSpaPayment(base)
                      : await editSpaPayment({
                          ...base,
                          paymentMethod:
                            method as (typeof SPA_EXTERNAL_PAYMENT_METHODS)[number],
                          transferLast4:
                            method === "TRANSFER" ? last4 : undefined,
                          expectedMethod: row.method,
                          expectedLast4: row.last4,
                        });
                  if (!result.success) {
                    setError(result.error);
                    return;
                  }
                  setMode(null);
                  router.refresh();
                } catch {
                  setError("連線失敗，內容已保留，請重試。");
                }
              });
            }}
          >
            <header className="flex items-center justify-between border-b border-earth-100 p-5">
              <h2 id={`payment-${row.id}`} className="text-xl font-semibold">
                {mode === "EDIT"
                  ? "編輯收款"
                  : mode === "VOID"
                    ? "刪除錯帳"
                    : "修改紀錄"}
              </h2>
              <button
                type="button"
                disabled={pending}
                onClick={() => setMode(null)}
              >
                關閉
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="mb-5 rounded-xl bg-earth-50 p-4">
                {row.customerName ?? "顧客"} ·{" "}
                {SPA_PAYMENT_LABELS[row.method] ?? row.method} · NT${" "}
                {row.amount.toLocaleString()}
              </p>
              {mode === "HISTORY" ? (
                <ol className="space-y-5">
                  {row.revisions.map((v, i) => (
                    <li key={i} className="border-b border-earth-100 pb-4">
                      <p className="font-semibold">
                        {v.action === "VOID" ? "刪除並作廢" : "編輯付款資訊"}
                      </p>
                      <p className="text-sm text-earth-500">
                        {formatTWTime(v.at)}
                      </p>
                      {v.action === "EDIT" && (
                        <p className="mt-2 text-sm">
                          {SPA_PAYMENT_LABELS[v.before.paymentMethod ?? ""] ??
                            v.before.paymentMethod}{" "}
                          {v.before.transferLast4
                            ? `後四碼 ${v.before.transferLast4}`
                            : ""}{" "}
                          →{" "}
                          {SPA_PAYMENT_LABELS[v.after.paymentMethod ?? ""] ??
                            v.after.paymentMethod}{" "}
                          {v.after.transferLast4
                            ? `後四碼 ${v.after.transferLast4}`
                            : ""}
                        </p>
                      )}
                      <p className="mt-2 break-words">{v.reason}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <fieldset disabled={pending} className="space-y-4">
                  {mode === "EDIT" ? (
                    <>
                      <label className="block">
                        付款方式
                        <select
                          className={field}
                          value={method}
                          onChange={(e) => setMethod(e.target.value)}
                        >
                          {SPA_EXTERNAL_PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {SPA_PAYMENT_LABELS[m]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {method === "TRANSFER" && (
                        <label className="block">
                          轉出帳號後四碼
                          <input
                            className={field}
                            value={last4}
                            required
                            inputMode="numeric"
                            pattern="[0-9]{4}"
                            maxLength={4}
                            onChange={(e) =>
                              setLast4(e.target.value.replace(/\D/g, ""))
                            }
                          />
                        </label>
                      )}
                      <p className="text-sm text-earth-500">
                        本次修改付款方式與轉帳後四碼，金額、堂數保持原紀錄。
                      </p>
                    </>
                  ) : (
                    <p className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">
                      這筆收款將從有效清單移除，並重新計算淨收款。方案扣次或儲值扣款會同步還原；刪除購買方案／儲值則會收回未使用額度。已使用的方案或餘額不足時會阻擋操作。保留作廢紀錄供查核，不會自動向銀行退錢。
                    </p>
                  )}
                  <label className="block">
                    {mode === "EDIT" ? "修改原因" : "刪除原因"}
                    <textarea
                      required
                      maxLength={300}
                      rows={3}
                      className={field}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="例如：付款方式誤選、重複登記"
                    />
                  </label>
                  {error && (
                    <p role="alert" className="text-red-700">
                      {error}
                    </p>
                  )}
                </fieldset>
              )}
            </div>
            {mode !== "HISTORY" && (
              <footer className="flex flex-wrap justify-end gap-3 border-t border-earth-100 bg-white p-5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setMode(null)}
                  className="rounded-lg border border-earth-200 px-4 py-3"
                >
                  保留紀錄
                </button>
                <button
                  disabled={pending}
                  className={`rounded-lg px-4 py-3 text-white disabled:opacity-50 ${mode === "VOID" ? "bg-red-700" : "bg-[#596D45]"}`}
                >
                  {pending
                    ? "處理中…"
                    : mode === "VOID"
                      ? "確認刪除錯帳"
                      : "儲存修改"}
                </button>
              </footer>
            )}
          </form>
        </RightSheet>
      )}
    </>
  );
}
