# 固定費用同步修正與分帳實際驗收（2026-10-26 台灣）

固定費用儲存後立即重開已同步；購買方案、歷史分帳、部分／全額退款及退款重送驗收通過。範圍僅隔離美業測試店 `beauty-hosted-20261021`，正式站未操作，LINE 未發送。

## 修正

- `3c9db8ae`：收費編輯器在儲存成功、背景 catalog refresh 尚未完成時，會拿舊 props 重開。現在暫存伺服器確認的 draft 與 revision，以店家／種類／實際 ID 隔離；更新的伺服器 revision 優先，失敗儲存不發布本地值。
- `b6b17eb5`：真實購卡發現共用結帳表單將美業固定費用同時放進課程專用 `expectedStoreCost`，後端正確拒絕交易。美業 adapter 現在清除課程專用欄位，保留 `beautyExpectedStoreCost` 的權威核價。既有後端授權、鎖定、revision、冪等與帳本檢查均保留。

本輪沒有 schema 變更或 migration。沒有改寫既有顧客或正式資料。

## 程式與測試站

11 個測試檔共 89 項通過；TypeScript、變更檔案 ESLint、git diff --check 通過。涵蓋立即重開、單次／方案、後續儲存 revision、新伺服器版本、跨店隔離、失敗儲存、Beauty 結帳 adapter、後端成本防護與分帳退款。

實際完成交易驗收的應用版本：`b6b17eb558d1a693d4d9aec006ced85f6dcc4f56`。

Vercel READY deployment：`dpl_3vFNc62Acm4THEkL3dEU6fYLhX9p`。

https://steamfoot-booking-f23e31b0v-rock7652-2111s-projects.vercel.app

延遲 refresh 的同步案例先於 `3c9db8ae` Preview 驗證；後續結帳修正保留同一同步實作。文件提交可能觸發後續 Preview，不代表另測了該部署。未執行含自動 migration 的本機正式 build，不宣稱全庫 CI 或正式發布驗收全部完成。

## 實際驗收結果

以免費本機 Chromium 正常登入專用隔離 MANAGER；未使用 TinyFish，也未合成應用 session。

- 人為延後背景 refresh 6 秒，固定費用 1,500 → 1,600 → 1,500，兩次立即重開及再次儲存正確；完整重載仍為 1,500。
- 最新 Preview 的 1366×900、1024×768、768×1024、390×844，固定費用正確、儲存可見、無整頁水平溢出。這是 viewport 模擬，未代表真機／Safari／鍵盤驗收。
- 標記測試方案售價 5,000、折抵 100、轉帳實收登錄 4,900；只建立一張 5 次卡與一筆收款。這是測試交易登錄，沒有實際銀行轉帳。

| 狀態 | 累計退款 | 店家分帳 | 所屬店長分帳 |
| --- | ---: | ---: | ---: |
| 實收 4,900 | 0 | 1,500 | 3,400 |
| 部分退款 | 2,450 | 750 | 1,700 |
| 全額退完 | 4,900 | 0 | 0 |

購買後暫改目前方案固定費用為 1,800，舊交易仍維持 1,500／3,400，證明讀取原交易快照。第一次退款後，重送同一實際請求／requestKey，結果成功且資料庫仍僅一筆退款。第二次退完後，總計一筆 +4,900 收款、兩筆 -2,450 退款；額度帳本僅 GRANT +5、REFUND -5，沒有重複收回。

卡片 `cmvo9emmg0000ld07068qefo1`；原收款 `cmvo9emn40002ld07ifd7l0yk`；退款 `cmvo9hcma0006ld07fkx6ka1o`、`cmvo9iumh0008ld07s2ei7o1j`。金融測試紀錄保留。

## 收尾與限制

測試方案固定費用已還原 1,500（revision 5）。本輪轉帳交易未重開現金抽屜，抽屜仍 CLOSED、帳面 1,000。通知為 SKIPPED，原因為隔離預覽不向外發送 LINE。

專用 User 已 SUSPENDED、Staff INACTIVE、密碼移除；最後 session 查核無登入使用者。兩個本輪暫時 Vercel 存取均已撤銷，瀏覽器結束，密碼／存取憑證暫存檔刪除。

瀏覽器應用 page errors 為空。自動化曾因延遲路由取消及重複成功文字定位而中止，已修正 driver／定位並唯讀核對交易，沒有為了重跑定位再次購卡；最初結帳拒絕則為真實產品問題，已修正後重新驗收。不把自動化問題隱藏成全程無錯誤。

本輪完成指定的同步與固定費用分帳案例；多人改期、全站其他案例及正式發布仍需獨立核對。

## 證據

- [瀏覽器紀錄](evidence/20261026-fixed-cost-sync/browser-results.json)
- [資料庫最終核對](evidence/20261026-fixed-cost-sync/database-results.json)
- [平板固定費用](evidence/20261026-fixed-cost-sync/fixed-cost-1024.png)、[手機固定費用](evidence/20261026-fixed-cost-sync/fixed-cost-390.png)
- [折抵後分帳](evidence/20261026-fixed-cost-sync/allocation-4900-confirmed-quote.png)、[歷史分帳快照](evidence/20261026-fixed-cost-sync/historical-allocation-1500-3400.png)
- [部分退款](evidence/20261026-fixed-cost-sync/partial-refund-750-1700.png)、[全額退款歸零](evidence/20261026-fixed-cost-sync/full-refund-allocation-zero.png)
