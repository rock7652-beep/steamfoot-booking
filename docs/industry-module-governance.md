# 產業模組治理與上線規範

本文件定義總部如何讓蒸足與 SPA 模組共用帳號、店舖與權限基礎，卻各自擁有預約與交易領域。目標是讓既有蒸足店維持原流程，並讓 SPA 以新店、專屬資料模型與專屬路由逐步上線。

## 不可變規則

1. `Store.industryModule` 是執行期唯一授權來源；不得用 slug、Demo 標記或前端選項推斷模組。
2. 一家店只允許一筆 `StoreModuleInstallation`，建立後不得從 SPA 直接切回蒸足或反向切換。
3. 保留既有店的模組；僅補齊缺少的 installation。蒸足為 `ACTIVE`，SPA 為 `PROVISIONING`，不覆寫已有狀態。
4. SPA 使用 provider availability、treatment 與 SPA booking；不得建立或讀取蒸足 `BookingSlot`／legacy `Booking` 作為 SPA 的營運資料。
5. `StoreModuleInstallation.status !== ACTIVE` 時，HQ 不得啟用店舖，也不得開放對外預約。

## 目前狀態

本次基礎版本可由 HQ 選擇模組，並把新 SPA 店建立為 `PROVISIONING`。這是刻意的安全閘門：它不會建立蒸足時段或營業時間，也不能被啟用。只有在 SPA 專屬 schema、資料佈建與端到端驗收完成後，才可由受控的 provisioning action 將它改為 `ACTIVE`。

## 上線順序

1. 依 `docs/spa-release-readiness-20260911.md` 使用完整 SPA reconciliation 腳本，先演練再依授權部署。原三份 PR migration 已封存，不再作為部署入口；確認既有蒸足 installation 為 ACTIVE，保留 SPA 原模組與狀態。
2. 驗收蒸足回歸：店家登入、顧客預約、既有 Booking、方案、付款、報表各至少一條完整流程。
3. 建立一間新的 SPA demo 店，確認它是 `PROVISIONING`、沒有 legacy `BookingSlot` 與 `BusinessHours`，且 HQ 無法啟用它。
4. 導入 SPA 專屬 schema、佈建器及 SPA 讀寫鏈；SPA 月／日排程必須只查 SPA booking，不能再呼叫 legacy `getMonthBookingSummary`。
5. 為每個 SPA server action 加入 `requireSpaStore()`；蒸足專屬 action 加入 `requireSteamfootStore()`。兩邊都要在伺服器端做檢查。
6. 於 Preview 對同一組 SPA 店執行「可預約時段 → 建立預約 → 月／日排程立即顯示 → 改期／取消 → 付款或扣療程」全鏈路測試。
7. 另開經維運審核的 production migration PR，將本 migration 的精確 ID、checksum 與前後 schema 指紋加入 `scripts/ci-migrate.mjs` allowlist；不可在一般功能 PR 中直接開放任意 migration。
8. 正式 DB migration 成功、Steamfoot smoke test 通過後，才部署讀取 `industryModule` 的應用程式，最後將單一 SPA pilot 安裝狀態切為 `ACTIVE`。

## 回滾原則

- 發現 SPA 缺陷：先將 SPA 店設為 `PAUSED` 或維持 `PROVISIONING`；不得修改蒸足資料表補救。
- 資料 migration 採 additive，正式上線後不刪除 `industryModule` 或 installation 記錄。
- 若需移除 SPA pilot，保留資料與失敗原因，將 installation 設為 `FAILED`，不做跨模組資料搬移。
