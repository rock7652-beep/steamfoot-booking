"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adjustCheckoutToPackage } from "@/server/actions/booking-checkout";

/**
 * 調整結帳方式 Modal（drawer-only 入口，Phase 1）。
 *
 * 單一情境：SINGLE（單次、未收款）→ PACKAGE_SESSION（方案扣堂）。
 * 店長把「同一筆既有預約」改成扣方案，不重約、不收款、不佔其他時段。
 * 送出即時轉換（配堂 RESERVED），真正扣堂仍在「完成服務」才發生。
 *
 * 沿用 CollectSingleModal 樣式，維持後台一致觀感。wallet 候選與預選
 * （recommended = FEFO 第一張）由 drawer payload 帶入。
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
  /** FEFO 排序後的候選方案；第一張 recommended=true */
  wallets: WalletOption[];
  /** 轉換成功後回呼（母層負責關閉 / 重抓 detail / 重整月曆）。 */
  onAdjusted: () => void;
}

export function AdjustCheckoutModal({
  open,
  onClose,
  bookingId,
  customerName,
  dateLabel,
  wallets,
  onAdjusted,
}: Props) {
  const recommended = wallets.find((w) => w.recommended) ?? wallets[0];
  const [walletId, setWalletId] = useState<string>(recommended?.id ?? "");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function handleConfirm() {
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
          調整結帳方式
        </h3>
        <p className="mb-3 text-sm text-earth-600">
          將此預約由「單次收款」改為「方案扣堂」。送出後不會收款、不會重約，
          實際扣堂於「完成服務」時才發生。
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
          {wallets.map((w) => (
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
                <span className="font-medium text-earth-900">{w.planName}</span>
                {w.recommended ? (
                  <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700">
                    建議
                  </span>
                ) : null}
              </span>
              <span className="text-right text-earth-600">
                <span className="tabular-nums">剩 {w.remainingSessions} 堂</span>
                {w.expiryDate ? (
                  <span className="ml-2 text-[11px] text-earth-400">
                    到期 {w.expiryDate}
                  </span>
                ) : (
                  <span className="ml-2 text-[11px] text-earth-400">無期限</span>
                )}
              </span>
            </label>
          ))}
        </div>

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
            disabled={pending || !walletId}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "處理中..." : "確認調整"}
          </button>
        </div>
      </div>
    </div>
  );
}
