"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";

/**
 * 顧客端頁面切換進度條
 *
 * 偵測路由變化，在頁面頂部顯示細長進度條動畫。
 * 讓使用者在點選導航後立即看到「正在載入」的回饋。
 */
export function NavProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);

  useEffect(() => {
    if (pathname !== prevPath) {
      // 路由已完成切換
      setLoading(false);
      setPrevPath(pathname);
    }
  }, [pathname, prevPath]);

  // 攔截所有 <a> click 來啟動 loading
  const handleClick = useCallback(
    (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href === pathname) return;
      // 同域內部連結 → 啟動 loading
      setLoading(true);
    },
    [pathname]
  );

  useEffect(() => {
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [handleClick]);

  if (!loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px]">
      <div className="h-full w-full bg-primary-100">
        <div
          className="h-full bg-primary-500 animate-progress-bar"
          style={{ animationDuration: "2s" }}
        />
      </div>
      <style>{`
        @keyframes progress-bar {
          0% { width: 0%; }
          20% { width: 30%; }
          50% { width: 60%; }
          80% { width: 85%; }
          100% { width: 95%; }
        }
        .animate-progress-bar {
          animation: progress-bar 2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
