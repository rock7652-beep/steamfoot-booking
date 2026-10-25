# 店家固定費用與所屬店長分帳發布（2026-10-26 台灣）

使用者明確要求將已驗收的店家固定費用、營運分帳與必要同步修正發布正式站。候選以最新正式 main `869e00e0` 建立，精選原修復支線的成本與分帳接點；不合併整張 #1406、不包含其他尚未發布功能。

## 範圍

- 共用收費表單顯示「店家固定費用」，支援單次及方案，儲存後立即重開使用已確認 revision。
- 收款／購卡保存不可變固定費用與顧客所屬店長歸屬；營運顯示店家、所屬店長與服務技師。退款依原快照反向分配，不回推舊交易、不因新價格改寫歷史。
- 購卡核對美業專用成本欄位；共用 adapter 不誤帶課程專用成本欄位。
- 保留最新 main 的音樂／運動單次收費、公開美業體驗預約與正式 LINE 實作及設定。未修改通知、密碼、資料表、角色或 migration。
- 本支線的自動 Preview 停用；依現行 main 發布流程，正式建置仍先跑唯讀 scope/TLS/schema/LINE gates，ci-migrate 無目標時跳過，未提供 migration 目標。

## 發布前驗證

- 34 個相關測試檔、317 項通過；TypeScript noEmit、變更檔案 ESLint、git diff --check 通過。
- 原寬範圍整合探索遇到過期測試／本機產生 client 版本問題。沒有修改測試斷言：`beauty-course-plan-ui` 原始的整段運動／美業 markup 相等測試，在獨立未修改的 main `869e00e0` 亦為 1 failed／2 passed，保留證據；本輪不把它記為通過。公開體驗規則保留 main，不把早期非體驗 fixture 併入窄範圍候選。Prisma Client 依最新既有 schema 本機重生後 TypeScript 通過，沒有 DB 操作。
- 自動審查拒絕過調整舊測試斷言與 fixture 的操作，該操作未執行；改以正式版基準核對與精選發布範圍完成驗證。
- 免費 Chromium 假資料實際元件：1366×900、1024×768、768×1024、390×844，成本輸入值保留、無整頁水平溢出、page errors=[]；不是本輪真實登入或真機驗收。瀏覽器 fixture 阻擋外部網路及資料庫。
- 此批抽取前的隔離真實交易證據：實收 4,900 → 店家 1,500／所屬店長 3,400；退款 2,450 → 750／1,700；全退歸零，退款重送去重，改成本不改舊快照。原完整報告：https://github.com/rock7652-beep/steamfoot-booking/blob/bdb0198ad85929fcbc091076c36f3922dbdb7b75/docs/beauty/fixed-cost-sync-allocation-20261026.md 。抽取後以本輪相關回歸及畫面檢查確認，未再寫正式測試交易。

證據：[四尺寸結果](evidence/20261026-cost-production-release/results.json)、[回歸](evidence/20261026-cost-production-release/regression.log)、[手機畫面](evidence/20261026-cost-production-release/cost-390.png)。

## 發布狀態

待提交、PR 合併與正式 Vercel 建置；本節完成後另附實際部署結果，不把候選驗證稱為已上線。
