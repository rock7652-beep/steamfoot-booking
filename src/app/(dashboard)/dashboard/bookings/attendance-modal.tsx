"use client";

import { useEffect, useState } from "react";

/**
 * PR-3d：「實際到店幾位？」modal — 僅 FIRST_TRIAL 且 people > 1 時
 * 從 booking-detail-drawer 的「完成服務」按鈕觸發。
 *
 * Decision A：只從 完成服務 入口；標記未到 維持既有 NoShowModal。
 * Decision B：0 位到店 由 caller 直接走 markNoShow（不再展開 NoShowModal
 *   扣堂/補課子選項 — 體驗預約無 Wallet/堂數/補課邏輯）。
 * Decision H：選 N 位到店時，收款預設與 day-panel 顯示會用 N 計算；
 *   原 people pill 仍保留以保留「原本預約 M 位」資訊。
 */

interface AttendanceModalProps {
  open: boolean;
  onClose: () => void;
  people: number; // 原本預約人數
  /** 0 → caller 改走 markNoShow；1..people → caller 走 markCompleted。 */
  onConfirm: (attendedPeople: number) => void;
  loading?: boolean;
  /** 用於提示文字 — 顯示「實到 N 人收款預設 NT$xxx」。 */
  trialDefaultUnit?: number | null;
}

interface OptionRow {
  value: number;
  label: string;
  hint: string;
}

function buildOptions(
  people: number,
  trialDefaultUnit: number | null | undefined,
): OptionRow[] {
  const unit = trialDefaultUnit ?? 0;
  const opts: OptionRow[] = [];
  for (let n = 0; n <= people; n++) {
    if (n === 0) {
      opts.push({
        value: 0,
        label: "0 位到店（全部未到）",
        hint: "所有人皆未到，將標記為「未到」。",
      });
    } else if (n === people) {
      opts.push({
        value: n,
        label: `${n} 位全部到店`,
        hint: "全員到店，完成服務。",
      });
    } else {
      const recompute =
        unit > 0 ? `收款預設改為 NT$${(unit * n).toLocaleString()}（可手動調整）` : "收款預設依實到人數計算（可手動調整）";
      opts.push({
        value: n,
        label: `${n} 位到店、${people - n} 位未到`,
        hint: recompute,
      });
    }
  }
  return opts;
}

export function AttendanceModal({
  open,
  onClose,
  people,
  onConfirm,
  loading = false,
  trialDefaultUnit,
}: AttendanceModalProps) {
  // 預設選「全部到店」，符合常見情境；店長若實際是部分到店再切換。
  const [choice, setChoice] = useState<number>(people);
  const [wasOpen, setWasOpen] = useState(false);

  // 每次 open 從關到開時重置為預設（render 階段，非 effect 內 setState）。
  if (open && !wasOpen) {
    setChoice(people);
  }
  useEffect(() => {
    setWasOpen(open);
  }, [open]);

  if (!open) return null;

  const options = buildOptions(people, trialDefaultUnit);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-semibold text-earth-900">
          此預約共 {people} 位，實際到店幾位？
        </h3>
        <p className="mb-3 text-[12px] leading-relaxed text-earth-500">
          選擇後系統會以實到人數計算收款預設金額；可在收款時手動覆蓋。
          原預約人數會保留，不會被改寫。
        </p>

        <div className="mb-4 space-y-2">
          {options.map((o) => {
            const checked = choice === o.value;
            return (
              <label
                key={o.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  checked
                    ? "border-primary-400 bg-primary-50"
                    : "border-earth-200 bg-white hover:bg-earth-50"
                }`}
              >
                <input
                  type="radio"
                  name="attended-people"
                  value={o.value}
                  checked={checked}
                  disabled={loading}
                  onChange={() => setChoice(o.value)}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="block font-medium text-earth-900">
                    {o.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-earth-500">
                    {o.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-600 hover:bg-earth-200 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(choice)}
            disabled={loading}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? "處理中..." : "確認"}
          </button>
        </div>
      </div>
    </div>
  );
}
