import { z } from "zod";

export const googleReviewUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .url("請輸入有效的 Google 評論網址")
  .refine((value) => {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "g.page" || host === "maps.app.goo.gl") return true;
    if (host === "search.google.com") return url.pathname === "/local/writereview";
    if (host === "maps.google.com") return true;
    if (host === "google.com" || host === "www.google.com") {
      return url.pathname === "/search" || url.pathname.startsWith("/maps");
    }
    return false;
  }, "僅允許 HTTPS Google 評論網址");

export function buildGoogleReviewMessage(shopName: string, reviewUrl: string): string {
  return `謝謝你今天來${shopName}放鬆 ❤️\n\n歡迎留下真實體驗，\n讓更多人認識我們。\n\n前往 Google 評論：\n${reviewUrl}`;
}
