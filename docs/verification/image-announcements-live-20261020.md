# 圖片公告獨立驗收（2026-10-20）

## 驗收故事與環境

店長從本店後台登入、上傳課表 → 真正的 Next API 驗證權限與門市 → PostgreSQL 保存圖片、排序與排程 → 顧客透過手機密碼登入，在本店首頁查看完整圖片、輪播及放大。

使用獨立 Docker PostgreSQL 16、專用 loopback 埠 55469、資料庫 `image_announcements_acceptance`，Next 綁定 `localhost:3169`。從 PR 基底 schema 建立空資料庫，再執行這次的實際 migration；課程 schema 另建於同一個一次性資料庫供既有共用查詢使用。資料只有兩間合成蒸足門市、兩位老闆、各一位店長／一般人員與兩位顧客；上傳合成 A4 圖片。

驗收程序只傳遞本機必要變數及一次性測試用 auth secret，不載入 `.env`／`.env.local` 或外部服務金鑰。瀏覽器對外請求限制為本機來源。沒有連接正式資料庫、發送實際客戶通知、合併或部署。驗收模式只接受明確旗標、精確 loopback DB／網址；任何 hosted metadata 都拒絕。正式版編譯另需明確 build 旗標，不能用來啟用正式環境。

## 實際流程結果

14 個流程全部通過；證據為 `artifacts/image-announcements-live-20261020/results.json`，每步均直接查詢 PostgreSQL 或實際 HTTP 回應，沒有 mock API、身份驗證或 Prisma。店長測試帳號明確授予查看／管理權限，一般人員只授予查看；權限依既有 StaffPermission 機制判斷，並非僅憑角色名稱放行。

| 邊界／操作 | 結果與證據 |
| --- | --- |
| 登入 → 後台 | 兩位店主分別從 Email／密碼表單登入，可看本店圖片公告；無模組選項 |
| 後台 → API → DB | PNG 在瀏覽器轉換上傳後，資料庫 revision=1、兩筆圖片及兩筆素材 |
| DB → 公開 API | 有效清單 HTTP 200；實際 JPEG HTTP 200、`no-store`，二進位內容存在 |
| 門市隔離 | B 店 UI／清單沒有 A 店圖片；以 B 店 session 偽造 A 店寫入回 403；以 B 店查 A 店素材回 404 |
| 顧客登入 → 前台 | 真正手機密碼登入；390px 視窗圖片顯示 358×506，來源 840×1188，完整保留比例，無整頁水平溢出 |
| 輪播／放大／返回 | 6 秒自動切換；手動切換後 6.5 秒仍保留同圖；可放大、縮小、關閉；實際開啟選單進入預約與方案，再回首頁 |
| 排序／更換 | 新順序寫入 DB；更換產生新 ID、舊素材刪除 |
| 排程／停用／空區 | 未來上架、停用圖片不公開；重新載入真實會員首頁後沒有公告 DOM 或空框 |
| 到期／預覽 | 到期圖片不公開；未登入的預覽為 404，授權店主預覽為 200 |
| 張數上限 | 真正上傳至 5 張，DB 及素材都為 5 筆，上傳按鈕停用 |
| 同時編輯 | 兩個真實後台視窗；舊版本儲存回 400，顯示版本衝突，草稿日期保留，DB 不被覆蓋 |
| 店長／一般人員 | MANAGER 實際登入、上傳發布及刪除成功；STAFF 可看本店圖片，但沒有上傳／編輯按鈕，偽造 API 寫入為 403，圖片保留 |
| 刪除 | 經 UI 確認及儲存後，公告陣列與素材數量皆為 0 |
| 直接資料庫存取 | 兩表啟用 RLS；即使先模擬預設全授權，migration 後 anon／authenticated 沒有 SELECT 權限；以兩個角色實際查素材表均 permission denied |

另以真正登入後台調整為 1024×768、768×1024，確認無整頁水平溢出並保存截圖。這是 Chromium 模擬視窗，不是實體 iPad。

## 本次修正

遷移候選原本只有建表，尚未限制直接資料庫角色。補上兩表 RLS 與 anon／authenticated 撤權，讓未發布的來源圖片及排程只能透過授權後端使用；公開顯示仍由檢查排程的 API 提供。以 PGlite 與真正 PostgreSQL 驗證，店主操作及公開有效圖片仍正常。此 migration 尚未上線，因此直接修正候選檔；未修改已部署資料。

新增專用本機驗收模式與可重現 seed／browser runner；既有正式及其他 Preview 判斷維持原路徑，hosted review branch 的 build／migration 阻擋仍保留。

## 程式與編譯檢查

- 公告與隔離模式回歸：7 檔、88 項通過。
- TypeScript `tsc --noEmit`、變更 TypeScript 的 ESLint 與 `git diff --check` 通過。
- 正式版 Next build 成功：打包 57 秒、TypeScript 71 秒、230 個靜態頁面完成生成，完成頁面最佳化。使用隔離 build 指令，沒有執行含資料庫遷移的 `npm run build`；Prisma 的動態路徑 asset trace 提示仍存在，沒有編譯錯誤。
- 開發模式先跑通 13 個實際流程；隨後重建一次性 DB，使用編譯後的 `next start` 正式版程式完成本報告 14 個流程。這是本機正式版 runtime，不是雲端或正式站部署。

## 未驗與發布判斷

- 真正 LINE SDK／LINE App 授權及實體 iPad／Safari 未驗；本機沒有真實 LINE 設定及裝置，不能把瀏覽器或共用元件結果當作 LINE 實機通過。
- 真實端到端門市是蒸足。運動／音樂的共用輪播有前次元件及課程樣式 fixture 驗證，但本次沒有各自完整的會員登入業務驗收。
- 沒有執行正式／雲端 Preview 部署、正式資料庫 migration 或線上驗收。此報告不是正式上線授權。
- 所有上傳為合成圖片；實際店家製圖的文字清晰度仍取決於圖片內容。

核心圖片公告已通過本機真實登入、API、資料庫與前台流程。正式上線前仍應在授權的部署環境核對 migration／部署，並確認 LINE 實機入口；不把尚未測試項目列為通過。

## 重現

1. 在沒有 dotenv 檔的獨立 worktree，啟動一次性 `postgres:16-alpine` 容器，僅綁 `127.0.0.1:55469`，DB 名稱 `image_announcements_acceptance`，測試用本機 postgres trust。
2. `node scripts/qa/image-announcements-live.mjs seed`（只接受空的專用 DB，不會覆寫既有資料）。
3. `node scripts/qa/image-announcements-live.mjs dev`。
4. 另一個終端執行 `node scripts/qa/image-announcements-live.mjs browser`。目前 runner 使用雲端既有 Playwright／Chromium 路徑。
5. 停止此驗收 dev server 後，可執行 `node scripts/qa/image-announcements-live.mjs build`，再以 `node scripts/qa/image-announcements-live.mjs start` 啟動編譯後的程式；不可與 dev 共用 `.next` 同時執行。

重跑完整 UI 流程須重新建立這個一次性容器／資料庫；腳本不會自動刪除既有 DB。清理時只刪除此驗收專用容器，不操作其他任務的容器或資料。

驗收結束後，已停止此次專用 Next server 並移除專用 PostgreSQL 容器，其他任務的工作目錄與容器未變動。
