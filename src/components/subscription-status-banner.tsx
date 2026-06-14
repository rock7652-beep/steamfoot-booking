"use client";

import { useEffect, useState } from "react";

/**
 * 店家訂閱到期 / 暫停的登入提醒（§5）。
 *   - EXPIRED  →「您的系統已到期，請聯繫總部續約」
 *   - SUSPENDED→「系統已暫停使用，請聯繫總部續約」
 * 可關閉；以 sessionStorage 記住，關閉後本次瀏覽工作階段不再出現，
 * 下次登入（新 session）會再出現。本元件只提醒、不限制任何操作。
 */
export function SubscriptionStatusBanner({
  state,
}: {
  state: "EXPIRED" | "SUSPENDED";
}) {
  // 先隱藏，待 client 讀 sessionStorage 後再決定，避免關閉後又閃現
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(sessionStorage.getItem(`subBanner:${state}`) === "1");
  }, [state]);

  if (hidden) return null;

  const message =
    state === "EXPIRED"
      ? "您的系統已到期，請聯繫總部續約"
      : "系統已暫停使用，請聯繫總部續約";
  const tone =
    state === "SUSPENDED"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-orange-200 bg-orange-50 text-orange-700";

  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 text-[13px] font-medium ${tone}`}
      role="status"
    >
      <span>⚠ {message}</span>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(`subBanner:${state}`, "1");
          setHidden(true);
        }}
        className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium opacity-70 hover:bg-white/50 hover:opacity-100"
      >
        關閉
      </button>
    </div>
  );
}
