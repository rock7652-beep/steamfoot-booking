"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  adjustCheckoutToPackage,
  adjustCheckoutToSingle,
} from "@/server/actions/booking-checkout";

/**
 * 調整結帳方式 Modal（drawer-only 入口）。
 *
 * mode="toPackage"（Phase 1）：SINGLE（單次、未收款）→ PACKAGE_SESSION（方案扣堂）。
 *   店長把既有預約改成扣方案，送出即時轉換（配堂 RESERVED），真正扣堂於「完成服務」才發生。
 *
 * mode="toSingle"（Phase 2 / Mode B）：PACKAGE_SESSION（方案扣堂）→ SINGLE（單次、未收款）。
 *   店長現場改促銷／優惠不想扣堂，把預約翻成乾淨的單次未收款。本 Modal 不輸入金額、
 *   不收款、不建交易——促銷價留到之後既有「收款」Modal 由店長用原價/實收/折扣處理。
 *   調整原因為選填。
 *
 * 沿用 CollectSingleModal 樣式，維持後台一致觀感。
 */

interface WalletOption {
  id: string;
  planName: string;
  remainingSessions: number;
  expiryDate: string | null;
  recommended: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  customerName: string;
  dateLabel: string;
  /** 轉換成功後回呼（母層負責關閉 / 重抓 detail / 重整月曆）。 */
  onAdjusted: () => void;
  /** 預設 toPackage（Phase 1）；toSingle = Mode B。 */
  mode?: "toPackage" | "toSingle";
  /** mode=toPackage：FEFO 排序後的候選方案；第一張 recommended=true。 */
  wallets?: WalletOption[];
  /** mode=toSingle：目前方案名稱（顯示用）。 */
  currentPlanName?: string | null;
  /** mode=toSingle：目前方案剩餘堂數（顯示用）。 */
  currentRemaining?: number | null;
  /** mode=toSingle：轉換後單次原價（顯示用，預設 799）。 */
  singleDefaultPrice?: number;
}

export function AdjustCheckoutModal({
  open,
  onClose,
  bookingId,
  customerName,
  dateLabel,
  onAdjusted,
  mode = "toPackage",
  wallets,
  currentPlanName,
  currentRemaining,
  singleDefaultPrice = 799,
}: Props) {
  const walletList = wallets ?? [];
  const recommended = walletList.find((w) => w.recommended) ?? walletList[0];
  const [walletId, setWalletId] = useState<string>(recommended?.id ?? "");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const isToSingle = mode === "toSingle";

  function handleConfirm() {
    if (isToSingle) {
      startTransition(async () => {
        const trimmed = reason.trim();
        const r = await adjustCheckoutToSingle({
          bookingId,
          reason: trimmed.length > 0 ? trimmed : undefined,
        });
        if (r.success) {
          toast.success("已改為單次未收款");
          onAdjusted();
        } else {
          toast.error(r.error ?? "調整失敗");
        }
      });
      return;
    }

    if (!walletId) {
      toast.error("請選擇要扣堂的方案");
      return;
    }
    startTransition(async () => {
      const r = await adjustCheckoutToPackage({ bookingId, walletId });
      if (r.success) {
        toast.success("已改為方案扣堂");
        onAdjusted();
      } else {
        toast.error(r.error ?? "調整失敗");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-semibold text-earth-900">
          {isToSingle ? "調整本次預約結帳方式" : "補選本次預約方案"}
        </h3>

        {isToSingle ? (
          <>
            <p className="mb-3 text-sm text-earth-600">
              送出後，這筆預約會改為單次未收款（不扣方案堂數）。後續可在收款時輸入實收金額與折扣原因。
            </p>

            <div className="mb-4 space-y-1.5 rounded-lg bg-earth-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-earth-500">顧客</span>
                <span className="font-medium text-earth-900">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">預約</span>
                <span className="text-earth-700 tabular-nums">{dateLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">目前結帳方式</span>
                <span className="text-earth-700">
                  方案扣堂
                  {currentPlanName ? `｜${currentPlanName}` : ""}
                  {currentRemaining != null ? `｜剩 ${currentRemaining} 堂` : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">調整後</span>
                <span className="font-medium text-primary-700">
                  單次付款，不扣方案堂數（原價 NT$ {singleDefaultPrice.toLocaleString()}，未收款）
                </span>
              </div>
            </div>

            <label className="mb-1 block text-xs font-medium text-earth-600">
              調整原因（選填）
            </label>
            <textarea
              value={reason}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="例如：連蒸第二天優惠、帶爸媽同行優惠、店長現場促銷"
              className="mb-4 w-full resize-none rounded-lg border border-earth-300 px-3 py-2 text-sm"
            />
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-earth-600">
              此預約尚未連結使用方案。系統已優先選擇最快到期的方案；
              送出後立即保留一堂，取消預約才會退回。
            </p>

            <div className="mb-4 space-y-1.5 rounded-lg bg-earth-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-earth-500">顧客</span>
                <span className="font-medium text-earth-900">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">預約</span>
                <span className="text-earth-700 tabular-nums">{dateLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">目前結帳方式</span>
                <span className="text-earth-700">單次收款（未收款）</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">調整後</span>
                <span className="font-medium text-primary-700">方案扣堂</span>
              </div>
            </div>

            <label className="mb-1 block text-xs font-medium text-earth-600">
              選擇扣堂方案
            </label>
            <div className="mb-4 space-y-2">
              {walletList.map((w) => (
                <label
                  key={w.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    walletId === w.id
                      ? "border-primary-500 bg-primary-50"
                      : "border-earth-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="adjust-wallet"
                      value={w.id}
                      checked={walletId === w.id}
                      disabled={pending}
                      onChange={() => setWalletId(w.id)}
                    />
                    <span className="font-medium text-earth-900">
                      {w.planName}
                    </span>
                    {w.recommended ? (
                      <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700">
                        建議
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right text-earth-600">
                    <span className="tabular-nums">
                      剩 {w.remainingSessions} 堂
                    </span>
                    {w.expiryDate ? (
                      <span className="ml-2 text-[11px] text-earth-400">
                        到期 {w.expiryDate}
                      </span>
                    ) : (
                      <span className="ml-2 text-[11px] text-earth-400">
                        無期限
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-600 hover:bg-earth-200 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || (!isToSingle && !walletId)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "處理中..." : isToSingle ? "確認調整" : "確認使用此方案"}
          </button>
        </div>
      </div>
    </div>
  );
}
