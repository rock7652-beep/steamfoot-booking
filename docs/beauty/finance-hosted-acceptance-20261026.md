# 隔離美業收款／現金驗收（2026-10-26）

免費本機 Playwright／Chromium。應用版本 eafcc968、部署 `dpl_AraNQ37aQu3wJa6WjSB1sLsNfWus`；後續 50f72b66 只有驗收文件更新。唯一資料庫 `ttworfzgwejdeolegkxl`、店家 `beauty-hosted-20261021`，Production 與 LINE 未操作。

本輪使用新的 QA MANAGER `qa-finance-4310a985`，只連結該店。建立標記顧客、專用床位／技師與新方案；既有顧客、方案設定與預約未修改。業務預約、收款、退款、開關抽屜與固定費用儲存均透過正常登入後的 UI 執行，只有 fixture 與帳號建立／停用使用資料庫管理接點。

## 通過

- 同一組兩人預約：甲做臉 1,000，乙按摩 1,500，各自使用專用位置／技師。新增預約成功，兩筆資料庫紀錄屬同 group。
- 收款切換：刻意延遲甲 quote 6 秒、乙 quote 4 秒；關閉甲後開乙，乙載入期間確認收款停用，甲晚到不覆蓋乙，最後只有乙姓名與金額 1,500。
- 乙現金收款 1,500 後，以相同登入 session、相同 requestKey／完整請求重送；原請求與重送皆 HTTP 200，資料庫只一筆 SALE 1,500。
- 甲原價 1,000、折抵 100，現金收款 900。完成後預約清單仍開啟。
- 本輪開店點錢 1,000；收款後抽屜顯示流入 2,400、支出 0、應有現金 3,400。
- 兩筆測試預約先正常取消，再由營運交易詳情分別登錄現金退款 1,500 與 900；各有對應原 SALE 的 REFUND -1,500／-900，沒有刪除原交易。
- 本輪抽屜 `cmvo7wdex0001jq073jj0durp` 已 CLOSED，expectedClosingCash=1,000、closingActualCash=1,000、closingDifference=0、finalBookBalance=1,000。美業現金透過現金帳接點納入計算；不能把 session 上 legacy 的 cashIncomeTotal／cashExpenseTotal（皆 0）誤當美業收退款明細。

甲預約 `cmvo7xgi50002jq07n1ffbka3`、乙預約 `cmvo7xgjj0006jq07q989dk4v`。原收款 `cmvo81vl3000ejq078pmbthhd`（甲 900）、`cmvo80vqc000ajq07u1tf5ohh`（乙 1,500）。

## 發現問題：固定費用立即重開未同步

- 新方案 `qa-finance-4310a985-plan`，售價 5,000、5 次。從共用收費表單設定店家固定費用 1,500，選本輪專用技師。
- 儲存後對話框關閉，立即重開同筆，固定費用欄位顯示空白；數秒後仍空白。
- DB 唯讀確認：方案 revision=1，技師限制正確；不可變 `CHARGE_SETTING` 事件確有 `storeCost:1500`。因此已寫入，但重開 UI 未帶回本次值。
- 尚未完成完整重新載入對照，不能定論是 router.refresh 競態或讀取映射問題。本輪最後的診斷工具被中止；未進行固定費用分帳購買，也未對此修改程式。
- 下一步應先重現並修正這個同步問題，再驗證 5,000 折抵 100 後店家 1,500／所屬店長 3,400 的財務快照與退款反向分配，不能宣稱分帳驗收通過。

## 收尾與證據

- 專用帳號已 User=SUSPENDED、Staff=INACTIVE、passwordHash=NULL，停用稽核保留。本輪瀏覽器程序已結束，沒有重用上輪帳號。
- 本輪登入與存取憑證暫存檔已移除。限時 Vercel share 設為一小時；工具中止後其記憶體句柄已遺失，未確認提前撤銷，不宣稱已撤銷。它不取代應用帳號登入，專用帳號已停用。
- 沒有回寫既有顧客、刪除帳本、還原交易或發送 LINE。新增 fixture 與測試交易保留。
- 自動化有定位錯誤／等待逾時（動態按鈕名稱、select 標籤、隱藏 textarea、閉店狀態文字），已按畫面結構修正並以資料庫結果核對；不把這些定位失敗當產品故障。固定費用空白是實際讀值失敗，獨立列為尚缺項。

證據：[瀏覽器紀錄](evidence/20261026-finance-hosted-qa/browser-results.json)、[甲晚到後的乙收款](evidence/20261026-finance-hosted-qa/B-after-late-A.png)、[甲折抵後應收 900](evidence/20261026-finance-hosted-qa/A-discount-900.png)。
