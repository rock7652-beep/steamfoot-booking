# 月結加減項與 #1506 同批正式發布

使用者本次明確授權：「跟著1506一起合併正式站。」原始 #1506 為 `fix/liff-health-change-range-20261104`，head `a6330408f7744061de931b2ad9377344dea2f824`；正式 main 基準 `83af0b68497978933cfd9799bca4367a71914f51`。

## 最終範圍

- 保留 #1506 健康量測預設與上次比較、可選已載入範圍的修改。
- 加入已定案的四模組獎勵與調整：日期／歸屬月份在最上方，自訂事由，明細只有編輯／刪除，月結自動加減並保護已結算月份。
- 原始月結開發與四模組真實登入證據：`artifacts/monthly-adjustments/`，產品驗收版本 `b549c7f0`。整合保留各自作者及 commit，不以舊檔整份覆蓋。
- 新增正式 Beauty 受限角色的最小讀取／月份確認權限；新表不對公開 API 角色開放。

## 資料庫候選

1. `20261104120000_staff_monthly_adjustments`：新增兩張空白表、正數金額／單一人員身分檢查、同店 FK、partial index、RLS。
   SHA-256 `d67a36fcf6c78744b1a6d88bf811e29efff7376d065767266768ffa39e8ee27f`。
2. `20261104121000_monthly_adjustments_beauty_access`：撤銷 PUBLIC／anon／authenticated，僅允許存在的 `steamfoot_beauty_prod_20261025` 讀技師調整及操作 Beauty 月份鎖定；不授予調整寫入、DELETE 或跨模組月份操作。
   SHA-256 `a0991eaa862ba07c5790f4a141fc8a857627032636a7d10a93eb2500e7a989e4`。

新增 SQL 不更新任何既有人員、工資、交易或通知設定；不回填合成資料。正式兩檔在同一交易執行，驗證新表為空、RLS／FK／權限，並於同一交易記錄精確 Prisma migration 名稱與 checksum；不執行無關 pending migrations。build dispatcher 保留原有 skip-no-target 行為，不改正式環境變數。

## 執行順序

1. 整合月結與 #1506，通過型別、局部回歸及獨立受限角色 RLS 測試。
2. 既有 steamfoot-preview 資料庫先演練兩份 additive SQL；新表空白，公開角色無權限。
3. 將整合 head 推送原 #1506 分支，重用其已審核的隔離 Preview 設定；只建立一次自動預覽。舊 `a6330408` 預覽不含月結，不能當作整合證據。
4. 核對同一 head 的遠端 CI、READY Preview；Workers 自動檢查若失敗，判斷與正式 Vercel 路由的實際關係，不關閉或竄改該檢查。
5. 正式庫唯讀 preflight：兩張新表與同名 ledger 均不存在、無失敗 migration、Staff／BeautyTechnician 複合唯一索引已存在。記錄舊 production deployment 供程式回退。
6. 執行兩份精確 SQL 與 ledger，核對結果後將 #1506 標示 ready 並合併 main，等待自動正式部署。
7. 查驗 main／production 的實際 SHA、READY、正式域名及唯讀 smoke。正式帳務不寫測試資料，LINE 真機／實際私人帳號未驗項目如實保留。

## 回退

先回退程式部署，保留兩張新表、已建立的調整與快照；不 DROP、不刪除正式帳務、不還原或啟用通知。既有 production 基準：`dpl_HTbq8xZTZm7QbhfW14rxovDL6EnR`，來源 main `83af0b68`。

## 已取得證據

- main 及 #1506 head 已唯讀核對；#1506 的原版 Full Vitest baseline 已 SUCCESS，不沿用其舊結果冒充整合版。
- 本機整合回歸：28 檔、286 項通過；包含原生健康摘要、月結及新增受限角色 RLS 兩種安裝情境。
- Preview 已套用兩份 SQL，後續部署／正式執行結果另以實際結果補記。未取得正式執行證據前，不宣稱已上線。

## 費用與整合

此次使用者已授權同批正式發布。更新 #1506 會觸發 CI 與必要 Preview；合併後觸發正式建置。舊預覽不含新碼，不能重用為本版。建置可能產生費用，目前無法估算；不另手動重建同一版，不修改預算或停用正式站。
