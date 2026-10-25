# 收費規則相容讀取與模擬儲存

## 已實作（本機）

- charge-rule-storage.ts 定義嚴格 version=1 包裝與資料來源核對。只有明確 null 走舊資料分支；undefined、破損規則、未知版本、空 SELECTED 名單均拒絕。
- 讀取核對門市、收費 ID、適用服務；catalog 另核對修訂。快照保留原修訂，不要求與日後方案的新修訂相同。
- 購入與預約快照使用解析後深複製，舊卡讀取函式沒有「現行方案」參數，避免意外套用新限制。
- 相容顯示獨立收費名稱，僅 null 沿用服務名稱，不回寫服務名稱。價格設定狀態以 null／false／true 區分待核對／未定價／已設定，不以價格零元推定狀態。
- prepareStoredChargeRuleUpdate 只產出規則與新 revision 的 patch，不更新技師 serviceIds、名稱、價格或適用服務。現有多服務方案不縮減，需保留相容流程。
- createChargeRuleSave 是注入交易介面的服務工廠，未註冊真實資料庫 adapter、未建立 server action／API、未從現行業務入口呼叫。測試全部使用 vi.fn 與記憶體假資料。
- 模擬交易流程：授權 → 確認目標門市 → command → 鎖定讀取介面 → 驗證技師與修訂 → expectedRevision 條件寫入介面。遇到衝突直接拒絕，沒有 retry 迴圈。

## 驗證邊界

此階段驗證條件與呼叫順序，沒有驗證真正 DB 鎖、transaction rollback、並發或持久化冪等。command 的儲存與重播仍由未接通的 adapter 負責。authorize 介面將來必須實際檢查登入、plans.edit、門市與功能／營運狀態；目前使用 mock，不代表真實授權已接好。

單次價格、收費名稱、新建服務未定價的公開預約阻擋，以及售卡／預約／改期端點仍待整合。核對 UI 沒有正式儲存 port，功能旗標未開啟。不能宣稱新版全流程可上線。

## 檢查

執行 11 個指定 pure／mocked／DOM 測試檔，含本次 11 項新相容／模擬儲存測試。93 項測試、TypeScript noEmit、異動檔 ESLint 與 git diff --check 均通過。所有測試與型別／lint 檢查均載入 socket 封鎖器；實際輸出附於 handoff。

## 維持停止

未修改 schema、未產生或執行 SQL／migration、未連線或寫入任何資料庫、未重試資料庫、未清資料、未部署或推送。

## 接續

資料模型仍為待確認設計。若要進入真正資料庫階段，需先提出確切 SQL、目標環境、影響筆數、備份與可執行的還原方案；現有禁止條件尚未解除。可繼續本機補足價格儲存 patch 與各入口 adapter 的模擬測試，但不能接入真實寫入。
