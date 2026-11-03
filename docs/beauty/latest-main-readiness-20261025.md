# 美業整合候選與上線缺口（2026-10-25）

這是本機整合與唯讀環境核對結果，尚不可視為正式上線驗收通過。沒有資料庫寫入、migration、清理、推送或部署；LINE 維持關閉。

## 版本整合

- 支線：`review/beauty-production-integration-20261025`。
- 原本機整合基底：`a36b4b24`；本輪接入正式 main `62480ec422d7952f7b1dc9310350b38d2a258fca`，含前次固定基準後新增的 22 個提交。
- 本輪 17 個衝突檔案已解決。音樂補課、出席更正、密度與操作指南更新保留；美業 source ports、共用表單、逐人資源安排、收款及返回狀態保留。
- SPA 頁面與 runtime 未恢復；歷史操作指南資料獨立封存，沒有重新成為可操作頁面。

## 本機結果

| 驗證 | 結果與範圍 |
| --- | --- |
| 離線回歸 | 去除重複計數後 207 個測試檔、1,658 項通過；子程序隔離測試另外執行，假資料庫與網路封鎖保留 |
| TypeScript | noEmit 通過 |
| ESLint | 0 errors、1 個既有 cleanup ref 警告；位置為共用 roster.tsx |
| 瀏覽器 | 12 組操作通過、307 張尺寸檢查，無整頁橫向溢出；Chromium 合成資料，涵蓋 1920、1366、1024、768、390、360，不代表 Safari 真機或真實帳本通過 |
| 本機編譯 | Next webpack compile mode 成功；有 generated-prisma-runtime.ts 動態 createRequire 分析警告。保留此限制，需在部署產物驗證生成 client 載入 |

編譯使用既有 `BEAUTY_SHARED_PAGES_BUILD_QA` guard、loopback 假資料庫與 socket 封鎖器，沒有執行含 migration 的 npm build，也沒有 generate／預渲染或部署。原共用 node_modules 缺少 lockfile 已宣告的 pg 相依，僅在 /tmp 建立獨立依賴層並依 lockfile SHA512 驗證補齊，未改 package.json／lockfile 或其他工作區依賴。

操作覆蓋：清單搜尋／篩選／捲動保留、顧客與購買方案返回、收款取消返回、剪下貼上衝突與重選、關懷失敗保留與已處理、逐人服務及方案優先選擇、停用收合與角色呈現。真實權限、並發衝突、收退款／扣次仍未執行。

證據：[測試](evidence/20261025-latest-main/tests.log)、[子程序測試](evidence/20261025-latest-main/subprocess-tests.log)、[編譯](evidence/20261025-latest-main/compile.log)、[瀏覽器操作](evidence/20261025-latest-main/interaction-results.json)、[尺寸結果](evidence/20261025-latest-main/browser-results.json)。

## 唯讀環境核對

| 環境 | 實際狀態 | 下一關卡 |
| --- | --- | --- |
| 隔離測試庫 `ttworfzgwejdeolegkxl` | 14 張基礎表存在，新收費 6 欄皆缺；目標店 ID／slug 為 beauty-hosted-20261021，通知關閉 | 確認可還原點與方式後，另行授權精確六欄升級，才可部署新 Prisma Client |
| 正式庫 `qijlnhtpbintanzpxkvf` | 14 張 Beauty 表皆不存在；IndustryModule 無 BEAUTY，未見專用 Beauty 角色 | 必須審查完整基礎安裝、補充升級、受限後端角色／RLS 與環境接點；六欄 SQL 不適用，Preview 專用 installer 不可挪作正式安裝 |
| 正式網域 | steamfoot.com／www.steamfoot.com 指向 READY 部署 dpl_3hvffPdypf9z2wT4YjFAwXzbzjPe，main 62480ec4 | 本輪未改指向 |

測試店只讀筆數基線：4 服務、7 方案、5 卡、35 預約、39 帳本紀錄、25 付款。沒有讀出顧客個資或解密環境機密。備份／PITR 工具未提供可還原時間，仍待平台頁面確認；不能宣稱已完成備份或還原演練。

唯讀證據：[摘要](evidence/20261025-live-readiness/summary.json)、[schema](evidence/20261025-live-readiness/readiness.json)、[基礎依賴](evidence/20261025-live-readiness/dependencies.json)。

## 必須依序完成的剩餘關卡

1. 確認隔離測試庫備份／可還原點與回復方式，授權並套用 [六欄候選 SQL](../qa/sql/beauty-charge-additive.review.sql)，前後核對欄位及上述筆數。SQL 未執行，不在自動 migration 目錄。
2. 授權後更新完整隔離測試站，使用有標記的測試資料完成真實登入、儲存重開、收款折扣退款、扣次恢復、跨店與低權限、現金抽屜驗收；設定測後還原、測試交易保留。
3. 準備正式基礎安裝與角色／環境變更的精確審查包，核對備份及還原方式；通過前兩關後才提出正式發布授權。不能為 19:00 交付期限跳過這些關卡。

本機驗證完成可交付整合候選與證據；目前仍不保證 19:00 可安全正式上線。下一個可執行的寫入僅應限明確授權的隔離測試環境，正式庫與正式發布繼續停止。
