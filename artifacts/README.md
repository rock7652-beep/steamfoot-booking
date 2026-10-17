# 運動模組驗收證據（2026-10-17）

完整範圍、重現指令及限制見 [驗收報告](../docs/verification/sports-readiness-audit-20261017.md)。資料皆為隔離測試店家，非正式店家資料。

- [課表元件、桌機與 iPad 尺寸](sports-refresh-20261017/results.json)：真實元件配合 stub actions／router／時鐘；不可視為完整業務驗收。
- [真實登入、購買與退款](sports-live-flow-20261017/results.json)：Next Server Actions、隔離 PostgreSQL、另一個已開啟交易頁同步。
- [預約、取消釋放、出席扣點、取消還點](sports-booking-live-20261017/results.json)：每步資料庫與點數流水快照。
- [兩個獨立登入端的預約同步](sports-booking-sync-20261017/results.json)：桌機操作、iPad 尺寸 Chromium 觀察端，三步約 57–60 秒同步。取消先驗證摘要自動出現，再手動展開封存名單確認還點。
- [單元／元件回歸紀錄](sports-regression-20261017/unit-regression.log)：19 檔、350 項通過。PostgreSQL 39 項結果與型別／lint 檢查紀錄見報告。

各資料夾包含截圖。`initial-script-diagnostic`、`cancel-selector-diagnostic` 及 `purchase-first-pass` 保留驗收過程的診斷／初次操作證據，以各根目錄 `results.json` 為最終結果。

未涵蓋正式部署、實體 iPad Safari、其他角色及會員自行預約規則。測試沒有修改業務時鐘；管理者透過目前介面允許的提前點名完成扣還點。
