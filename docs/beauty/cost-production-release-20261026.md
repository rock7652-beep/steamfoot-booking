# 店家固定費用與所屬店長分帳發布（2026-10-26 台灣）

使用者明確要求將已驗收的店家固定費用、營運分帳與必要同步修正發布正式站。候選以正式 main `869e00e0`（另合併最新運動修正 `feff085f`） 建立，精選原修復支線的成本與分帳接點；不合併整張 #1406、不包含其他尚未發布功能。

## 範圍

- 共用收費表單顯示「店家固定費用」，支援單次及方案，儲存後立即重開使用已確認 revision。
- 收款／購卡保存不可變固定費用與顧客所屬店長歸屬；營運顯示店家、所屬店長與服務技師。退款依原快照反向分配，不回推舊交易、不因新價格改寫歷史。
- 購卡核對美業專用成本欄位；共用 adapter 不誤帶課程專用成本欄位。
- 保留最新 main 的音樂／運動單次收費、公開美業體驗預約與正式 LINE 實作及設定。未修改通知、密碼、資料表、角色或 migration。
- 本支線的自動 Preview 停用；依現行 main 發布流程，正式建置仍先跑唯讀 scope/TLS/schema/LINE gates，ci-migrate 無目標時跳過，未提供 migration 目標。

## 發布前驗證

- 34 個相關測試檔、317 項通過，另驗最新運動模式 8 檔 92 項通過；TypeScript noEmit、變更檔案 ESLint、git diff --check 通過。
- 原寬範圍整合探索遇到過期測試／本機產生 client 版本問題。沒有修改測試斷言：`beauty-course-plan-ui` 原始的整段運動／美業 markup 相等測試，在獨立未修改的 main `869e00e0` 亦為 1 failed／2 passed，保留證據；本輪不把它記為通過。公開體驗規則保留 main，不把早期非體驗 fixture 併入窄範圍候選。Prisma Client 依最新既有 schema 本機重生後 TypeScript 通過，沒有 DB 操作。
- 自動審查拒絕過調整舊測試斷言與 fixture 的操作，該操作未執行；改以正式版基準核對與精選發布範圍完成驗證。
- 免費 Chromium 假資料實際元件：1366×900、1024×768、768×1024、390×844，成本輸入值保留、無整頁水平溢出、page errors=[]；不是本輪真實登入或真機驗收。瀏覽器 fixture 阻擋外部網路及資料庫。
- 此批抽取前的隔離真實交易證據：實收 4,900 → 店家 1,500／所屬店長 3,400；退款 2,450 → 750／1,700；全退歸零，退款重送去重，改成本不改舊快照。原完整報告：https://github.com/rock7652-beep/steamfoot-booking/blob/bdb0198ad85929fcbc091076c36f3922dbdb7b75/docs/beauty/fixed-cost-sync-allocation-20261026.md 。抽取後以本輪相關回歸及畫面檢查確認，未再寫正式測試交易。

證據：[四尺寸結果](evidence/20261026-cost-production-release/results.json)、[回歸](evidence/20261026-cost-production-release/regression.log)、[手機畫面](evidence/20261026-cost-production-release/cost-390.png)。

## 發布狀態

PR #1415 已合併；正式 main `1f751f51c3bd2c2f7f25a52cb53ad65964f2f3b0` 建置中，deployment `dpl_HWZbgdhFaQJWWjr84yWjxJ9xGiSH`。已通過正式專用角色、TLS、Prisma、14 表與 shared todos 的 READ ONLY 預檢，`charge_scope=module editing_enabled=true`；既有 LINE worker 預檢通過，ci-migrate 為 `migration_skipped_no_target`。網站編譯與型別檢查完成，等待輸出發布及網域核對。


## 正式發布完成

- Vercel Production **READY**：`dpl_HWZbgdhFaQJWWjr84yWjxJ9xGiSH`，正式提交 `1f751f51c3bd2c2f7f25a52cb53ad65964f2f3b0`，PR [#1415](https://github.com/rock7652-beep/steamfoot-booking/pull/1415) 已合併。
- `steamfoot.com` 與 `www.steamfoot.com` 都已指向此部署；apex 保留 308 導向 www。
- 正式完整建置成功；美業 runtime/TLS/Prisma/shared todos/14 表唯讀預檢通過，收費 module scope 與編輯旗標正確，`ci-migrate: migration_skipped_no_target`。
- 官網、HQ 登入、匿名 session 回應 200；HQ 美業及店家收費／營運未登入入口正常 307 導向登入，沒有 5xx 或 server error page。匿名 session 回傳 null 為正常，驗證腳本首次未處理 null 而中止，修正腳本後重新核對通過；沒有更動應用或原始測試。
- 2026-10-26 04:40 台灣時間，按本 deployment 篩選最近五分鐘 error/fatal runtime logs 未找到紀錄；這是短時段 smoke，不代表全部正式業務流量驗收。
- 本輪未登入正式店寫入收款／退款測試，未變更資料庫結構、環境旗標、既有交易或 LINE 設定。新成本由店家填寫後適用後續交易，舊交易不回推。
- 本輪仍未發布 #1406 中其他不屬成本／分帳的修復。正式回退基準為先前 `feff085f` READY 部署 `dpl_7tJh4fM91dvRWy3bVxkW7gfzTQQh`；不自動 DROP 表或還原業務資料。

[正式入口 HTTP 證據](evidence/20261026-cost-production-release/production-http.json)。
