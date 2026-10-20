# 美業第一版驗證紀錄與啟用界線

基準 main：`c90f82df778da7c52e8716f8a6f3b6d0bb238593`。支線 `feat/beauty-module-20261020`，工作目錄 `/workspace/steamfoot-beauty`；原工作目錄 `/workspace/steamfoot-booking` 未改檔案／支線。沒有 cherry-pick 或更新其他任務的 PR。

## 已有程式與本機證據

- **三端入口**：店長 `/s/{slug}/admin/dashboard/beauty`、會員 `/s/{slug}/beauty`、技師 `/s/{slug}/beauty?work=1`、公開體驗 `/beauty-trial/{slug}`。HQ 可選 BEAUTY，實際建立仍受環境開關與既有 HQ 權限限制。
- **功能列**：日常工作六項與店務管理七項依確認順序；真實側欄 SSR 測試核對文字、順序、門市網址前綴與技師／人員分離，導覽測試核對同路由只亮選中項目。
- **核心規則**：多服務同行整組資源匹配、性別不預選、服務資格／營業段落／技師時間／空間／完整時長與整理時間；具名共卡占用、完成扣次、取消未到政策快照、價格與費率修訂檢查、防重送。
- **帳務**：單次分項或合併收款、方案發卡與轉帳核帳、退款結清、每次／鐘點／百分比、實際技師月結、付款及收回反向紀錄。現金異動檢查當日抽屜並寫共用現金帳。
- **通知**：事件佇列與有認證的 cron；依既有可信 LINE 通道、配額及隔離阻擋政策。沒有在本輪呼叫實際發送器。

### 自動檢查

| 檢查 | 結果 | 實際限制 |
|---|---|---|
| 全專案 Vitest `--maxWorkers=2` | 1,149 檔、11,282 項通過；18 檔／141 項依既有條件跳過 | 不能把跳過項算通過；不是正式交易驗收。其後最終導覽／selector／UI 小修另做下列指定測試與型別檢查。 |
| 最終美業＋實際側欄／導覽指定測試 | 10 檔、134 項通過 | 美業 62 項，側欄／導覽 72 項；服務／權限部分使用 mocks，不能當作真實 PostgreSQL 全流程。 |
| 最終 SQL 候選 | 9 項 PGlite 實際 SQL 通過 | 合成 Store／Customer／CourseRoom 等前置表；含 RLS／browser GRANT、性別、負額度、跨店 FK、體驗唯一、完整時長 exclusion、整組 rollback、帳本不可覆寫。不是正式 schema／pooler／角色整合驗收。 |
| 人員／權限／SQL 補驗 | 3 檔、26 項通過 | 保留既有 Owner／Manager／Staff 邊界，沒有放寬既有斷言。 |
| TypeScript noEmit | 通過 | 不代表有資料庫連線或真實帳號。 |
| 新增及變更來源 ESLint、git diff --check | 通過 | 未將全倉既有 lint 警告視為本次結果。 |
| Chromium 真實 React 元件＋合成 props | 1440×900、1024×768、768×1024、390×844、360×740 通過 | 下列隔離介面驗證，不是已登入的 Next 三端整合。 |

首輪全回歸的子程序 EPERM 已在允許必要執行能力的環境補驗；新增指南造成的計數斷言亦已同步修正，沒有刪測試／跳過失敗來取得通過。

### UI Preview

檢查店長清單、新增技師、多人不同服務、性別空值必選、指定技師篩選、手機改期視窗、技師本人服務畫面。檢查整頁無橫向溢出、關閉及儲存可達、旋轉尺寸後技師草稿仍在。每週可服務時間可同日分段，指定日休假／調班保留獨立例外。

實際元件由 `scripts/qa/beauty-ui-fixture.tsx` 載入；所有 server action 在 fixture 都阻擋，沒有真實登入、DB、LINE、金流或部署。

- [桌機店長清單](evidence/dashboard-desktop.png)
- [iPad 技師視窗](evidence/technician-ipad.png)
- [手機多人體驗](evidence/party-phone.png)
- [手機我的工作](evidence/work-phone.png)
- [尺寸結果](evidence/ui-results.json)

重現：`QA_PLAYWRIGHT_MODULE=/path/to/playwright QA_CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/qa/beauty-ui-browser.mjs`。Playwright／Chromium 為 QA 環境工具，沒有新增應用正式相依套件。

## 正式狀態與不可混用的證據

**正式啟用：待核，沒有啟用。** 本輪沒有執行任何正式或共用測試庫的 migration、建店、業務資料異動、外部付款／退刷、LINE 發送、合併或部署。

- `scripts/sql/beauty-module-candidate.sql` 只是一份候選；不放入自動 migration 目錄、不使用 `prisma db push`。
- 新表放獨立 `beauty-prisma/schema.prisma`，共用既有 Store／Customer／User／CourseRoom 等資料。舊 SPA、運動、音樂資料與表不改名、不刪除。
- 新表 RLS 阻擋 browser roles，限定經確認的 backend 非 superuser、無 BYPASSRLS 的 LOGIN role；安裝前須核對既有角色權限及實際 schema。禁止用臨時高權限角色略過驗收。
- Vercel 只停用本支線自動部署；hosted build 的本支線守衛會在 migration 前拒絕。未改動其他任務分支設定。
- 程式總開關 `BEAUTY_MODULE_ENABLED` 與通知總開關 `BEAUTY_NOTIFICATIONS_ENABLED` 均需明確設為1；本輪沒有設定部署環境變數。本店通知預設關閉，另需 LINE_REMINDER 授權、可信通道及 cron 身分。
- 新增4題美業後台指南；未新增前台操作指南。全站文章計數203→207、待互動驗收28→32，保留原盤點版本與所有未驗狀態；不引用／覆蓋尚未合併 #1307 的盤點內容。

## 上線前仍需完成的整合驗收

1. 在明確隔離、對外通知封鎖的真實 PostgreSQL 上安裝候選，核對實際共用 schema、登入角色、FK／RLS、Prisma 三端查詢與金額／現金帳落帳，並以兩個獨立連線測試同時搶最後位置、同技師與共用最後一次。
2. 使用既有隔離的店長、受限人員、技師與會員帳號驗證：同筆2人不同服務、選性別／指定技師、預約與改期、完成／取消／未到更正、共用授權、方案發卡／核帳／退款及月結付款收回。包含撤銷帳號、切店與子店唯讀。
3. 分別驗證公開填單與已驗證 LINE entry，過期／消耗／跨店連結、既有手機衝突及每服務一次。匿名手機只能限制優惠與聯絡，不能證明自然人身分，也不能授予會員權限。
4. 以正式核准的測試收件人驗證 LINE 通道、配額、同事件重試不重複及台灣18:00明日提醒；不得把佇列建立或 SKIPPED 當作實機送達。
5. 實體 iPad／iOS Safari、手機鍵盤、真實長名單與較大資料量；本輪只使用 Chromium 尺寸模擬。

以上是啟用前驗收缺口，不是要重新詢問已確認的功能方向。正式 migration、環境開關、合併與部署須另有明確授權。
