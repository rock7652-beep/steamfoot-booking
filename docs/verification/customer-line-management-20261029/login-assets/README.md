# 登入頁靜態資源與 RWD 再驗證

受測最新 commit：`29963aabd37ad8f861aa839ce0133e8b454944fe`（應用程式與已通過 CI 的 `af1b5322` 相同，差異僅驗證文件）。

原 Vercel 專案 READY Preview：<https://steamfoot-booking-23x39k0fx-rock7652-2111s-projects.vercel.app>，部署 `dpl_8E8Dit3ghVV1qgZzQfRabZYBR1oV`，非 production。

## 結果與界線

本輪在相同原專案、正常 development OIDC、只對受測 origin 加上認證標頭的條件下，未重現先前的 `/_next/static/immutable/...` 404。沒有修改應用程式、路由、資源 rewrite、部署保護、Preview gate 或對外通知設定，也沒有為通過斷言而攔截／取代失敗回應。

這證明目前受測部署的載入與導覽通過，**不能證明已定位或永久修復先前間歇性 404 的根因**。先前失敗及原始 Network 證據仍保留在 [key-fix](../key-fix/README.md)，不以新結果抹除歷史。

## 檢查證據

1. 直接讀取登入頁及所有直接引用的 JS：HTML 沒有 immutable／Geist 引用；直接引用的 JS 也沒有 immutable 路徑。[來源引用檢查](source-reference-check.json)。
2. 在新 browser context 分別開啟 `/hq/login` 與 `/hq/login?store=staging`，後者保留 Next.js 自動預讀。兩者均沒有 HTTP 失敗；忘記密碼預讀為 HTTP 200、text/x-component，未帶入 immutable 路徑。[最新部署](latest-prefetch.json)。
3. 同法重驗之前出現錯誤的 `af1b5322` 部署（ohm38szky）：兩種入口也沒有重現錯誤。[舊部署對照](previous-prefetch.json)。因此目前不能將原因斷言為應用程式、預讀、平台注入或單一舊部署。
4. 新增可重跑的只讀驗收：[customer-line-login-assets-browser.mjs](../../../../scripts/qa/customer-line-login-assets-browser.mjs)。

## 七組尺寸實測

1366×900、1920×1080、1024×768、768×1024、560×800、390×844、360×800 全部通過：

- 每個尺寸獨立 browser context；實際開頁等待預讀，不停用 JS、不攔截資源、不關閉原本預讀。
- 登入頁 → 忘記密碼 → 返回登入，門市參數仍為 staging，兩個表單主要控制可達且至少 44px。
- 每組 13 個實際靜態資源均為 HTTP 200，沒有 HTTP >=400 或 pageerror；沒有整頁水平溢出。
- 跨尺寸輸入草稿保留。僅輸入 `example.invalid` 測試 Email，沒有提交登入、送信或任何資料寫入。
- [完整量測](browser-results.json)、[手機登入](mobile-login.png)、[iPad 尺寸重設頁](ipad-recovery.png)。人工檢視截圖，字與主要控制可讀可達。
- 腳本語法、ESLint、git whitespace 檢查通過。本次新增 QA 腳本與證據，應用程式沿用已通過全量 CI 的版本。

執行前需以正常 Vercel 登入確認原 team／project，透過同專案 `vercel env run --environment development --project prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR --scope rock7652-2111s-projects -- node scripts/qa/customer-line-login-assets-browser.mjs` 注入短效 OIDC；不列印、不保存 token，不使用分享／bypass 連結。`QA_PREVIEW_BASE` 只能是該原專案 Preview hostname，覆寫時應先核對部署 metadata。

## 仍未驗

- 沒有獨立測試 OA；真實 LINE 捕捉、bot/profile 核對及重新綁定仍未驗。
- Chromium 視窗模擬不等同實體 iPad／手機、Safari 或 LINE LIFF。
- 先前 404 的永久根因未定位；若再現，需保留當下 deployment、Network initiator、request／response 與時間再追查。

維持原 PR #1465，不合併正式站、不將整體標示為完整驗收成功。
