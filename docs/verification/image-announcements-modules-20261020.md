# 圖片公告跨模組補驗（2026-10-20）

本輪沿用 PR #1367 的獨立 worktree、一次性 PostgreSQL 與本機正式編譯模式，不連接正式資料庫，不合併或部署。運動與音樂各建立 COURSE 引擎門市，分別授予 `business.fitness`／`business.music` entitlement，使用各自的店主與顧客帳號。所有登入、上傳、圖片讀取及資料保存走真實應用及資料庫，瀏覽器只允許 localhost 來源。

## 補驗發現與修正

運動／音樂的後台路由 allowlist 未包含圖片公告，因此即使側欄有入口，登入後會被導回課表。本輪於 `src/components/dashboard-layout.tsx` 加入精確的圖片公告路徑；本店人員、頁面權限與寫入授權檢查維持執行。修正後重新執行正式編譯與跨模組瀏覽器驗收。

## 補驗結果

10 個實際流程全部通過（運動／音樂各 5 個），證據為 `artifacts/image-announcements-modules-20261020/results.json` 及各模組首頁與放大截圖。

| 檢查 | 運動 | 音樂 |
| --- | --- | --- |
| 本店店主 Email／密碼登入，進入圖片公告、上傳兩張並儲存 DB | 通過 | 通過 |
| 顧客手機／密碼登入，載入真正 CoursePortal 會員首頁 | 通過 | 通過 |
| 360／390px 寬，圖片完整比例及寬度，無整頁水平溢出 | 通過 | 通過 |
| 6 秒自動切換、CDP 觸控滑動及手動後暫停 | 通過 | 通過 |
| 放大／縮小／關閉、焦點返回原圖片 | 通過 | 通過 |
| 底部功能鍵進入「我的預約」再回「首頁」 | 通過 | 通過 |
| 跨店圖片讀取 404；刪除後素材歸零，首頁無公告空框且導航可用 | 通過 | 通過 |

本輪使用重新編譯後的正式版 `next start`，無 API、auth 或 Prisma mocks；觸控透過 Chromium CDP 傳送 touchStart／touchMove／touchEnd，並非直接呼叫元件 handler。它仍是瀏覽器模擬，不能替代 LINE App 或實體 Safari 驗收。測試帳號沒有實際課程或方案，本輪只涵蓋公告與首頁導航，不代表購課／預約交易全流程。

公告相關 5 檔、24 項回歸通過；修改的 DashboardLayout ESLint、腳本語法與 diff whitespace 檢查通過。新版正式編譯成功（打包 53 秒、230 個靜態頁生成完成），保留既有 Prisma 動態路徑提示。

## LINE 實機狀態

**尚未通過，因缺少實測條件。** 使用者已確認沒有含本次功能的 LINE 測試入口與測試帳號；目前也沒有可操作的 LINE App 裝置／session。本輪不部署測試入口，不建立假 LINE 身分或繞過 SDK 授權，不能將 Chromium 觸控結果標記為 LINE App 通過。

仍需在含候選程式的測試部署，使用真正 LINE App 登入，實測圖片 6 秒切換、滑動、放大、關閉位置恢復與底部導航。這是仍待完成的發布驗收，不代表已全面驗收或取得正式部署授權。

## 重現

1. 依前份獨立驗收報告，啟動空的一次性本機 DB，執行 `node scripts/qa/image-announcements-live.mjs seed`。
2. `node scripts/qa/image-announcements-live.mjs build`，完成後執行 `node scripts/qa/image-announcements-live.mjs start`。
3. 另一終端執行 `node scripts/qa/image-announcements-live.mjs modules`。該腳本要求運動／音樂測試門市尚不存在，不會覆寫既有門市。
4. 檢查 `artifacts/image-announcements-modules-20261020/results.json` 與截圖。完成後停止本次 server，刪除專用容器。

驗收結束後已停止本次專用 Next server、移除專用 PostgreSQL 容器；未影響其他任務。
