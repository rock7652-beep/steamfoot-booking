# 測試站 HQ 美業店切換修復候選版

## 範圍

同一既有 HQ admin（使用者指出 admin@staging.local）應能列出音樂、運動與美業店，選既有美業店後進入美業工作台。沒有建立／合併帳號、改權限或重建門市，沒有搬顧客、方案或帳本。

## 基底與修復

隔離支線 fix/hq-beauty-module-restore-20261024，基底為另一對話已整合 SPA 移除的美業提交 6092de91，再接入本輪本機收款安全與內頁修正 05947a1c（此支線 cherry-pick 為 f9842367）。這個基底已包含完整美業 enum、client、路由與 adapter。

- 將可用模組 STEAMFOOT／COURSE／BEAUTY 定義在共用 registry；HQ 清單與模組驗證共用，不再各自維護漏掉 BEAUTY 的白名單。
- 門市可存取與組織範圍查詢使用同一 registry。封存與營運狀態限制、帳號範圍檢查保留；未知模組與已退役 SPA 拒絕存取。
- HQ 切換美業直接進 /hq/dashboard/beauty，清除前一家門市的 action／customerId／date／tab 等上下文，只保留既有 devicePreview 模式。
- 不改蒸足首頁與運動／音樂原有的課程頁切換規則，不改排程背景工作的門市枚舉。
- 更新過時的 migration contract 測試：已移除的 SPA 寫入 handler 必須保持不存在，不為讓測試通過而恢復舊功能。測試只讀原始檔，沒有執行 migration。

## 版本界線

目前音樂網址的 f0312850 未含完整美業程式；只把 BEAUTY 加回該版本的查詢會留下 enum／runtime 不支援問題。本修復依完整美業基底產生可審查的候選提交，不是直接改那個已部署音樂版本。

曾以 Git merge 檢查兩支線：音樂 release 與本候選基底有 74 個檔案衝突，已中止該次本機合併，沒有採用整批覆蓋，也沒有合併音樂 release 的全部 242 筆差異。因此不能宣稱這個候選版包含 f0312850 的所有音樂最新功能。音樂測試網址與其別名均未變。

後續若要更新使用者正在操作的站，須明確選定包含完整美業的候選版本及原隔離 Preview 作用域，再做登入切店驗收；不得把只有 HQ 選單修正的提交孤立套到缺少美業程式的版本，也不得把新支線直接部署繞過現有 branch gate。部署與資料庫仍維持停止。

## 離線驗證

21 檔、208 項通過；其中新增 9 項涵蓋同一 HQ 的多模組店鋪列舉、實際授權與模組辨識串接、直達美業、跨店拒絕、不可用模組與狀態拒絕，以及切換清理前店上下文。store／transaction 均為 mock，沒有真實登入或交易。

TypeScript、修改範圍 ESLint 與 git diff --check 通過。沒有啟動站台或完整 Next build（原 build 包含 migration），沒有瀏覽器與手機／平板驗收，也沒有宣稱 admin@staging.local 已在遠端切換成功。

沒有資料庫讀寫、migration、重試、資料清理、環境變數更新、帳號變更、推送或部署。LINE 狀態不變，正式站未動。
