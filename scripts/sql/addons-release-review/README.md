# 附加項目正式遷移候選修正（僅本機審查）

這些檔案未接入建置／部署 dispatcher，不是可以直接執行的正式 migration。本輪未更新遠端、未執行正式資料寫入，且保留原 Prisma migration checksum。

整合來源及既有驗收見 [本機整合紀錄](../../../docs/release/addons-integration-20261101/README.md)。本批只新增 SQL 候選與回歸測試，不更動 UI、應用角色政策或其他模組預設。

## 三份候選檔

| 檔案 | 用途 | 保護 |
|---|---|---|
| beauty-service-switch.sql | 補 BeautySetting.serviceAddOnsEnabled | 預設 false、不覆寫既有 true、不增加權限、不改 revision／款項 |
| catalog-activation.sql | schema-only 的 catalog enabled | 預設 false，與員工權限分離；既有資料保留 |
| staff-permission-initialization.sql | 可選的精確名單初始化 | 同一連線提供臨時名單，核對 storeId／staffId／ACTIVE；缺名單拒絕、空名單不變更、保留既有允許／拒絕，不從 plans.edit 推導 |

三份 SQL 都要求 addons_release.review_id 與 expected_database 明確一致；這只是防誤用檢查，不是授權或完整目標識別。執行前仍須確認實際 project、host、current_user、備份、migration history 及隔離環境。

先核對正式 `_prisma_migrations`：舊 activation migration 未套用時，需審查原歷史與 schema-only 候選的正式落地方式，不能讓舊檔後續自動執行並再次擴權；已套用時不能改 checksum，也不能任意撤銷現有員工權限。此處不偽造 applied 紀錄、不更改舊 migration、不放寬 ci-migrate allowlist。

## 跨店授權的結論

- 未新增 USING(true)、GRANT ALL、PUBLIC／anon／authenticated 權限，也未把未實作的租戶 context 塞進 RLS。
- 既有 backend 全店政策仍需在正式 runtime 身分與信任邊界下核實，不能稱為資料庫層隔店已修復。
- 本機 action 測試確認跨店商品／服務寫入被拒絕，外店圖片不能掛入本店服務；原有 HQ／財務權限與歷史退款檢查維持。
- 服務作品圖片 GET 是現行明確公開展示的設計，依不可變圖片 ID 讀取；不是需要登入的私人相片。公開 GET 不以「跨店不能讀」作為驗收條件。管理／上傳／掛圖權限與公開讀取分開核對。

## 驗收與限制

- SQL／授權回歸：13 檔 61 項通過；新增外店圖片掛入拒絕案例後，受影響的服務權限檔 10 項通過（其中 9 項已計入前述 61 項，合計 62 個不同案例）。
- 新 SQL 案例：誤目標拒絕、缺 baseline 拒絕、schema drift rollback、重跑保留既有開關／revision／金額、新店預設關閉、未核准門市不回填、既有拒絕保留、非在職／店別不符／不存在職員整批拒絕。
- 美業商品 SQL 測試加入原 beauty-module-candidate.sql 的不可變款項函式與 trigger，確認追加收退款可用，舊款不變，UPDATE／DELETE 仍拒絕。
- 變更測試檔 ESLint、全專案 tsc --noEmit、git diff --check 通過。無 npm build、雲端建置或資料庫連線。
- PGlite 合成資料不替代正式 Postgres 的完整角色、資料、鎖競爭、備份恢復及實際 runtime 驗收。

## 集中進入雲端驗收的最小條件

先核對目標 runtime／migration history，再把本批候選轉為該目標審查過的遷移。確認隔離資料庫與通知停發後，對固定整合 SHA 做一次必要的雲端預覽。舊 QA 仍是 0284825，不能用來驗本批遷移版本；需先查自動部署觸發條件，避免 push 與手動建置重複。正式 migration、公開 push 與新增建置均尚未執行，也不因本機測試通過而視為已獲准。
