"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tryAutoLinkHealth } from "@/server/actions/health";
import { HealthLinkModal } from "./health-link-modal";
import { HEALTH_ASSESSMENT_URL } from "@/lib/health-assessment";

// ── 外部連結提示 Modal ──
function ExternalLinkWarning({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-earth-900">即將前往外部系統</h3>
        <div className="mt-3 space-y-2 text-xs text-earth-600">
          <p>您即將前往<strong>AI 健康評估系統</strong>，這是獨立的外部服務。</p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="font-medium text-amber-700">注意事項：</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5 text-amber-600">
              <li>該系統需要獨立的 LINE 登入</li>
              <li>若出現「LINE Token 驗證失敗」，請改用手機瀏覽器（非 LINE 內建瀏覽器）開啟</li>
              <li>或聯繫管理員確認 LINE Login 設定</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white hover:bg-primary-700"
          >
            前往 AI 健康評估系統
          </a>
          <button
            onClick={onClose}
            className="rounded-lg border border-earth-300 px-4 py-2 text-xs text-earth-600 hover:bg-earth-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HealthSectionWrapper — Client 端：背景自動連結 + 狀態分流
// ============================================================

interface HealthSectionWrapperProps {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  healthLinkStatus: string;
  healthProfileId: string | null;
  /** Server-rendered health summary (only when status === "linked") */
  children?: React.ReactNode;
}

export function HealthSectionWrapper({
  customerId,
  customerEmail,
  customerPhone,
  healthLinkStatus,
  healthProfileId,
  children,
}: HealthSectionWrapperProps) {
  const router = useRouter();
  const [status, setStatus] = useState(healthLinkStatus);
  const [profileId, setProfileId] = useState(healthProfileId);
  const [autoLinking, setAutoLinking] = useState(false);
  const [showExternalWarning, setShowExternalWarning] = useState(false);
  const [, startTransition] = useTransition();

  // 背景自動連結（僅 unlinked 狀態觸發一次）
  useEffect(() => {
    if (status !== "unlinked") return;

    setAutoLinking(true);
    startTransition(async () => {
      const res = await tryAutoLinkHealth(customerId);
      if (res.status === "linked" && res.healthProfileId) {
        setStatus("linked");
        setProfileId(res.healthProfileId);
        // revalidatePath 會讓 server component 重新 render
      } else if (res.status === "not_found") {
        setStatus("not_found");
      } else if (res.status === "error") {
        setStatus("error");
      }
      // already_linked / no_email → 保持現狀
      setAutoLinking(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 手動重試（error 狀態）
  function handleRetry() {
    setStatus("unlinked");
    setAutoLinking(true);
    startTransition(async () => {
      const res = await tryAutoLinkHealth(customerId);
      if (res.status === "linked" && res.healthProfileId) {
        setStatus("linked");
        setProfileId(res.healthProfileId);
      } else if (res.status === "not_found") {
        setStatus("not_found");
      } else {
        setStatus("error");
      }
      setAutoLinking(false);
    });
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-earth-800">AI健康評估</h2>
        <span className="ml-2 inline-flex items-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-white">AI 分析</span>
        <div className="flex items-center gap-2">
          {status === "linked" && (
            <button
              type="button"
              onClick={() => setShowExternalWarning(true)}
              className="text-xs text-primary-600 hover:underline"
            >
              前往完整系統 ↗
            </button>
          )}
          <HealthLinkModal
            customerId={customerId}
            customerEmail={customerEmail}
            customerPhone={customerPhone}
            currentStatus={status}
            currentHealthProfileId={profileId}
            onLinked={(pid) => {
              setStatus("linked");
              setProfileId(pid);
              router.refresh();
            }}
            onUnlinked={() => {
              setStatus("unlinked");
              setProfileId(null);
              router.refresh();
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        {/* ===== 已連結 ===== */}
        {status === "linked" && profileId && children}

        {/* ===== 自動連結中 ===== */}
        {status === "unlinked" && autoLinking && (
          <div className="flex items-center gap-2 rounded-lg border border-earth-200 bg-earth-50 p-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            <p className="text-sm text-earth-500">正在比對 AI 健康評估資料...</p>
          </div>
        )}

        {/* ===== 尚未連結（自動比對未啟動或等待中） ===== */}
        {status === "unlinked" && !autoLinking && (
          <div className="rounded-lg border border-earth-200 bg-earth-50 p-4 text-center">
            <p className="text-sm text-earth-500">尚未建立 AI 健康評估資料</p>
            <p className="mt-1 text-xs text-earth-400">
              系統將自動透過 Email / 手機進行健康資料比對，或可點擊右上方手動建立您的健康評估檔案。
            </p>
          </div>
        )}

        {/* ===== 查無對應帳號 ===== */}
        {status === "not_found" && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
            <p className="text-sm text-yellow-700">
              查無對應的健康評估資料
            </p>
            <p className="mt-1 text-xs text-yellow-600">
              顧客可能尚未建立 AI 健康評估檔案，或使用了不同的 Email / 手機
            </p>
          </div>
        )}

        {/* ===== 錯誤 ===== */}
        {status === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-700">AI 健康評估暫時無法載入</p>
            <button
              onClick={handleRetry}
              disabled={autoLinking}
              className="mt-2 rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
            >
              {autoLinking ? "重試中..." : "重新嘗試"}
            </button>
          </div>
        )}
      </div>

      {/* 外部連結提示 */}
      {showExternalWarning && (
        <ExternalLinkWarning
          url={HEALTH_ASSESSMENT_URL}
          onClose={() => setShowExternalWarning(false)}
        />
      )}
    </div>
  );
}
