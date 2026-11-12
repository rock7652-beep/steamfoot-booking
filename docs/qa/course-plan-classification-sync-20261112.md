# 收費方案即時分類與草稿衝突

範圍：音樂／運動共用收費表單的儲存確認與分類更新。教師四分頁、按鈕樣式、授課設定載入效能及其他文字精簡不在本次修正內。沒有 migration，不修改正式方案、已售卡、餘額、效期或原計酬約定。

## 已確認原因

正式庫唯讀查核：使用者新增的 $900／$0 個別課都有正確教學項目。清單只更新已儲存的方案列，缺少新收費版本 metadata 時，原 courseFeeGroup 會判定待核對。正式 HQ 沒有觸發僅限特定 staging 入口的更新訊號，因此缺失可能持續到重載。另有一對二方案仍指向團體班；截圖中的 stale 草稿會被送出函式直接擋住，原先沒有就地說明如何處理。

## 修正行為

- 方案儲存的同一交易讀取並回傳同店、實際方案 scope 的 catalogTemplates。重送既有已套用的修改也會回傳 metadata；不接受此欄位作為寫入權威。
- 成功回應內的方案與分類對照一起顯示，不等路由重新讀取才分類；重開表單也採已確認的項目與時間。正式 HQ 另重新驗證頁面資料，保留局部已確認列對舊 props 的保護。
- 真實缺少對應的既有方案仍顯示待核對，不按名稱猜測，不放寬購課、扣堂或授課資格。
- stale 草稿提交時明示尚未儲存，提供最新資料／本次修改比較。手動選擇保留修改時，僅保留使用者改過的欄位，其他欄位使用最新值，繼續由後端檢查 snapshot。選使用最新資料則放棄草稿。
- 結果未明時禁止改寫草稿；允許重試原請求，即使 props 已更新也沿用原 requestKey／payload。確認衝突後才解鎖人工核對，不自動送出新請求。

## 本機證據

- 52 檔／356 項回歸通過（分類、草稿、方案 receipt／路由、音樂／運動／共卡表單、指南、Preview 隔離）。後續原請求重試補測所在 3 檔／23 項通過，含前述測試，非另計 23 個不同案例。
- 本機獨立 PostgreSQL 16 容器，僅綁定 127.0.0.1:55434，資料庫 classification_test；以真實 Prisma 執行 course-plan-save.pg，10 項通過。包含 SQL-null、更新衝突、跨店拒絕、重送及新增的確認 metadata。沒有連線正式資料庫。
- 使用真正 CourseMemberWorkspace／CoursePlanDraftForm 與 OperationScope；後端 import 封鎖，網路只允許攔截的記憶體合成回應。腳本：scripts/qa/course-classification-sync-browser.mjs。
- 新增 $900 方案立即歸個別課、移動一對二立即歸自組班，無待核對分組；重開保留項目及手動輸入 100 分鐘。
- 衝突明示最新價格 2800 與本次修改，擋住未核對送出；保留名稱修改並採用未修改欄位的新價格，人工確認後才提交。
- 1366×900、1024×768、768×1024 無整頁水平溢出、無 pageerror、尺寸切換保留輸入。這是 Chromium 合成資料驗收，不是實體 iPad 或登入正式店家端到端驗收。

## 畫面

- [新增後立即分類](../../artifacts/course-plan-classification-sync-20261112/new-fee-classified.png)
- [移類後立即分類](../../artifacts/course-plan-classification-sync-20261112/moved-fee-classified.png)
- [桌機衝突核對](../../artifacts/course-plan-classification-sync-20261112/conflict-1366.png)
- [iPad 橫向模擬](../../artifacts/course-plan-classification-sync-20261112/conflict-1024.png)
- [iPad 直向模擬](../../artifacts/course-plan-classification-sync-20261112/conflict-768.png)

Preview 只為本精確分支加入既有隔離與打包清單；資料庫、來源儲存庫、Vercel sandbox、通知停發檢查及正式 guard 保留。main 自動 Vercel 建置仍停用。尚未合併或發布正式站；遠端結果以 PR checks 為準。
