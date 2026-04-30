"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  fetchTransactionDetailDTO,
  updateTransactionNote,
  updateTransactionPaymentMethod,
  updateTransactionOwnerStaff,
  voidTransaction,
  refundTransaction,
  type TransactionDetailDTO,
} from "@/server/actions/transaction";
import { formatTWTime } from "@/lib/date-utils";
import { computeRefundPlan, type RefundMode } from "@/lib/refund-plan";

// ============================================================
// Drawer for transaction detail / safe corrections / void
// 規格：v1 不做 Modal，所有確認 inline 在 Drawer 內
// ============================================================

const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗購買",
  SINGLE_PURCHASE: "單次消費",
  PACKAGE_PURCHASE: "課程購買",
  SESSION_DEDUCTION: "堂數扣抵",
  SUPPLEMENT: "補差額",
  REFUND: "退款",
  ADJUSTMENT: "手動調整",
};

const PAY_METHOD_LABEL: Record<string, string> = {
  CASH: "現金",
  TRANSFER: "匯款",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  OTHER: "其他",
  UNPAID: "未付款",
};

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  SUCCESS: { text: "已完成", color: "bg-green-100 text-green-700" },
  VOIDED: { text: "已作廢", color: "bg-gray-200 text-gray-600" },
  CANCELLED: { text: "已取消", color: "bg-red-100 text-red-700" },
  REFUNDED: { text: "已退款", color: "bg-amber-100 text-amber-700" },
};

const ACTION_LABEL: Record<string, string> = {
  UPDATE_NOTE: "修改備註",
  UPDATE_PAYMENT_METHOD: "更正付款方式",
  UPDATE_OWNER_STAFF: "更正歸屬店長",
  VOID: "取消交易",
  REFUND: "退款",
};

const PAYMENT_METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "CASH", label: "現金" },
  { value: "TRANSFER", label: "匯款" },
  { value: "LINE_PAY", label: "LINE Pay" },
  { value: "CREDIT_CARD", label: "信用卡" },
  { value: "OTHER", label: "其他" },
  { value: "UNPAID", label: "未付款" },
];

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  transactionId: string | null;
  staffOptions: Array<{ id: string; displayName: string }>;
  canVoid: boolean;
  canEdit: boolean;
  canRefund: boolean;
}

type View = "main" | "void-confirm" | "refund-confirm";

