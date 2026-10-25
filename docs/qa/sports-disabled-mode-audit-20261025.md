# 運動模組：關閉排課模式全店盤點（2026-10-25）

銀百合 production 設定讀取確認為 selfBookingEnabled=false、assignedSchedulingEnabled=true；問題是部分新增流程未讀取同一設定。本修正依每店當前設定套用所有 native sports 店家，不改店家開關，不變更資料庫結構。

| 入口 | 關閉開放選課後 |
| --- | --- |
| 新增／編輯收費 | 隱藏通用卡選項與說明；只顯示一組每筆收費可安排人員；保留舊方案 template 綁定，不改項目資格 |
| 教學項目 | 隱藏每堂扣點欄位，隱藏欄位保留既有數值 |
| 排課／課次名單 | 使用即時排課模式；關閉模式的既有課次不可新增學員／體驗客 |
| 候補 | 設定、課次候補及手動遞補同步停用，保留歷史名單 |
| 後台購買／指派及會員商店 | 過濾關閉模式方案；交易內再次檢查最新設定 |
| 方案上架 | 禁止新建、切換到或重新上架關閉模式；既有方案可維護資料 |
| 設定／開店引導 | 隱藏無效候補與介紹，關閉模式方案不計為可用收費；儲存模式後更新引導 |

保留既有購買、卡片額度、課次與出席紀錄；既有請假／改期另依該功能權限處理。音樂流程維持原規則。

## 驗證

- TypeScript noEmit 通過；ESLint 無錯誤，兩項既有 warnings。
- 最終相關測試 7 files、81 tests 通過；另有先前相關迴歸 10 files、105 tests 通過。
- 全套 13,730 tests，初次 59 failed；57 項在未修改的基準 2e816887 重現，另 2 項為新權威查詢所需的測試 mock，補齊後該組通過。全套非全綠，無新增未解釋失敗。
- 本機 Chromium 使用真實表單／目錄／設定元件，交易 action 以拒絕執行 stub 隔離：390×844、768×1024、1024×768、1366×900，各驗新增收費、既有收費、教學項目與設定，共16組通過。
- 檢查通用卡／開放選課說明與扣點欄位消失、收費人員選擇不重複、儲存按鈕可見、整頁無橫向溢出；結果與代表截圖在 artifacts/sports-disabled-mode-audit-20261025。
- 靜態 fixture 不等同正式登入交易驗收；未對正式店家新增訂單、改卡片或變更設定。

重跑：在 repo 安裝依賴後執行 `node artifacts/sports-disabled-mode-audit-20261025/preview-server.mjs`，另開 `PLAYWRIGHT_MODULE=/path/to/playwright node artifacts/sports-disabled-mode-audit-20261025/browser.cjs`（需 Chromium）。
