"use client";

import { useState } from "react";
import { generateLineBindingCode, unlinkLineAccount } from "@/server/actions/reminder";

const LINE_OA_URL = process.env.NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL ?? "";

interface LineBindingSectionProps {
  customerId: string;
  lineLinkStatus: string;
  lineUserId: string | null;
  lineLinkedAt: string | null; // ISO string
  lineBindingCode: string | null;
}

export function LineBindingSection({
  customerId,
  lineLinkStatus,
  lineUserId,
  lineLinkedAt,
  lineBindingCode: initialCode,
}: LineBindingSectionProps) {
  const [bindingCode, setBindingCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState(lineLinkStatus);

  async function handleGenerateCode() {
    setPending(true);
    setMessage(null);
    const result = await generateLineBindingCode(customerId);
    if (result.success) {
      setBindingCode(result.data.code);
      setMessage("綁定碼已產生");
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  async function handleUnlink() {
    if (!confirm("確定要解除此顧客的 LINE 綁定嗎？")) return;
    setPending(true);
    setMessage(null);
    const result = await unlinkLineAccount(customerId);
    if (result.success) {
      setStatus("UNLINKED");
      setBindingCode(null);
      setMessage("已解除綁定");
    } else {
      setMessage(result.error);
    }
    setPending(false);
  }

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="mb-3 text-sm font-medium text-earth-700">LINE 綁定</h3>

      {status === "LINKED" ? (
        /* ─── 已綁定 ─── */
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#06C755]/10 px-2.5 py-1 text-xs font-medium text-[#06C755]">
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              已綁定
            </span>
            {lineLinkedAt && (
              <span className="text-xs text-earth-400">
                {new Date(lineLinkedAt).toLocaleDateString("zh-TW")} 綁定
              </span>
            )}
          </div>

          {lineUserId && (
            <p className="text-xs text-earth-400">LINE User ID: {lineUserId}</p>
          )}

          <button
            onClick={handleUnlink}
            disabled={pending}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {pending ? "處理中..." : "解除綁定"}
          </button>
        </div>
      ) : status === "BLOCKED" ? (
        /* ─── 已封鎖 ─── */
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">
            已封鎖
          </span>
          <p className="mt-2 text-xs text-earth-400">
            此顧客已封鎖 LINE 官方帳號，需顧客重新加入好友後才能重新綁定。
          </p>
        </div>
      ) : (
        /* ─── 未綁定 ─── */
        <div className="space-y-4">
          {/* 綁定碼區塊 */}
          <div className="rounded-lg border border-earth-200 bg-earth-50 p-4">
            {bindingCode ? (
              <div>
                <p className="text-xs text-earth-500">綁定碼</p>
                <p className="mt-1 text-2xl font-bold tracking-[0.3em] text-earth-900">
                  {bindingCode}
                </p>
                <button
                  onClick={handleGenerateCode}
                  disabled={pending}
                  className="mt-2 text-xs text-primary-600 hover:underline disabled:opacity-50"
                >
                  {pending ? "產生中..." : "重新產生綁定碼"}
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-earth-600">尚未產生綁定碼</p>
                <button
                  onClick={handleGenerateCode}
                  disabled={pending}
                  className="mt-2 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {pending ? "產生中..." : "產生綁定碼"}
                </button>
              </div>
            )}
          </div>

          {/* 加入 LINE 好友按鈕 */}
          {LINE_OA_URL && (
            <a
              href={LINE_OA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#06C755] px-4 py-2 text-sm font-medium text-white hover:bg-[#05b04c] transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .348-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .349-.281.63-.63.63h-2.386a.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 .63-.63h2.386c.349 0 .63.282.63.63 0 .349-.281.631-.63.631H17.61v1.125h1.755zm-3.855 3.016a.63.63 0 0 1-.63.63.629.629 0 0 1-.51-.262l-2.442-3.339v2.97a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 .63-.63c.2 0 .383.096.51.262l2.442 3.339V8.108a.63.63 0 0 1 1.26 0v4.771zm-5.741 0a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 1.26 0v4.771zm-2.466.63H4.917a.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 1.26 0v4.141h1.756c.348 0 .629.283.629.63 0 .349-.281.63-.629.63M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.122.301.079.771.039 1.075l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.023 14.469 24 12.512 24 10.314" />
              </svg>
              加入 LINE 官方帳號
            </a>
          )}

          {/* QR Code 預留位置 */}
          {LINE_OA_URL && (
            <p className="text-xs text-earth-400">
              或掃描 LINE 官方帳號 QR Code 加入好友
            </p>
          )}

          {/* 綁定步驟說明 */}
          {bindingCode && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-800">LINE 綁定步驟</p>
              <ol className="mt-2 space-y-1 text-xs text-blue-700">
                <li>1. 請顧客點擊上方「加入 LINE 官方帳號」按鈕</li>
                <li>2. 加好友後，在 LINE 對話框傳送：</li>
                <li className="ml-3 font-mono font-bold">綁定 {bindingCode}</li>
                <li>3. 系統驗證成功後即完成綁定</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {message && (
        <p className={`mt-2 text-xs ${message.includes("失敗") || message.includes("錯誤") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
