"use client";

import { useEffect } from "react";

/**
 * 無 UI 元件 — 負責從 URL ?ref= 讀取推薦人 ID 並存到 localStorage + cookie。
 * 放在 store home 頁和 register 頁即可。
 */
export function RefCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("referrerId", ref);
      document.cookie = `referrer-id=${ref};path=/;max-age=604800;samesite=lax`;
    }
  }, []);

  return null;
}
