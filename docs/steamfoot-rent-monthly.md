# 蒸足月結：服務收入與租金分列

- `/dashboard/service-fee-calculator` 的 STEAMFOOT 分支顯示人員清單；COURSE/SPA 保持原分支。
- 服務收入沿用 `previewStaffSettlement`：已完成服務、收益歸屬人員、方案實收/堂數、補課原方案、調整待核對與人工覆核規則。不是以收款交易總額重新計算。
- 空間租金在人員管理 → 人員 → 空間租金設定；每期 1/3/6/12 個月，起始月與每月金額，按約定週期持續。取消收租也從下一個完整租期生效。
- 每個租期有穩定識別（設定 ID + 租期起始月）；例如 7–12 月各月份顯示同一個 30,000 元租期，不產生六筆應收。
- 租金與服務收入不相減、不合計成應付、不表示已收已付、不發送通知。店家自行處理實際收付款。
- 初次設定可填歷史起始月份，但不猜測原 monthlySpaceFee 的租期。原設定僅作輸入預設；尚未建立租期時提示待設定。
- 新約定需接在下一個完整租期；不能回寫已開始租期的單價。人員停用不等於取消租約，涵蓋月份仍顯示租金。
- StaffRentTerm 使用 store+staff 複合外鍵；寫入時先鎖 Staff，再檢查 expectedTermId 避免並發重複。RLS 開啟，anon/authenticated 不授權；服務端要求 staff.manage、OWNER/ADMIN、可寫店舖與 STEAMFOOT 模組。
- 不寫入舊 SpaceFeeRecord，避免舊報表自動扣除；舊版店舖月結/歷史紀錄另有連結保留。

## 部署

先於目標環境套用 `20260925124707_steamfoot_rent_terms`。預覽分支有資料庫隔離檢查，只允許既有 steamfoot-preview。正式發佈前仍需正式庫 migration；本次未套用正式庫。

## 驗證

針對租期跨年、1/3/6/12 月、同租期識別、歷史單價不變、並發版本、模組/角色/店舖/唯讀隔離，以及既有服務收入、月結與課程回歸測試。

2026-09-25 驗證結果：92 項針對性測試通過。首版 ae838f89 預覽 READY，隔離資料庫檢查通過；CI ESLint/Typecheck/Targeted tests 通過。完整基線仍有既有 4 項失敗（business-hours-store-scope、course-dense-schedule、course-ui-final-fixes-contract、spa-shared-import-freeze）；未修改或停用這些檢查。預覽入口已驗證可到登入頁，登入後 UI 操作尚待完成。
