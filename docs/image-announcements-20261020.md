# 圖片公告：實作與隔離 Preview（2026-10-20）

## 功能與入口

- 後台「店務管理 → 圖片公告」：`/s/<store>/admin/dashboard/image-announcements`，所有現行模組共用同一管理元件。
- 蒸足網頁會員首頁 `/s/<store>/book`、課程（運動／音樂）會員首頁，以及 LINE 首頁 `WelcomeBack` 使用同一圖片輪播。教師工作模式不插入會員公告。
- 前台只顯示完整圖片、小圓點與放大圖示，不增加可見標題或敘述。首頁圖片改為滿寬、依原始比例完整呈現，不限制為縮圖，也不增加裁切。多圖共享 grid 展示區，由最高圖片預留高度，避免不同長寬比例輪播時讓下方清單跳動；圖片首次載入仍會決定自然高度。首頁底部功能鍵沿用既有固定導覽，預約清單自然往下排列。
- 最多保留 5 張（包含未上架、停用、到期圖片）；拖曳、觸控拖曳及上下按鈕排序；編輯時才展開上下架日期、啟用與刪除。批次儲存，沒有標題／敘述欄位。
- 圖片自動屬於目前門市，不提供模組勾選；所有現行模組共用同一功能，各店只管理及顯示自己的公告。舊 JSON 的 modules 欄位在解析時忽略，不再影響顯示，無須資料庫 migration。
- JPG／PNG，上傳前轉為白底 JPEG，長邊至多 2400px，單張壓至 650KB 以下。A4 為建議，其他比例完整保留，不拉伸／裁切；低解析度及非 A4 只提示。沒有強制補成 A4 畫布。
- 每 6 秒自動切換；碰觸、鍵盤聚焦、手動操作或放大後暫停；尊重減少動態效果偏好。大圖提供切換、兩段縮放、可捲動圖片及固定關閉按鈕，沿用 ModalPanel／RightSheet 的焦點、Escape 與捲動鎖。
- 日期留空即「立即／不限」，台灣時區上架日 00:00 起、下架日整天顯示。有效清單每 60 秒重查、回到頁面時重查；已載入圖片每 30 秒檢查到期。新開啟或重新整理立即依最新設定讀取。
- 未上傳、全部停用、尚未上架或全部到期時不呈現公告區，也不保留空白框；公告查詢失敗不阻斷預約。不會從圖片推算或修改實際課程、時段及名額。

## 權限與儲存

- 頁面與預覽讀取：`business_hours.view`；發布 API：`requirePermission("business_hours.manage")` 加 `resolveWriteStoreId()`，沿用訂閱與跨店唯讀保護。
- 草稿綁定原門市 ID，切換門市後的舊表單不能寫入新門市。沿用共用 `useCourseDraftGuard` 阻擋未儲存時的連結離開、重載及門市切換。
- 同源 Origin 檢查；串流讀取限制 4MiB；限制最多 5 張，日期與張數驗證；Sharp 完整解碼並重編碼 JPEG，拒絕損壞或偽造檔案，清除 metadata。
- Store 列鎖序列化首次及後續儲存；revision 檢查避免多人覆蓋。素材只能引用本門市；更換產生新 UUID；刪除與公告更新在同一交易。
- 公開清單與素材皆 `no-store`；每次素材讀取重新檢查門市與排程。未上架／到期／停用素材只能經授權後台預覽，不因知道 ID 就能公開讀取。

## Migration 與回退

新增 `ImageAnnouncementSet`（門市 JSON 排程與版本）及 `ImageAnnouncementAsset`（JPEG 二進位），外鍵指向 Store 並在刪除該店時 cascade。兩表啟用 RLS，並對存在的 anon／authenticated 角色撤權，來源圖片與未發布排程只能由後端讀取。最多 5 張限制由寫入 API 與門市交易鎖保證；沒有修改既有營業或預約資料。

本次**沒有連接正式資料庫，沒有執行正式 migration，沒有部署或合併**。分支 `feat/image-announcements` 在 Next 設定及 migration runner 開頭阻擋 hosted build；建立 PR 不會啟動資料庫遷移。正式發布前須另完成授權環境的登入與資料庫流程驗收，再取得合併授權。

回退優先回退應用版本，保留新增表與圖片；表未被舊版使用，不需立即刪除。若確認完全棄用並已備份，才另行刪除兩張新增表；刪除會永久移除圖片，不能當作無損回退。

## 驗證結果

- Prisma 三組 client 產生成功；主 schema `prisma validate` 成功（僅提供本機假連線字串，未建立連線）。
- TypeScript `tsc --noEmit` 通過；所有變更 TS／TSX 的 ESLint 通過；`git diff --check` 通過。
- 首版 33 檔、206 項相關測試通過；本次移除模組勾選後重跑 4 檔、20 項公告回歸測試通過：排程邊界、舊模組資料相容、公開／預覽權限、跨店草稿、版本衝突、圖片解碼、PGlite 實際 migration／cascade、審閱支線部署阻擋，以及操作指南與導覽回歸。
- Chromium 實際元件 fixture：1366×900、1920×1080、1024×768、768×1024、560×800、390×844、360×800；檢查無整頁水平溢出、日期及排序保存、失敗保留草稿、圖片放大、Escape 關閉、捲動位置及原本輸入保留。
- 另驗 JPG／PNG 壓縮上傳、最多 5 張、唯讀、每 6 秒切換、手動與碰觸暫停、滑動切換，以及改變尺寸後日期草稿保留。2026-10-20 優化另測滿寬原始比例、不同長寬比例輪播高度穩定，未上傳及全部停用時隱藏整個公告區，以及既有課程底部導覽 CSS 的可見與可點擊狀態（導覽事件為 fixture stub，並非真實頁面切換驗收）。
- 圖片、結果紀錄位於 `artifacts/image-announcements-20261020/`，fixture 使用合成圖片與假的 API。

**補充驗收**：已新增本機真實登入、Next API、PostgreSQL 與正式版編譯驗收，細節及剩餘限制見 [獨立驗收報告](verification/image-announcements-live-20261020.md)。共用元件 fixture 仍不能代替真實 LINE App／實體 iPad／Safari 或各模組完整業務驗收；沒有執行正式部署或正式資料庫 migration。


重現：`node scripts/qa/image-announcements-browser.mjs`（需要 Playwright 與 Chromium；可設定 `QA_PLAYWRIGHT_MODULE`，預設目前雲端工具路徑）。

**跨模組補驗**：運動／音樂各自的真實登入、上傳與會員首頁公告流程共 10 項通過，並修正課程後台路由限制。詳見 [跨模組補驗報告](verification/image-announcements-modules-20261020.md)。真實 LINE App 仍缺測試部署與裝置，未標記通過。

**既有預覽補驗**：蒸足共用 LIFF 首頁、運動及音樂 CoursePortal，經既有前台／裝置預覽完成 15 個實際流程及 41 項回歸測試；不需新增 LIFF 即可驗證公告呈現與操作。詳見 [預覽驗收報告](verification/image-announcements-preview-20261020.md)。此結果仍不涵蓋 LINE SDK 登入及 LINE App 裝置實測。
