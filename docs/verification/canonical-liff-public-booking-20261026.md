# 公開預約統一 LIFF 入口（2026-10-26，Asia/Taipei）

## 行為與範圍

使用者選擇「把公開分享與圖文選單連結統一換成 LIFF」。公開連結由既有 server-only `resolveBookingLineEntry` 依店家設定產生；客戶端只取得公開 URL。

- 蒸足與美業設定「收款與體驗」、音樂／運動設定及 HQ 店家詳情提供同一共用入口列，可開啟或複製。
- 已設定店家直接使用 LIFF。未設定顯示「本店 LINE 入口尚未設定」，沒有開啟或複製按鈕；不借其他店帳號。
- 竹北公開體驗介紹頁的預約按鈕改用既有竹北體驗 LIFF。
- 加好友後的歡迎訊息直接提供各門市 LIFF。共用 OA 保留每店專屬 `bookingStore` 選擇，不猜門市。
- 帶 `destination=public-trial` 的推薦分享先保留原有來源紀錄與 HttpOnly cookie，再導向同店 LIFF；缺少或店家 ID 不符的設定拒絕導向，不記錄點擊、不設 cookie。
- 一般會員預約網址保留，HQ 明確標示「會員預約頁」。LIFF 身分驗證後的內部表單、一次性 entry、原有預約與會員規則保留；Messenger 的內部預約連結不改為 LINE。
- 本次不修改環境變數、通道、原始 `STORE_LINE_CONFIG_JSON` 或資料庫。

## 舒生活公開連結與圖文選單

公開分享、QR Code 及圖文選單「體驗預約」動作的網址統一為：

```text
https://liff.line.me/2010761154-CmcQZ9Db/public-trial?bookingStore=soulife
```

圖文選單是 LINE Official Account Manager 上另外儲存的設定。必須在舒生活 `@046mqwnp` 原有選單的「體驗預約」動作填入上述 URL，保留原圖與其他動作，儲存後從真人 LINE 點選驗收。

本次工具沒有可操作使用者已登入 LINE 後台的連線，未實際修改、發布或核對圖文選單。程式提供可複製的正確網址，不代表外部選單已更新。

## 驗證

- 8 個入口／Webhook／LIFF 相關測試檔：84 項通過。
- 5 個共用設定與美業隔離相關測試檔：95 項通過。
- 蒸足設定權限／功能呈現測試：19 項通過；推薦分享測試：13 項通過。共 211 項相關測試。
- ESLint（零錯誤，蒸足設定頁原有 `canDuty` 未使用警告）與 `git diff --check` 通過。
- `npx tsc --noEmit --pretty false` 通過。
- 隔離 Preview：`scripts/qa/public-booking-link-browser.mjs`。實際共用設定列，網路請求封鎖，無資料庫或 LINE SDK。
- 390、768、1024、1366 寬度無水平溢出；觸控按鈕至少 44px；未設定沒有可操作連結。
- 複製內容與開啟 URL 完全一致；剪貼簿被拒時，唯讀欄位保留完整 URL 可手動複製。
- 圖片與結果位於 `evidence/20261026-canonical-liff/`。這是共用元件的合成預覽，不代表正式後台登入或真人 LINE 流程驗收。

## 發布與限制

程式尚未合併／發布。依 AGENTS.md，取得這次具體變更的正式站合併授權後才能發布。

真人 LIFF 登入、預約建立、身分連結及通知送達尚未實測；本次只改入口，不將入口可開啟誤寫成通知成功。銀百合及 IDO 通道設定仍依先前指示暫緩。
