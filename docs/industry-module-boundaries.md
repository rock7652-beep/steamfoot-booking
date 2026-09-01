# 蒸足／SPA 模組邊界

## 立即生效的防火牆

`Store.industryModule` 是門市模組的唯一權威來源。後端不得再用 `isDemo`、slug、
名稱或固定門市 ID 判斷門市屬於蒸足或 SPA。固定 Demo ID 只能作為 SPA Demo 的
第二層 allowlist，不能取代模組驗證。

- 蒸足寫入入口先呼叫 `requireSteamfootStore(storeId)`。
- SPA 寫入入口先呼叫 `requireSpaStore(storeId)`。
- 共用預約入口先讀取 `getStoreIndustryModule(storeId)`，只執行該模組的規則。
- 新 SPA 功能不得新增至蒸足 action、query、client component 或共用資料模型。
- 模組不符時必須 fail closed，回傳中文錯誤，不得降級成另一模組的流程。

目前 SPA Demo 的共用檔案相依是既有技術債；在資料模型拆分完成前只能減少，不能
擴大。任何新增 SPA 功能應放在 `spa-*` 檔案，並由已驗證的 SPA route/component
載入。

## 資料模型拆分順序

1. 先部署加法 migration：新增 `Store.industryModule`，既有門市預設
   `STEAMFOOT`，只將已知 SPA Demo 標為 `SPA`。
2. 建立 SPA 專用預約、服務、權益與結帳模型；新 SPA 寫入只進新模型。
3. 對 SPA Demo 做可重跑的 backfill，逐筆核對 store/customer/staff 所有權。
4. SPA 讀取切到新模型並觀察；蒸足仍只讀既有 Booking、Wallet、Transaction。
5. 停止 dual-read 後，才從共用模型移除 SPA 欄位與 relation。

拆分採兩階段部署：先建立新表與雙寫／回填工具，再切讀取。不可在同一次 migration
直接搬移或刪除正式蒸足資料。

## 模組所有權

| 能力 | 蒸足 | SPA | 可共用 |
|---|---|---|---|
| 預約容量 | 空間／時段容量 | 芳療師技能與可用時間 | 日期時間工具 |
| 顧客權益 | 堂數方案、補課 | 療程權益（未來獨立） | 顧客身份主檔 |
| 結帳 | 單次收款、方案扣堂 | SPA 專用結帳（未來獨立） | 金額格式、付款方式值物件 |
| 服務目錄 | ServicePlan | Treatment | 無 |
| 儲值金 | 不支援 | 暫停開發，待獨立模型 | 無 |
| 人員排程 | 值班／容量 | 技能、班表、例外 | 員工身份主檔 |
