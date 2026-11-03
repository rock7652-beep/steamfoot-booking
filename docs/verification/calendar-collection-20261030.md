# 跨月課表與美業核對收款修正（2026-10-30）

[PR #1473](https://github.com/rock7652-beep/steamfoot-booking/pull/1473)；應用驗收版本 `bc51a949ad9b04688f18bcfeb40a54dfbac4f9a1`。

[隔離 Preview](https://steamfoot-booking-odqmgpb4k-rock7652-2111s-projects.vercel.app)，部署 `dpl_BeoYCg6xUHGvKrYCzvbWcKxtKPj8`，READY、非 production。後續僅驗收器／證據提交不另建應用版本。正式站未更新；Cloudflare 依使用者指示跳過，不改其保護。

## 問題與行為

無日期網址重開時，伺服器使用今天 10/30 查 10 月及跨週資料（至 11/7），client 卻還原上次 11 月日期，造成 11/4、11/5 先出現，11/12 等補讀後才出現。現在明確日期網址優先，日期選擇及新增／調課完成共用日期 setter，同步 URL；月份不符時不呈現部分月表或統計，改顯示可重試的載入狀態。外部美業來源保留原先核對資料後才更新 URL 的流程。

未帶日期的入口首次恢復跨月狀態仍需取得正確月份，不能宣稱沒有網路等待。日期已同步至網址後直接重新整理，伺服器可直接讀正確月份，無須額外補讀。既有讀取防重、晚到回應、權限與固定課展開規則保留。

美業名單只顯示「免收款」、「待收 NT$…」、「已收 NT$…」；尚未取得權威摘要時顯示「待核對 NT$…」，不推定未收金額。原價／折抵／已收明細仍在原核對表單，CARD 次數不變。

原本延後下載整個收款面板，程式抵達前沒有任何視窗。現在共用 ModalPanel 外框先掛載，表單仍延後載入，下載與權威資料讀取在窗內呈現狀態。外框不隨表單載入重建。無待收款時「完成」只關閉，不誤呼叫已儲存 callback；真正收款／折抵與不確定結果恢復仍走原後端與防重流程。表單 key／reader scope 同時涵蓋店家與對象。

## 已驗證

- 14 檔 86 項針對性測試通過，含跨月完整性、失敗、既有日期保留、明確連結優先、新增／調課後日期 setter、外部 URL ownership、收款對象切換、錯誤保留草稿、既有不確定結果與權限保護；[測試紀錄](calendar-collection-20261030/focus-tests.log)。
- 應用版本 [CI](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/41008303959) 的 Full Vitest、Targeted tests、Typecheck、Changed-file ESLint 均成功；本機 Typecheck、變更檔 ESLint、驗收器語法與 whitespace 檢查成功。驗收器／證據後續提交以 PR Checks 即時狀態為準。
- 正常帳密登入、真實 server actions／reader；僅已授權 `sports-live-flow-store` 與 `beauty-hosted-20261021` 的 QA1469 合成資料，不建立或啟用其他店家。
- [最終 hosted 紀錄](calendar-collection-20261030/browser.json)：17 項檢查通過，pageerror=0。
- 課表讀取刻意失敗一次後，畫面保留載入／重試邊界；重試時舊錯誤清除。另刻意延遲 JSON 回應 5 秒，觀測到的 QA 課程數只為 0 或完整的 3（4／5／12 日），沒有誤呈現 1／2 堂的部分月表。正常登入動作可能先回傳完整權威 RSC，完整月份先到仍可顯示，不強迫等待另一支 JSON。
- 重新整理保留 URL 日期，沒有錯月補讀；明確 10 月網址優先於記住的 11 月。
- 美業名單只有單行免收款摘要，原價／折抵在核對視窗；刻意將新表單 JS 延遲 5 秒，視窗外框約 53 ms 出現（單次雲端樣本）。53 ms **只代表外框可見，不是收款查詢完成時間**，5 秒是控制延遲，不是現場效能量測。
- 資料到齊後核對原價 750、折抵 750、應收 0；按完成後 URL、原名單 DOM 保留，不觸發新的 server action，也不建立收款。[資料庫核對](calendar-collection-20261030/authority.json)：新 QA 預約仍 RESERVED、price=750、debit=false，付款紀錄 0、原 QA 折抵稽核 1。
- 桌機 1366×900、iPad 尺寸 1024×768／768×1024 檢查課表及視窗，無頁面橫向溢出，視窗位於可用範圍；[768px 收款視窗](calendar-collection-20261030/collection-768.png)。全頁截圖可能含隔離店其他既有姓名，只留工作區，不提交公開倉庫。

## 範圍與交付

這是雲端 Chromium 的隔離合成資料驗收，不是實體 Safari 或銀百合／舒生活正式資料驗收；未重做真實收款、扣次、退款或 HQ ADMIN 切店完整流程。伺服器存取與交易規則未放寬。

建置確認 `[sports-redesign-preview] isolated_database=true migrations_skipped=true notifications_blocked=true`。新分支只獲得精確 Preview allowlist；美業收款核對 QA scope 另核對 repository、分支、兩條隔離連線與唯一既有美業 QA 店，拒絕其他店、正式連線／環境。未修改正式環境變數。

兩個既有臨時 QA 帳號目前僅為本次人工覆核重新啟用，帳密置於倉庫外私有檔，不附在 PR／證據。使用者驗收後再次停用並清除密碼。修正版維持 Draft，未合併 main、未部署正式站。

重跑 hosted 驗收：`scripts/qa/calendar-collection-browser.mjs`，需提供同專案受保護 Preview、私有合成登入檔、外部證據目錄與環境目錄。僅在已授權兩個隔離店已有 QA1469 fixtures 時執行；不偽造 session，不使用正式帳號，不自動送出收款。
