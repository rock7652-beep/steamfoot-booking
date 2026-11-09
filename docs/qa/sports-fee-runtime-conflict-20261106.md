# 銀百合收費儲存誤報衝突：Prisma 空值實例

## 回報與確認

使用者於 11/06 提供銀百合 HQ 店家後台截圖：`舞蹈(常態)-10堂` 選「僅後台指派」後按儲存，視窗未關閉並顯示「方案已有更新，輸入已保留。請核對目前資料後再編輯。」本次接續 #1512 同一修復與既有正式發布授權，不新增正式資料手動修改、通知或 migration。

後續補充名稱修改後仍顯示舊名稱；同一失敗更新會連名稱一起拒絕，因此納入資料庫回讀與清單確認回執測試。

基準 main `326a70f1f7f938aed2d3c581d696ade6f113924f`，正式 Vercel deployment `dpl_Hio15PuGfKeBTiZD8k4BiY2YUPdE` 的來源 SHA 相同，已包含 #1512。Supabase 正式專案 `qijlnhtpbintanzpxkvf` 唯讀查詢確認：該方案仍是顧客可購買、10 堂／5800 元／90 天、LEGACY，`chargeSettings IS NULL` 為 true；並非 JSON `null`。沒有直接改正式購買方式來掩蓋介面問題。

## 確切原因

`coursePrisma` 由 `loadCoursePrismaRuntime()` 透過 native require 載入外部 generated client；儲存程式卻以靜態 import 取得 `Prisma.DbNull`。打包後，靜態 import 與外部 client 可以持有兩份 Prisma runtime，空值標記的實例身份不同。

Prisma 序列化器不認得另一份 runtime 的 `DbNull`，把它當成空 JSON 物件 `{}`。因此 UPDATE 的條件實際在比對 JSON `{}`，而資料庫欄位是 SQL NULL，更新筆數為 0，程式誤報版本衝突。畫面保持開啟是後續失敗處理，並非儲存成功後忘了關閉。

以獨立 runtime 實例與真正 PostgreSQL 執行修正前的實際 `saveCoursePointPlan`，重現完全相同的紅字。另以 esbuild 真正打包 generated client 的靜態 import，再用外部 native client 查詢同一筆 SQL NULL，靜態標記匹配 0 筆、native 標記匹配 1 筆。不是僅模擬成功回應。

#1512 解決了連續編輯取到舊頁面快照的另一個缺陷，但當時資料庫更新被 mock，沒有驗證正式打包後的空值身份；原有瀏覽器 fixture 也只驗證合成回應，因此漏掉本次問題。

## 修正與驗證

- UPDATE 空值條件改取 `loadCoursePrismaRuntime().Prisma.DbNull`，與實際 query client 使用相同的外部 runtime。原有版本比對、門市權限及重送保護保留，非空 JSON 設定的處理不變。
- 新增 `course-plan-save.pg.test.ts`：實際 PostgreSQL／Prisma 儲存 LEGACY 與 ASSIGNED 空設定方案，雙向切換並回讀確認；驗證重送、真正併發衝突與跨店收據仍受保護，另驗證真實打包與 native 載入的差異。
- 新資料庫測試加入既有 sports shared-card PostgreSQL CI，要求 6 項全過且不得 skip，避免普通 Vitest 未設定隔離 DB 時略過就誤報通過。
- 資料庫測試只接受 loopback 且資料庫名稱以 `_test` 結尾的明確連線，獨立隨機 schema，結束刪除該 schema；未使用正式 DB 寫入。
- 本機 5 檔／66 項通過，包含 6 個真正 PostgreSQL 案例；修正前的雙 runtime 實際儲存案例回傳與截圖一致的衝突，修正後通過。TypeScript、修改檔 ESLint、diff check 通過。
- 補充名稱驗證：LEGACY／ASSIGNED 每次切換同步修改名稱並從真實 DB 回讀；實際 `CourseMemberWorkspace` 驗證送出新名稱與購買方式、成功關閉、清單立即顯示新名稱及狀態，重開後維持。補充後兩檔／25 項通過（其中 6 項真實 PostgreSQL），後端修正未擴大。
- 既有合成瀏覽器驗證於 390、768、1024、1366 px 通過雙向切換、儲存後關閉及重開，無 overflow／瀏覽器錯誤；產物在 `/workspace/reports/sports-fee-runtime-20261106/`，目視 1024 px。這部分仍是 client UI fixture，實際資料庫與打包差異由新增 PostgreSQL 測試補驗，不能把 fixture 當正式登入驗收。

這次不變更 UI 骨架、課表／購買業務規則或操作指南步驟。適用操作情境為儲存成功／失敗、重開與版本衝突。登入後正式店長操作與正式儲存不冒稱已驗；發布結果另依實際 SHA、部署與正式域名核對。Cloudflare 非目前 Vercel 正式路由的必要依賴，保留其實際檢查結果。
