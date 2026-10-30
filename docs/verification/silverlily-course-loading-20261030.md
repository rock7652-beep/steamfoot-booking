# 銀百合課表／教學項目載入調查（2026-10-30）

範圍：正式環境唯讀資料、Vercel 指標與正式版相同來源碼；未修改正式資料、設定或部署。正式來源 SHA `38ea7672aa670450ad3d2a6477aff54d9fc1b5ce`。

## 證據

- 銀百合僅 18 課次（未取消 3）、30 筆預約、10 個教學項目、13 個課程樣板、17 個方案、4 張方案卡。10 個教學項目的 canonical template 都已存在。
- 代表性的月課表 SQL（僅 id/name/start 投影）EXPLAIN ANALYZE：執行 0.168ms、規劃 0.927ms、3 筆結果、7 buffer hits、0 disk reads。這不包含應用程式網路往返、Prisma 關聯載入、授權與畫面渲染，不代表完整頁面只需此時間。
- 正式 sports production/permanent schema readiness 查詢分別執行 2.214ms／2.527ms。單次資料庫引擎執行不是秒級延遲的證據。
- Vercel `vercel.function_invocation.function_duration_ms`，production、2026-10-30 07:00–10:00 台北時間、route 維度的 `/dashboard/courses` p95 為 3185ms。這是全店共用路由指標，不能冒稱銀百合專屬數字；尚未取得銀百合正常業務帳號的瀏覽器完整計時。

## 已確認的程式等待路徑

1. `courses/page.tsx` 教學項目管理頁在同一 interactive transaction 對每個 subject 呼叫 `readSportsTeachingRule`。每次依序查 template、Staff 資格、compensation；銀百合 10 項即 30 次資料庫往返，外層 Promise.all 無法讓單一 transaction connection 平行查詢。
2. 課表初次載入即啟動 `loadSportsStaging(true)`，render 又等待 `sportsFormPromise`。排課編輯表單需要的方案、方案卡及其會員／保留預約、學員等資料，在尚未開啟新增排課前就加入頁面的必要等待。
3. 課表先等待 `ensureSportsMonth`（缺課調整／固定排程補齊），之後還有租借權限、名單、月課表、教練／教室／顯示設定等分段讀取；有些授權與 readiness 又在下層重複執行。
4. `buildDatabaseUrl` 的 Vercel 預設每個 Prisma client `connection_limit=1`（若連線字串未覆寫），所以同一 client 的大量 Promise.all 仍可能排隊。

結論：現有資料量很小；確定存在多次查詢往返與初始載入等待鏈。它們是目前最有力的延遲原因，但各步實際耗時占比尚未量測，不將推論寫成已完成的根因比例。

## 建議修正順序

- 教學項目改為批次查詢三種規則資料，再在記憶體組合；維持原店家與權限限制。
- 排課表單資料改為開啟時才讀取，月課表只載入展示需要的資料。
- 對授權、固定課生成、月課表查詢、表單載入分別加入 Server-Timing，透過正常業務帳號確認前後成效。
- 固定課生成涉及正確性與副作用，需獨立驗證，不能直接刪除或以快取掩蓋。

本次只調查，未將效能修正混入方案餘額功能，也未部署正式站。
