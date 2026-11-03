# 圖片公告：既有前台／裝置預覽驗收（2026-10-20）

## 範圍

使用現有後台「前台預覽」及「裝置預覽 → 前台預覽」，以真正店主登入、選取本店合成顧客，讀取本機 PostgreSQL 測試門市與上傳公告，載入既有 iframe。沒有建立新 LIFF 或部署；沒有 mock API、授權或資料庫。

蒸足載入 `PreviewMemberScreen`，共用 LIFF `WelcomeBack`、`LiffMemberFrame`、品牌 header 與 `LiffBottomNavView`；運動／音樂載入既有 `CoursePortalClient` 的唯讀模式。圖片公告在這些共用元件內，因此可以直接驗證 LIFF 的畫面呈現，不需為每個模組另建 LIFF。

本輪沿用獨立 loopback DB、精確 URL／旗標與外網封鎖 browser runner，使用前輪編譯成功的正式版 `next start`。程式變更僅為驗收腳本、證據與報告，未修改產品功能。

## 結果

三個模組各 5 個流程，共 15 個全部通過，結果為 `artifacts/image-announcements-preview-20261020/results.json`。另執行 frontend-preview、LIFF preview navigation 及 device-preview 共 3 檔、41 項測試，全部通過；驗收腳本語法與 `git diff --check` 通過。

本輪沒有產品程式變更，沿用前輪已成功正式編譯的候選版本。驗收完成後停止本次專用 Next server 並移除一次性容器，不操作其他任務或正式資料。

## 驗收內容

- 店主從真正 Email／密碼登入後台，在圖片公告上傳直式及橫式圖片，再從「前台預覽」選取本店會員進入 iframe。
- 6 秒自動輪播；手動切換後 6.5 秒保留同一張；混合比例圖片不使公告區高度跳動。
- 預覽內放大、縮小、關閉成功，關閉後焦點及捲動位置恢復。
- 底部導航可以前往預約並返回首頁；裝置預覽以 1024px 平板及 1440px 桌機外框實際載入雙層 iframe 與會員畫面。
- 另外直接開啟受保護的唯讀預覽頁，在 360／390px 確認無整頁水平溢出。
- 以預覽 referer 發出儲存請求被 HTTP 403 拒絕，資料庫 revision 不變；跨店預覽顯示 404 頁且不顯示對方會員資料。Next 的 streaming notFound 可能是 HTTP 200，故跨店驗收檢查實際呈現的拒絕頁，不只依狀態碼判斷。
- 刪除公告後，同一真實預覽首頁沒有公告 DOM 或空框，素材數量為 0。

## 限制

這是既有唯讀前台預覽的實際驗收，不是 LINE SDK 登入、OAuth/token 交換或 LINE App 內建瀏覽器實測。門市、帳號與圖片皆為合成；預覽不儲存交易，不代表購課、扣款或預約交易通過。

## 重現

1. 依前份獨立驗收報告建立空的本機 PostgreSQL 容器並執行 `node scripts/qa/image-announcements-live.mjs seed`。
2. 使用已編譯的候選版本執行 `node scripts/qa/image-announcements-live.mjs start`；如尚未編譯，先執行 runner 的 `build`。
3. `node scripts/qa/image-announcements-live.mjs preview`。腳本建立獨立運動／音樂測試門市，授予本機測試所需的前台／裝置預覽 entitlement；圖片則由真實後台 UI 上傳。
4. 證據存放於 `artifacts/image-announcements-preview-20261020/`。
