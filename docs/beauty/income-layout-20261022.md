# 技師本人收入版面簡化

2026-10-22，美業隔離支線 preview/beauty-ui-alignment-20261021。
部署來源 e69c14b99500601937e3ecbaa8e0584d0515e133；Preview dpl_FFNJ9xfh3CtXMhbgnsd2ZsSc7JX5，READY。
https://steamfoot-booking-fxqgrhk4r-rock7652-2111s-projects.vercel.app/s/beauty-hosted-20261021/

返回改文字按鈕，月份靠右，摘要獨立顯示金額，明細以日期時間、服務名稱及靠右金額呈現；移除只會重複名稱日期的展開。沿用 PersonalIncomePanel 的摘要、篩選及分頁；compact 參數僅美業啟用，其他模組預設呈現不變。

54 項相關測試通過，TypeScript、ESLint、diff check 通過，hosted build READY。真實測試技師登入，核對四筆明細與本月應領 NT$1,950；切至九月舊金額消失，切回十月正常；返回今日工作正常，沒有 pageerror。Chromium 360、390、768、1024 寬度無整頁溢出，截圖見 evidence/income-layout-20261022。實體 iPhone Safari 視覺仍待店家確認。

本輪只有呈現變更，未修改收入查詢／授權／結算／付款／扣次規則，沒有資料寫入或 migration；LINE 維持關閉，正式站未動。
