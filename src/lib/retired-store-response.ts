import { NextResponse } from "next/server";

/** No store names, account data, scripts or business controls on this public response. */
export function retiredStoreResponse(hq = false): NextResponse {
  const response = new NextResponse(`<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>此模組已停用｜蒸管家</title>
<style>body{margin:0;background:#f8f5ee;color:#293b32;font:16px/1.7 system-ui,sans-serif}main{box-sizing:border-box;min-height:100dvh;display:grid;place-items:center;padding:24px}section{box-sizing:border-box;width:100%;max-width:480px;padding:32px;border:1px solid #ded8ca;border-radius:16px;background:white;overflow-wrap:anywhere}h1{font-size:24px;line-height:1.4;margin:0 0 16px}p{margin:0 0 16px}nav{display:flex;flex-wrap:wrap;gap:12px}a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid #ded8ca;border-radius:8px;color:#123e32}a:focus-visible{outline:3px solid #123e32;outline-offset:3px}</style>
</head><body><main><section aria-labelledby="title"><h1 id="title">此模組已停用</h1><p>SPA 模組已移除，此店舖的前後台功能不再開放。</p><p>歷史資料保留，授權人員可由總部查閱歷史操作紀錄。</p><nav aria-label="返回入口"><a href="/">返回官網</a>${hq ? '<a href="/hq/login">返回總部</a>' : ""}</nav></section></main></body></html>`, {
    status: 410,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    },
  });
  if (hq) {
    // A retired selection cannot be used again; allow the existing HQ login
    // redirect to recover without sending the administrator back to this store.
    response.cookies.delete("active-store-id");
    response.cookies.delete("store-slug");
  }
  return response;
}
