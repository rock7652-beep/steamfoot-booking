# 美業隔離店現金驗收（2026-10-25）

使用者先明確允許補關測試店 2026-10-21 舊抽屜，再確認實點現金 **1,000 元**。沿用先前隔離店新增有標記測試資料與現金收退款驗收授權。本輪沒有操作正式站、正式庫或開啟 LINE。

## 環境與流程

- Supabase：`steamfoot-preview`／`ttworfzgwejdeolegkxl`。
- 店：`beauty-hosted-20261021`；部署 `dpl_28VBekuzbTbf8WKSnGutQYBtFsnG`，程式 `e0b4e731`，未重新部署。
- 重新啟用僅屬本店的既有 QA OWNER 供登入驗收；只變更該有標記帳號，沒有重設其他人的密碼。
- 透過實際後台 UI 補關舊抽屜、開店、預約、收款、取消、退款與閉店；SQL 僅作核對及本輪 QA 資源／帳號啟停，沒有以 SQL 假造現金交易或直接改抽屜金額。

## 實際結果

| 操作 | 金額與核對 |
| --- | --- |
| 補關 10/21 舊抽屜 | 原 ID `cmvi63bxp0001js0899pcq8hd`；帳面 1,000、實點 1,000、差額 0、狀態 CLOSED；備註保留授權說明 |
| 今日開店 | 10/25 新抽屜 `cmvngshxn0001jv08lqlyt7r8`；承接上日實點，帳面／實點 1,000，差額 0 |
| 建立測試預約 | 既有 QA 甲，10/30 19:00–20:00，QA 服務／技師1／床位1，價格 1,000；新增預約 `cmvnguuz50002jv08wp218fuz` |
| 現金折扣收款 | 原價 1,000、折抵 100、應收 900；CASH SALE `cmvngwuad0006jv08lm52qqf9`；抽屜 UI 增至 1,900 |
| 相同收款重送 | 重送同一 requestKey 與原內容，最終只有 1 筆 SALE 與 1 筆對應現金帳收入，沒有多收 |
| 取消與退款 | 先從預約清單取消本輪預約，再由營運交易詳情以 CASH 退款 900；REFUND `cmvnh1zps000ajv08embhzsje` 正確指向原付款 |
| 相同退款重送 | 最終只有 1 筆 REFUND 與 1 筆對應現金帳支出，沒有多退；退款後抽屜 UI 回 1,000 |
| 今日閉店 | 系統應有／實點／下次起點均 1,000；差額 0、狀態 CLOSED。UI 顯示「今日已結帳」 |

兩筆 BeautyPayment：+900／−900，淨額 0；兩筆 CashbookEntry：INCOME 900／EXPENSE 900，付款方式 CASH，與原付款 ID 一一相符。預約最終 CANCELLED、fee 0。沒有修改其他既有顧客或交易。

## 收尾

- 本輪借用的 QA 服務、技師1、床位1 再次停用；未刪除資料。
- QA OWNER 再次 SUSPENDED，對應 Staff INACTIVE；原低權限 QA 帳號維持停用。
- 本輪新建的暫時存取連結已撤銷，私有密碼／存取資訊檔案已移除，部署保護未關閉。
- QA 預約相關 BeautyEvent 的 SENT 數量 0。LINE 關閉。
- 今日已結帳；若同一天還要做新的現金操作，需走既有撤銷閉店權限與流程，不自行回開。

瀏覽器 pageerror 為空。腳本曾使用錯誤 menu role、嘗試填寫收合的選填備註，以及用「已閉店」檢查實際「今日已結帳」文字；這些是驗收腳本限制，不宣稱所有腳本命令一次通過。更正操作後以實際 UI、付款筆數、抽屜 SQL 與最終截圖確認結果。HTTP 200 的重送回應本身不當作業務成功依據。

## 交付與剩餘範圍

**現金正向收退款與抽屜驗收已完成**，取代前輪「被 10/21 未關帳阻擋」待辦。新增交易與舊抽屜補關永久保留，不為恢復測試前狀態刪帳或回開。

正式發布仍需完成 [正式升級審查包](../qa/beauty-production-review-20261025/README.md) 的角色／共用權限、獨立環境首次安裝、正式庫備份及目標店接點核對，最後才提出正式部署授權。本輪不能視為正式上線完成。

證據：[最終核對](evidence/20261025-cash-acceptance/final-state.json)、[瀏覽器紀錄](evidence/20261025-cash-acceptance/browser-results.json)、[折扣收款](evidence/20261025-cash-acceptance/cash-discount-900-before-submit.png)、[收款後 1,900](evidence/20261025-cash-acceptance/cash-drawer-after-sale1900.png)、[退款後 1,000](evidence/20261025-cash-acceptance/cash-drawer-after-refund1000.png)、[閉店差額零](evidence/20261025-cash-acceptance/cash-final-closed1000.png)。