export function TransactionDrawer({
  open,
  onClose,
  transactionId,
  staffOptions,
  canVoid,
  canEdit,
  canRefund,
}: DrawerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<TransactionDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("main");

  // Inline edit local states
  const [noteEdit, setNoteEdit] = useState<string>("");
  const [editingNote, setEditingNote] = useState(false);
  const [paymentMethodEdit, setPaymentMethodEdit] = useState<string>("");
  const [paymentReason, setPaymentReason] = useState<string>("");
  const [editingPayment, setEditingPayment] = useState(false);
  const [staffIdEdit, setStaffIdEdit] = useState<string>("");
  const [staffReason, setStaffReason] = useState<string>("");
  const [editingStaff, setEditingStaff] = useState(false);
  const [voidReason, setVoidReason] = useState<string>("");
  // v2 退款 state
  const [refundMode, setRefundMode] = useState<RefundMode>("FULL_UNUSED");
  const [refundReasonInput, setRefundReasonInput] = useState<string>("");

  // Reload data when opening — async fetch effect, all setState happens
  // inside the awaited promise so it doesn't trigger react-hooks/set-state-in-effect
  useEffect(() => {
    if (!open || !transactionId) return;
    let cancelled = false;
    void (async () => {
      // Reset to loading state for this fetch session
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setView("main");

      const res = await fetchTransactionDetailDTO(transactionId);
      if (cancelled) return;
      if (res.success) {
        setData(res.data);
        setNoteEdit(res.data.note ?? "");
        setPaymentMethodEdit(res.data.paymentMethod);
        setStaffIdEdit(res.data.revenueStaffId);
        setPaymentReason("");
        setStaffReason("");
        setVoidReason("");
        setRefundMode("FULL_UNUSED");
        setRefundReasonInput("");
        setEditingNote(false);
        setEditingPayment(false);
        setEditingStaff(false);
      } else {
        setError(res.error ?? "載入失敗");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  const refresh = () => {
    if (!transactionId) return;
    startTransition(() => {
      fetchTransactionDetailDTO(transactionId).then((res) => {
        if (res.success) setData(res.data);
      });
      router.refresh();
    });
  };

  const handleSaveNote = () => {
    if (!transactionId) return;
    setError(null);
    startTransition(async () => {
      const res = await updateTransactionNote({ transactionId, note: noteEdit });
      if (res.success) {
        setEditingNote(false);
        refresh();
      } else {
        setError(res.error ?? "儲存失敗");
      }
    });
  };

  const handleSavePayment = () => {
    if (!transactionId) return;
    setError(null);
    startTransition(async () => {
      const res = await updateTransactionPaymentMethod({
        transactionId,
        paymentMethod: paymentMethodEdit as
          | "CASH"
          | "TRANSFER"
          | "LINE_PAY"
          | "CREDIT_CARD"
          | "OTHER"
          | "UNPAID",
        reason: paymentReason,
      });
      if (res.success) {
        setEditingPayment(false);
        refresh();
      } else {
        setError(res.error ?? "儲存失敗");
      }
    });
  };

  const handleSaveStaff = () => {
    if (!transactionId) return;
    setError(null);
    startTransition(async () => {
      const res = await updateTransactionOwnerStaff({
        transactionId,
        staffId: staffIdEdit,
        reason: staffReason,
      });
      if (res.success) {
        setEditingStaff(false);
        refresh();
      } else {
        setError(res.error ?? "儲存失敗");
      }
    });
  };

  const handleVoidConfirm = () => {
    if (!transactionId) return;
    setError(null);
    startTransition(async () => {
      const res = await voidTransaction({ transactionId, reason: voidReason });
      if (res.success) {
        setView("main");
        refresh();
      } else {
        setError(res.error ?? "取消失敗");
      }
    });
  };

  const handleRefundConfirm = () => {
    if (!transactionId) return;
    setError(null);
    startTransition(async () => {
      const res = await refundTransaction({
        transactionId,
        reason: refundReasonInput,
        refundMode,
      });
      if (res.success) {
        setView("main");
        refresh();
      } else {
        // 防呆文案沿用 server action 回傳，前端不另外發明
        setError(res.error ?? "退款失敗");
      }
    });
  };

  // 退款試算（pure helper；server action 會以同樣 logic 再驗一次）
  const refundPlan =
    data &&
    data.transactionType === "PACKAGE_PURCHASE" &&
    data.customerPlanWallet
      ? computeRefundPlan({
          originalAmount: data.amount,
          totalSessions: data.customerPlanWallet.totalSessions,
          mode: refundMode,
          // 把 sessionsBreakdown 攤回成 SessionLite[]（id 用 index 代替；不送回 server）
          sessions: [
            ...Array(data.customerPlanWallet.sessionsBreakdown.available).fill({
              status: "AVAILABLE",
            }),
            ...Array(data.customerPlanWallet.sessionsBreakdown.reserved).fill({
              status: "RESERVED",
            }),
            ...Array(data.customerPlanWallet.sessionsBreakdown.completed).fill({
              status: "COMPLETED",
            }),
            ...Array(data.customerPlanWallet.sessionsBreakdown.voided).fill({
              status: "VOIDED",
            }),
          ].map((s, i) => ({ id: `preview-${i}`, status: s.status as "AVAILABLE" | "RESERVED" | "COMPLETED" | "VOIDED" })),
        })
      : null;

  return (
    <RightSheet open={open} onClose={onClose} width={520}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-earth-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-earth-900">交易詳情</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-earth-400 hover:text-earth-600"
              aria-label="關閉"
            >
              ✕
            </button>
          </div>
          {data && (
            <div className="mt-2 flex items-center gap-2 text-xs text-earth-500">
              <span
                className={`rounded px-2 py-0.5 font-medium ${
                  STATUS_LABEL[data.status]?.color ?? "bg-earth-100 text-earth-600"
                }`}
              >
                {STATUS_LABEL[data.status]?.text ?? data.status}
              </span>
              <span>{TX_TYPE_LABEL[data.transactionType] ?? data.transactionType}</span>
              <span>·</span>
              <span>{formatTWTime(data.createdAt)}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <div className="text-sm text-earth-500">載入中…</div>}

          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {data && view === "main" && (
            <>
              {/* 基本資訊 */}
              <Section title="基本資訊">
                <Row label="顧客" value={data.customerName} />
                <Row
                  label="金額"
                  value={`NT$ ${Math.abs(data.amount).toLocaleString()}${
                    data.amount < 0 ? " (負)" : ""
                  }`}
                />
                <Row
                  label="付款方式"
                  value={PAY_METHOD_LABEL[data.paymentMethod] ?? data.paymentMethod}
                />
                <Row label="歸屬店長" value={data.revenueStaffName} />
                {data.serviceStaffName && (
                  <Row label="服務店長" value={data.serviceStaffName} />
                )}
                {data.booking && (
                  <Row
                    label="關聯預約"
                    value={`${formatTWTime(data.booking.bookingDate, { dateOnly: true })} ${data.booking.slotTime}`}
                  />
                )}
              </Section>

              {/* PACKAGE_PURCHASE 影響內容 */}
              {data.customerPlanWallet && (
                <Section title="影響內容">
                  <Row label="方案" value={data.customerPlanWallet.planName} />
                  <Row
                    label="總堂數"
                    value={String(data.customerPlanWallet.totalSessions)}
                  />
                  <Row
                    label="已使用 / 已預約 / 可用 / 作廢"
                    value={`${data.customerPlanWallet.sessionsBreakdown.completed} / ${data.customerPlanWallet.sessionsBreakdown.reserved} / ${data.customerPlanWallet.sessionsBreakdown.available} / ${data.customerPlanWallet.sessionsBreakdown.voided}`}
                  />
                  <Row label="錢包狀態" value={data.customerPlanWallet.walletStatus} />
                </Section>
              )}

              {/* VOIDED 顯示作廢資訊 */}
              {data.status === "VOIDED" && (
                <Section title="作廢資訊">
                  <Row
                    label="作廢時間"
                    value={data.voidedAt ? formatTWTime(data.voidedAt) : "—"}
                  />
                  <Row label="作廢人" value={data.voidedByName ?? "—"} />
                  <Row label="原因" value={data.voidReason ?? "—"} />
                </Section>
              )}

              {/* 編輯區（VOIDED 不顯示） */}
              {data.status !== "VOIDED" && canEdit && (
                <Section title="備註">
                  {!editingNote ? (
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm text-earth-700 whitespace-pre-wrap">
                        {data.note ?? <span className="text-earth-400">（未填寫）</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingNote(true)}
                        className="shrink-0 rounded border border-earth-300 px-2 py-1 text-xs text-earth-600 hover:bg-earth-50"
                      >
                        修改
                      </button>
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={noteEdit}
                        onChange={(e) => setNoteEdit(e.target.value)}
                        rows={3}
                        maxLength={500}
                        className="w-full rounded border border-earth-300 px-2 py-1 text-sm focus:outline-none focus:border-primary-400"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={handleSaveNote}
                          className="rounded bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNote(false);
                            setNoteEdit(data.note ?? "");
                          }}
                          className="rounded border border-earth-300 px-3 py-1 text-xs text-earth-600 hover:bg-earth-50"
                        >
                          取消
                        </button>
                      </div>
                    </>
                  )}
                </Section>
              )}

              {data.status !== "VOIDED" && canVoid && (
                <Section title="更正付款方式">
                  {!editingPayment ? (
                    <button
                      type="button"
                      onClick={() => setEditingPayment(true)}
                      className="rounded border border-earth-300 px-3 py-1 text-xs text-earth-600 hover:bg-earth-50"
                    >
                      變更
                    </button>
                  ) : (
                    <>
                      <select
                        value={paymentMethodEdit}
                        onChange={(e) => setPaymentMethodEdit(e.target.value)}
                        className="block w-full rounded border border-earth-300 px-2 py-1 text-sm"
                      >
                        {PAYMENT_METHOD_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={paymentReason}
                        onChange={(e) => setPaymentReason(e.target.value)}
                        placeholder="修改原因（必填）"
                        className="mt-2 block w-full rounded border border-earth-300 px-2 py-1 text-sm"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={isPending || !paymentReason.trim()}
                          onClick={handleSavePayment}
                          className="rounded bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPayment(false)}
                          className="rounded border border-earth-300 px-3 py-1 text-xs text-earth-600 hover:bg-earth-50"
                        >
                          取消
                        </button>
                      </div>
                    </>
                  )}
                </Section>
              )}

              {data.status !== "VOIDED" && canVoid && (
                <Section title="更正歸屬店長">
                  {!editingStaff ? (
                    <button
                      type="button"
                      onClick={() => setEditingStaff(true)}
                      className="rounded border border-earth-300 px-3 py-1 text-xs text-earth-600 hover:bg-earth-50"
                    >
                      變更
                    </button>
                  ) : (
                    <>
                      <select
                        value={staffIdEdit}
                        onChange={(e) => setStaffIdEdit(e.target.value)}
                        className="block w-full rounded border border-earth-300 px-2 py-1 text-sm"
                      >
                        {staffOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.displayName}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={staffReason}
                        onChange={(e) => setStaffReason(e.target.value)}
                        placeholder="修改原因（必填）"
                        className="mt-2 block w-full rounded border border-earth-300 px-2 py-1 text-sm"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={isPending || !staffReason.trim()}
                          onClick={handleSaveStaff}
                          className="rounded bg-primary-600 px-3 py-1 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingStaff(false)}
                          className="rounded border border-earth-300 px-3 py-1 text-xs text-earth-600 hover:bg-earth-50"
                        >
                          取消
                        </button>
                      </div>
                    </>
                  )}
                </Section>
              )}

              {/* 退款區（v2 — 只對 PACKAGE_PURCHASE 且 SUCCESS 顯示）*/}
              {data.status === "SUCCESS" &&
                data.transactionType === "PACKAGE_PURCHASE" &&
                canRefund && (
                  <Section title="退款">
                    <p className="mb-2 text-xs text-earth-500">
                      建立一筆負向 REFUND 交易，原交易不變。
                    </p>
                    <button
                      type="button"
                      onClick={() => setView("refund-confirm")}
                      className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50"
                    >
                      退款
                    </button>
                  </Section>
                )}

              {/* 危險區（VOIDED 不顯示） */}
              {data.status !== "VOIDED" && canVoid && (
                <Section title="危險操作" tone="danger">
                  <button
                    type="button"
                    onClick={() => setView("void-confirm")}
                    className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    取消交易
                  </button>
                </Section>
              )}

              {/* Audit log */}
              <Section title="異動紀錄">
                {data.auditLogs.length === 0 ? (
                  <div className="text-sm text-earth-400">尚無異動</div>
                ) : (
                  <ul className="space-y-2">
                    {data.auditLogs.map((log) => (
                      <li
                        key={log.id}
                        className="rounded border border-earth-200 bg-earth-50/40 px-3 py-2 text-xs text-earth-700"
                      >
                        <div className="flex justify-between">
                          <span className="font-medium text-earth-800">
                            {ACTION_LABEL[log.action] ?? log.action}
                          </span>
                          <span className="text-earth-400">
                            {formatTWTime(log.createdAt)}
                          </span>
                        </div>
                        <div className="mt-1 text-earth-500">操作人：{log.actorName}</div>
                        {log.reason && (
                          <div className="mt-1 text-earth-600">原因：{log.reason}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}

          {data && view === "void-confirm" && (
            <div>
              <Section title="確認取消交易" tone="danger">
                <div className="mb-3 space-y-2 text-sm text-earth-700">
                  <p>取消後將同步：</p>
                  <ul className="ml-4 list-disc space-y-1 text-earth-600">
                    <li>本筆收入從營收統計扣除</li>
                    {data.transactionType === "PACKAGE_PURCHASE" && (
                      <>
                        <li>顧客方案堂數同步扣回（錢包標為 CANCELLED）</li>
                        <li>前台「我的方案」會同步更新</li>
                      </>
                    )}
                    <li>此操作會留下異動紀錄，不可刪除</li>
                  </ul>
                </div>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="取消原因（必填）"
                  rows={3}
                  maxLength={500}
                  className="w-full rounded border border-earth-300 px-2 py-1 text-sm focus:outline-none focus:border-primary-400"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setView("main")}
                    className="rounded border border-earth-300 px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-50"
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    disabled={isPending || !voidReason.trim()}
                    onClick={handleVoidConfirm}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isPending ? "處理中…" : "確認取消交易"}
                  </button>
                </div>
              </Section>
            </div>
          )}

          {data && view === "refund-confirm" && data.customerPlanWallet && (
            <div>
              <Section title="退款">
                <p className="mb-3 text-xs text-earth-500">
                  退款不修改原交易；新增一筆負向 REFUND 交易並連動方案堂數。
                </p>

                {/* 退款方式 */}
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-earth-700">退款方式</label>
                  <div className="flex flex-col gap-1 text-sm text-earth-700">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="refundMode"
                        value="FULL_UNUSED"
                        checked={refundMode === "FULL_UNUSED"}
                        onChange={() => setRefundMode("FULL_UNUSED")}
                      />
                      <span>全額退款（未使用方案）</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="refundMode"
                        value="REMAINING_SESSIONS"
                        checked={refundMode === "REMAINING_SESSIONS"}
                        onChange={() => setRefundMode("REMAINING_SESSIONS")}
                      />
                      <span>退剩餘堂數</span>
                    </label>
                  </div>
                </div>

                {/* 試算 */}
                <div className="mb-3 rounded border border-earth-200 bg-earth-50/50 px-3 py-2 text-sm">
                  <Row
                    label="原購買金額"
                    value={`NT$ ${data.amount.toLocaleString()}`}
                  />
                  <Row label="總堂數" value={`${data.customerPlanWallet.totalSessions}`} />
                  <Row
                    label="已使用"
                    value={`${data.customerPlanWallet.sessionsBreakdown.completed}`}
                  />
                  <Row
                    label="預約佔用"
                    value={`${data.customerPlanWallet.sessionsBreakdown.reserved}`}
                  />
                  <Row
                    label="可退款堂數"
                    value={`${data.customerPlanWallet.sessionsBreakdown.available}`}
                  />
                  {refundPlan?.ok ? (
                    <Row
                      label="預計退款"
                      value={`NT$ ${refundPlan.refundAmount.toLocaleString()}`}
                    />
                  ) : (
                    refundPlan && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        {refundPlan.message}
                      </div>
                    )
                  )}
                </div>

                {/* 原因 */}
                <textarea
                  value={refundReasonInput}
                  onChange={(e) => setRefundReasonInput(e.target.value)}
                  placeholder="退款原因（必填）"
                  rows={3}
                  maxLength={500}
                  className="w-full rounded border border-earth-300 px-2 py-1 text-sm focus:outline-none focus:border-primary-400"
                />

                {/* 操作 */}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setView("main")}
                    className="rounded border border-earth-300 px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-50"
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    disabled={
                      isPending ||
                      !refundReasonInput.trim() ||
                      // 試算失敗時 disabled，避免送出明知會被擋的請求
                      // server action 仍會以同樣 logic 再驗一次（防 race）
                      !refundPlan?.ok
                    }
                    onClick={handleRefundConfirm}
                    className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {isPending ? "處理中…" : "確認退款"}
                  </button>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </RightSheet>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const titleColor = tone === "danger" ? "text-red-600" : "text-earth-700";
  const borderColor = tone === "danger" ? "border-red-100" : "border-earth-100";
  return (
    <section className={`mb-5 border-t ${borderColor} pt-3 first:border-t-0 first:pt-0`}>
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${titleColor}`}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-earth-500">{label}</span>
      <span className="text-earth-800">{value}</span>
    </div>
  );
}
