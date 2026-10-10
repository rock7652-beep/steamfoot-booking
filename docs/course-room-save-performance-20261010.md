# 新增空間效能修正（2026-10-10）

使用者回報新增空間送出等待約 3–5 秒。程式確認舊流程會在 Server Action revalidatePath 及 client router.refresh 後載入完整課程工作台；即使 view=rooms，也讀月課表、預約、租借、全部顧客、教師、營業時間與授課可用時段。沒有舊版分段耗時證據，不能將 3–5 秒全歸因資料庫或重載。

## 修正

- rooms 提前進入獨立讀取：空間與每間最多20筆未結束課摘要、業務類型、排序、權限與店家視角。不讀月課表、顧客、教師或租借。
- 同源 POST /api/courses/rooms 沿用 courseManager booking.create（權限、模組、subscription、當店職員）。expectedStoreId 只用來拒絕切店，不作授權來源。
- 店家及 HQ 的工作台以目前 pathname + /rooms 送出，透過既有 proxy 保留經驗證的店家路由資訊；共用同一個 POST handler。直接進店家網址時不再依賴另一個店舖或全部店舖 cookie。expectedStoreId 仍須與後端授權結果相同，沒有放寬權限。
- 只有已提交的完整空間才加入本機清單、收合視窗及顯示成功。Route Handler 將 canonical courses / HQ courses / dashboard 標為下次讀取更新，不讓回應等待 RSC 頁樹重載。
- 原有 PK 與 storeId/name unique 保護並行；store/user/request UUID 雜湊產生同一次送出的固定ID。重試不更新原空間；同key不同內容、不同請求同名皆拒絕。無 schema/migration。
- 同一畫面同步鎖防連點，儲存期間停用欄位，失败保留草稿。未知結果保留原內容/key，重試確認；尚未知前阻止關閉/切店，不把「背景更新失敗」誤報為儲存失敗。
- 新空間標示「剛新增」，即使目前篩選不符仍暫時可見；可點「查看新空間」，不清空搜尋、不自動跳捲動。Server props 確認後移除本機 receipt，後續修改與刪除仍以伺服器為準。
- 設定引導獨立背景讀取，有當店檢查、最新請求/卸載保護與失敗重試，不 router.refresh、不覆蓋下一間的草稿。
- 新增空間不發送教練通知。既有課次通知規則未修改。
- server log 僅固定 outcome 與 auth/database/total 毫秒；空間讀取僅 query毫秒/筆數；client 回應耗時僅 browser console，不記姓名、店ID、草稿或request UUID。

## 驗收與發布

入口：音樂/運動後台 dashboard/courses?view=rooms；共用全域設定引導。
目標尺寸：1366、1440、1024×768、768×1024；窄容器可操作性。
本機測試：同步重試/未知結果/拒絕/切店/卸載、50空間的有限查詢、音樂/運動新增成功即時清單與下一間草稿保留。

Preview 僅精確 fix/course-room-save-performance-20261010、既有隔離資料庫 ttworfzgwejdeolegkxl、既有 Vercel project/repository；沿用 shared dispatcher/client guard。跳過所有自動 migration，外發通知維持封鎖。自動部署先停用，手動建立精確 commit Preview。

第一版 d41cceb3 已完成登入後音樂/運動新增、同名拒絕及修正重送、篩選保留、新列即時顯示、重入清單不重複、後續排課選單可見空間。已檢查 1363px 桌機、1440×900 裝置预覽、1024×768 與 768×1024 iPad 模擬尺寸。三次成功新增後端 totalMs 458、239、254；這不是完整畫面耗時，也沒有同條件舊版或正式站比較。

接續驗收發現 HQ 從全部店舖直接開店家網址，舊根 API 會因缺少該路由資訊拒絕儲存，已補上上述 scoped route。補修需以最新 commit Preview 再驗這項與設定進度同步。Cloudflare bot 回報自動部署失敗，詳細日志因瀏覽器觀察限制未讀得；程式只允許指定 Vercel 隔離 Preview，不能將推論寫成實際 Cloudflare 失敗原因。Vercel 與 GitHub CI 的通過不代表該項已通過。不合併正式站。
