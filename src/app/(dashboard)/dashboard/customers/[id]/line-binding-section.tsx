"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { generateLineBindingCode, unlinkLineAccount } from "@/server/actions/reminder";

const LINE_OA_URL = process.env.NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL ?? "";

interface LineBindingSectionProps {
  customerId: string;
  lineLinkStatus: string;
  lineUserId: string | null;
  lineLinkedAt: string | null; // ISO string
  lineBindingCode: string | null;
  lineBindingCodeCreatedAt: string | null; // ISO string
}

export function LineBindingSection({
  customerId,
  lineLinkStatus,
  lineUserId,
  lineLinkedAt,
  lineBindingCode: initialCode,
  lineBindingCodeCreatedAt: initialCodeCreatedAt,
}: LineBindingSectionProps) {
  const router = useRouter();
  const [bindingCode, setBindingCode] = useState(initialCode);
  const [codeCreatedAt, setCodeCreatedAt] = useState(initialCodeCreatedAt);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [status, setStatus] = useState(lineLinkStatus);
  const [copied, setCopied] = useState(false);
  const [expiryText, setExpiryText] = useState("");

  // ── 計算綁定碼剩餘有效時間 ──
  const updateExpiry = useCallback(() => {
    if (!codeCreatedAt) {
      setExpiryText("");
      return;
    }
    const created = new Date(codeCreatedAt).getTime();
    const expiresAt = created + 24 * 60 * 60 * 1000;
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      setExpiryText("已過期");
      return;
    }

    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    if (hours > 0) {
      setExpiryText(`${hours} 小時 ${minutes} 分後過期`);
    } else {
      setExpiryText(`${minutes} 分鐘後過期`);
    }
  }, [codeCreatedAt]);

  useEffect(() => {
    updateExpiry();
    const timer = setInterval(updateExpiry, 60_000); // 每分鐘更新
    return () => clearInterval(timer);
  }, [updateExpiry]);

  // ── 自動刷新：等待綁定完成 / re-follow 恢復 ──
  useEffect(() => {
    // LINKED → 不需要刷新
    if (status === "LINKED") return;
    // UNLINKED 且沒有綁定碼 → 沒在等待綁定，不刷新
    if (status === "UNLINKED" && !bindingCode) return;
    // BLOCKED → 需要偵測 re-follow 恢復（不依賴 bindingCode）
    // UNLINKED + 有綁定碼 → 需要偵測綁定成功

    const interval = setInterval(() => {
      router.refresh();
    }, 10_000);

    return () => clearInterval(interval);
  }, [status, bindingCode, router]);

  // ── Sync props when server re-renders ──
  useEffect(() => {
    setStatus(lineLinkStatus);
  }, [lineLinkStatus]);

  useEffect(() => {
    if (lineLinkStatus === "LINKED" && status !== "LINKED") {
      setStatus("LINKED");
      if (status === "BLOCKED") {
        setMessage({ text: "LINE 已重新連結（顧客重新加入好友）", type: "success" });
      } else {
        setMessage({ text: "LINE 綁定成功！", type: "success" });
      }
    }
  }, [lineLinkStatus, status]);

  // ── 產生綁定碼 ──
  async function handleGenerateCode() {
    setPending(true);
    setMessage(null);
    const result = await generateLineBindingCode(customerId);
    if (result.success) {
      setBindingCode(result.data.code);
      setCodeCreatedAt(new Date().toISOString());
      setMessage({ text: "綁定碼已產生（舊碼已失效）", type: "success" });
    } else {
      setMessage({ text: result.error, type: "error" });
    }
    setPending(false);
  }

  // ── 解除綁定 ──
  async function handleUnlink() {
    if (!confirm("確定要解除此顧客的 LINE 綁定嗎？\n解除後顧客將無法收到 LINE 通知。")) return;
    setPending(true);
    setMessage(null);
    const result = await unlinkLineAccount(customerId);
    if (result.success) {
      setStatus("UNLINKED");
      setBindingCode(null);
      setCodeCreatedAt(null);
      setMessage({ text: "已解除綁定", type: "success" });
    } else {
      setMessage({ text: result.error, type: "error" });
    }
    setPending(false);
  }

  // ── 複製綁定指令 ──
  async function handleCopy() {
    if (!bindingCode) return;
    try {
      await navigator.clipboard.writeText(`綁定 ${bindingCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = `綁定 ${bindingCode}`;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ── 遮蔽 LINE User ID ──
  function maskLineUserId(uid: string) {
    if (uid.length <= 8) return uid.slice(0, 4) + "****";
    return uid.slice(0, 4) + "****" + uid.slice(-4);
  }

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-earth-800">
        <svg className="h-4 w-4 text-[#06C755]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .348-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .349-.281.63-.63.63h-2.386a.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 .63-.63h2.386c.349 0 .63.282.63.63 0 .349-.281.631-.63.631H17.61v1.125h1.755zm-3.855 3.016a.63.63 0 0 1-.63.63.629.629 0 0 1-.51-.262l-2.442-3.339v2.97a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 .63-.63c.2 0 .383.096.51.262l2.442 3.339V8.108a.63.63 0 0 1 1.26 0v4.771zm-5.741 0a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 1.26 0v4.771zm-2.466.63H4.917a.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 1.26 0v4.141h1.756c.348 0 .629.283.629.63 0 .349-.281.63-.629.63M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.122.301.079.771.039 1.075l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.023 14.469 24 12.512 24 10.314" />
        </svg>
        LINE 綁定
      </h3>

      {/* ═══════════════ 已綁定 ═══════════════ */}
      {status === "LINKED" && (
        <div className="space-y-3">
          {/* 狀態標籤 */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#06C755]/10 px-2.5 py-1 text-xs font-medium text-[#06C755]">
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              已綁定
            </span>
            {lineLinkedAt && (
              <span className="text-xs text-earth-400">
                {new Date(lineLinkedAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })} 綁定
              </span>
            )}
          </div>

          {/* LINE User ID（遮蔽） */}
          {lineUserId && (
            <div className="flex items-center gap-2 rounded-lg bg-earth-50 px-3 py-2">
              <span className="text-xs text-earth-500">LINE User ID</span>
              <code className="text-xs font-mono text-earth-600">
                {maskLineUserId(lineUserId)}
              </code>
            </div>
          )}

          {/* 解除綁定 */}
          <button
            onClick={handleUnlink}
            disabled={pending}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {pending ? "處理中..." : "解除綁定"}
          </button>
        </div>
      )}

      {/* ═══════════════ 已封鎖 ═══════════════ */}
      {status === "BLOCKED" && (
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            已封鎖
          </span>
          <p className="text-xs text-earth-400">
            此顧客已封鎖 LINE 官方帳號，需顧客重新加入好友後才能自動恢復綁定。
          </p>
        </div>
      )}

      {/* ═══════════════ 未綁定 ═══════════════ */}
      {status === "UNLINKED" && (
        <div className="space-y-4">
          {/* 綁定碼區塊 */}
          <div className="rounded-lg border border-earth-200 bg-earth-50 p-4">
            {bindingCode ? (
              <div className="space-y-3">
                {/* 綁定碼顯示 */}
                <div>
                  <p className="text-xs text-earth-500">綁定碼</p>
                  <p className="mt-1 text-2xl font-bold tracking-[0.3em] text-earth-900">
                    {bindingCode}
                  </p>
                </div>

                {/* 有效時間 */}
                {expiryText && (
                  <p className={`text-xs ${expiryText === "已過期" ? "text-red-500 font-medium" : "text-earth-400"}`}>
                    {expiryText === "已過期" ? "此綁定碼已過期，請重新產生" : expiryText}
                  </p>
                )}

                {/* 複製綁定指令 */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded border border-earth-300 bg-white px-3 py-1.5">
                    <code className="text-sm font-medium text-earth-800">
                      綁定 {bindingCode}
                    </code>
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      copied
                        ? "bg-green-100 text-green-700"
                        : "bg-primary-100 text-primary-700 hover:bg-primary-200"
                    }`}
                  >
                    {copied ? (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        已複製
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>
                        複製指令
                      </>
                    )}
                  </button>
                </div>

                {/* 重新產生 */}
                <button
                  onClick={handleGenerateCode}
                  disabled={pending}
                  className="text-xs text-primary-600 hover:underline disabled:opacity-50"
                >
                  {pending ? "產生中..." : "重新產生綁定碼"}
                </button>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-earth-600">尚未產生綁定碼</p>
                <p className="mt-1 text-xs text-earth-400">
                  產生綁定碼後，顧客可在 LINE 官方帳號中完成綁定
                </p>
                <button
                  onClick={handleGenerateCode}
                  disabled={pending}
                  className="mt-3 rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {pending ? "產生中..." : "產生綁定碼"}
                </button>
              </div>
            )}
          </div>

          {/* 加入 LINE 好友 */}
          {LINE_OA_URL ? (
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
          ) : (
            <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
              LINE 官方帳號連結尚未設定，請至環境變數設定 <code className="font-mono bg-yellow-100 px-1 rounded">NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL</code>
            </p>
          )}

          {/* 綁定步驟說明 */}
          {bindingCode && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-800">LINE 綁定步驟</p>
              <ol className="mt-2 space-y-1 text-xs text-blue-700">
                <li>1. 請顧客加入 LINE 官方帳號好友</li>
                <li>2. 在 LINE 對話框中傳送上方的綁定指令</li>
                <li>3. 系統驗證成功後即完成綁定</li>
              </ol>
              <p className="mt-2 text-xs text-blue-500">
                綁定完成後此頁面會自動更新
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ 訊息提示 ═══════════════ */}
      {message && (
        <p className={`mt-3 text-xs font-medium ${
          message.type === "error" ? "text-red-600" : "text-green-600"
        }`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
