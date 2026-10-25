# 美業隔離測試庫升級與完整部署（2026-10-25）

使用者明確允許確認備份後升級隔離測試庫、部署完整測試版並做真實交易驗收。僅操作 steamfoot-preview；正式庫、正式 main 與網域未動，LINE 與通知保持關閉。

## 已完成

1. 使用者截圖確認 steamfoot-preview 最新 PHYSICAL 備份為 2026-10-24 17:06:17 UTC（台灣 10 月 25 日 01:06:17），有 Restore 入口；未執行還原，未冒稱還原演練完成。
2. 再次唯讀確認六欄全缺後，以 migration `beauty_charge_additive_20261025` 精確新增六欄。讀回確認 text／boolean／jsonb 型別、全部 nullable、無 default。不做回填、清理或修改原價格／快照。
3. 目標店六表筆數與排除新欄位後的逐列內容摘要完全相同：4 服務、7 方案、5 卡、35 預約、39 帳本、25 付款。這是升級當下核對，後續新增 QA 交易須另外區分。
4. 整合候選 `25b93575` fast-forward 更新既有 preview/beauty-ui-alignment-20261021，完整 Next 建置成功，部署 READY。build log 確認 isolated_database=true、migrations_skipped=true、notifications_blocked=true。
5. 無登入入口實測：後台登入與顧客入口均 HTTP 200，Chromium 1366 寬無 pageerror 或水平溢出。這不是已登入、儲存或真實帳本驗收。

新版：https://steamfoot-booking-4ptxd1vvp-rock7652-2111s-projects.vercel.app/hq/login?store=beauty-hosted-20261021

部署 ID：`dpl_DtNZuHcCH168q5WhBnK8frykD46W`，target Preview。

## 尚缺

登入後收款／折扣退款、方案扣次與恢復、設定儲存重開、低權限／跨店及返回狀態仍待真實驗收。目前沒有可供代理登入的已授權帳號憑證，不能冒用既有帳號或更改密碼。

準備新增只屬本測試店的 QA OWNER／STAFF 身分時，automatic approval review 拒絕：原授權限測試顧客、方案及預約，未明確授權管理權限帳號。因此帳號 INSERT 未執行，不重試、不改走其他接點。後續需明確授權有限測試帳號，驗收結束停用並保留操作紀錄，或由使用者提供既有合法登入方式。

本輪臨時 Vercel 存取資訊僅存 /tmp 私有檔，不放入版本庫、截圖或公開驗收報告。保留原部署保護。

證據：[升級前](evidence/20261025-live-readiness/preview-upgrade-before.json)、[升級後](evidence/20261025-live-readiness/preview-upgrade-after.json)、[部署](evidence/20261025-live-readiness/preview-deployment.json)、[入口檢查](evidence/20261025-live-readiness/deployed-smoke.json)。
