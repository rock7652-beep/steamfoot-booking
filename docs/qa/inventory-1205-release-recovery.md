# PR #1205 上線與回復執行表

狀態：2026-10-05，測試分支；未獲正式合併／部署授權。本文件不執行正式操作。

## 保留的資料與身份

- 四模組左側共用 `/dashboard/staff` 人員入口；既有 Staff 編輯、SPA 服務排班、教師／教練與店別前綴路徑保留。設定中心不再放置重複人員分類。
- 同一人可關聯店務與教練／教師前台身份，兩種登入身份及權限分開。禁止自我連結、跨店連結、已占用的對象，以及不先解除就改連另一人。
- 不以姓名自動合併帳號，不批次改舊 Partner，不刪除人員或改寫原單經手人；停用失去登入能力，但歷史資料保留。

## 正式上線前配對

| 項目 | 現況／執行方式 |
| --- | --- |
| 候選版本 | 應用候選 `2a450ab7ba7b09528231dad18d8a402964709121`，Preview READY、實際頁尾20:03；後續純文件提交不改runtime，上線仍重新鎖定最終 SHA |
| 正式部署 | 尚未建立；不能把 Preview deployment ID 當成正式回復 ID，也不能將隔離 Preview 直接 promote 到正式 |
| Schema | Inventory workspace、receiving、pricing、receiving RLS、UserRole MANAGER／STAFF 的五份 migration；正式逐份核對結構及 Prisma 記錄，禁止盲目全庫 migrate deploy |
| 人員資料 | Owner全店、Manager／Staff個別授權、舊Partner保留；逐人核對店別、角色與例外，不依姓名推測 |
| 身份驗收 | Owner／Manager／Staff已各自登入；Manager撤QA Staff銷貨權限後舊表單未成立，雙真人競爭收款／入庫各僅成功一筆；完整矩陣與實機Safari仍待 |
| 發佈范围 | 進銷存與權限一起發佈；依20:17使用者同意，附件、正式退貨／作廢、單據Excel及服務端分頁列後續版本，首發不含 |

## 發佈順序（尚未執行）

1. 完成三角色操作矩陣：銷貨、收款、收貨、成本、進貨付款、匯出、調權後既有登入，並核對至少一位啟用 Owner。
2. 鎖定最終提交及其正式環境設定。核對正式 schema 指紋、migration checksum及現行資料保留方式；記錄正式環境可用恢復機制，勿在本步匯出或傳送正式個資。
3. 取得正式發佈授權後，套用核對過的新增 schema；記錄 migration 結果。角色 enum新增不直接改既有人員。
4. 部署支援新角色及成本隔離的正式應用，記錄正式 deployment ID與SHA。保留所有单據／收款／付款／庫存／稽核資料。
5. 完成單店冒煙驗收，再逐人安排角色；敏感權限異動有差異與稽核，不全店批次套預設。

## 異常時的回復順序

1. 記錄出問題的正式 SHA、deployment ID、店別及單據 ID；避免連續重送，以同一requestId查既有結果，不再人工補開一筆。
2. 必要時暫停受影響進銷存功能的新增操作，保留現有資料與成本隔離；這是正式設定變更，當次執行仍須符合授權。
3. **優先回復到已驗證、支援 MANAGER／STAFF 與新 Inventory schema 的正式版本，或發佈相容修正。** 第一輪上線前的舊 main 並非可無條件回退版本：舊認證及權限邏輯可能不認得新角色，或失去成本守門。正式相容回復版本／ID須在發佈時實際建立並記錄。
4. 不刪除 Inventory 資料表或 enum 值，不將Manager／Staff批次轉為Owner／Partner，不回滾已成立收付款、庫存或稽核。程式回復與資料恢复分開；如需修正錯誤業務資料，使用可追溯的補正流程。
5. 回復後核對訂單應收／已收、付款分配、現金帳唯一關聯、庫存、三角色登入及未授權成本拒絕。只有必要且有明確授權的資料恢復才另行處理，不能宣稱一般程式rollback會還原資料。

## 已有證據與限制

- 人員／身份／舊路徑本輪6檔60項通過，新增已占用連結、自我／跨店、禁止悄悄換連結情境。
- 先前整合21檔243項、安全補驗4檔79項、四模組導航5檔31項及TypeScript／ESLint通過。
- 87f9383c雲端Admin實測桌機與iPad尺寸：人員左側入口可用、設定中心無重複入口；這不是三角色真人完整驗收。
- 本文件是可供檢視的执行方案；沒有正式rollback演練、正式資料恢復或production部署。

## 20:17 後唯讀盤點及可執行檢核

- 正式專案ACTIVE_HEALTHY不代表備份已驗證。工具metadata未提供最後成功備份、保留天數、還原點或PITR，不宣稱已有7天可恢復備份。發佈前取得備份狀態及可用還原點，記錄時間與相容schema；未执行正式還原。
- 正式enum為ADMIN／OWNER／PARTNER／CUSTOMER，尚無MANAGER／STAFF；InventoryOrder／InventoryProduct／InventoryReceiving均不存在。正式5位ACTIVE OWNER、1位ACTIVE ADMIN；6位ACTIVE Staff中5位關聯OWNER、1位關聯CUSTOMER。該CUSTOMER關聯可能供業務服務使用，不自動升為後台Staff。
- 逐人配對表必填店別、現有role、使用者確認的目標role、例外授權、確認人；現在尚無確認目標，正式資料不變。Owner保持全開，不為方便批次改角色。
- 實際雙人收款GRSRFS0D只一張42QVNZSO及cashbook；雙人續收B2218C8B revision只1→2，庫存只+1。兩個獨立已登入會話的競爭請求不等同完整PostgreSQL鎖時序／壓力演練。

### 待正式比對的migration SHA-256

| migration | SHA-256 |
| --- | --- |
| 20261005140000_inventory_workspace | 5164a4e34fd83ebdf0f157f7fb2d921fd2f8103effbba71253a611739196ce6c |
| 20261005033000_inventory_receiving | d2fc78068272f80b36a320317be4281f1c6da5e5be0cf0056bbbdee99c0a5ac1 |
| 20261005043000_inventory_product_pricing | e05b9d74ebf926db861f40d0d501b25ecb283732b40dd9107342976bb7aaf9c3 |
| 20261005044500_inventory_receiving_rls | 73b3980db6403aed30698d0d4cd440dc01f9b2a39b0abefa6e17fe5ff3d04fd8 |
| 20261005081000_store_staff_roles | 94b00de3285d3950516a2d1dcf19b9d9070b6efa7317dc936dab254eb0db4986 |

僅記錄本支線檔案校驗值，未對正式套用；Prisma migration名稱非實際依賴順序，workspace須在receiving／pricing之前核對建立，禁止依排序盲目migrate deploy。
