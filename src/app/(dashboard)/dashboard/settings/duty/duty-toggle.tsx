"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDutyScheduling } from "@/server/actions/shop";

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  const dateObj = new Date(dateStr + "T00:00:00Z");
  const dow = dateObj.getUTCDay();
  return `${parseInt(m)}/${parseInt(d)}(${DAY_LABELS[dow]})`;
}

interface Props {
  enabled: boolean;
  unscheduledDays: number;
  totalBusinessDays: number;
  unscheduledDates: string[];
}

export function DutySchedulingToggle({
  enabled,
  unscheduledDays,
  totalBusinessDays,
  unscheduledDates,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }

  function handleToggle() {
    const newValue = !isEnabled;

    if (newValue) {
      // 開啟時需確認
      const confirmed = window.confirm(
        "啟用後，未安排值班的時段將不對客戶開放預約。\n\n確定要啟用值班排班聯動？"
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const result = await updateDutyScheduling(newValue);
      if (result.success) {
        setIsEnabled(newValue);
        showMessage("success", newValue ? "已啟用值班排班聯動" : "已關閉值班排班聯動");
        router.refresh();
      } else {
        showMessage("error", result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 訊息提示 */}
      {message && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Toggle 卡片 */}
      <div className="rounded-xl border border-earth-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-bold text-earth-800">啟用值班排班聯動</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-earth-500">
              開啟後，只有已安排值班人員的時段才可開放預約。
              <br />
              未安排值班的時段將對客戶隱藏，也無法透過後台建立預約（OWNER 可略過）。
            </p>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            disabled={isPending}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              isEnabled ? "bg-primary-600" : "bg-earth-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                isEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* 狀態標籤 */}
        <div className="mt-4">
          {isEnabled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
              已啟用 — 預約時段受值班排班控制
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-earth-100 px-3 py-1 text-xs font-medium text-earth-500">
              <span className="h-1.5 w-1.5 rounded-full bg-earth-400" />
              未啟用 — 所有營業時段均可預約
            </span>
          )}
        </div>
      </div>

      {/* 本週未排班提醒（啟用時才顯示） */}
      {isEnabled && unscheduledDays > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">
                本週有 {unscheduledDays}/{totalBusinessDays} 個營業日尚未安排值班
              </p>
              <p className="mt-1 text-xs text-amber-600">
                未排班日期：{unscheduledDates.map(formatDateShort).join("、")}
              </p>
              <p className="mt-1 text-xs text-amber-600">
                這些日期的所有時段目前對客戶不可見，建議儘速安排值班。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 說明 */}
      <div className="rounded-xl border border-earth-200 bg-earth-50 p-4">
        <h3 className="text-xs font-semibold text-earth-600">功能說明</h3>
        <ul className="mt-2 space-y-1.5 text-xs text-earth-500">
          <li>- 關閉狀態：所有營業時段均可接受預約，值班排班僅供內部參考</li>
          <li>- 開啟狀態：只有安排了值班人員的時段才會出現在預約頁面</li>
          <li>- OWNER 在後台代客預約時，可勾選「略過值班檢查」繞過此限制</li>
          <li>- 可隨時關閉，關閉後所有營業時段立即恢復正常</li>
        </ul>
      </div>
    </div>
  );
}
