# 美業帳務與共用方案瀏覽器驗收

2026-10-21（台灣時間）。接續美業獨立支線 `50eef0f8`，使用既有專用 Sandbox 與合成資料；LINE 申請尚未完成，本輪不以此阻擋帳務驗收。正式站未合併、部署或啟用。

## 本次結果

`scripts/qa/beauty-sandbox-commerce.mjs` 以公開 HTTPS、原生 Chrome、真正登入與 Server Actions 操作，再以受限 backend 查詢專用 PostgreSQL。沒有 action、session 或資料庫 mock，也沒有直接寫帳本來代替 UI 操作。

| 實際操作 | 核對結果 |
|---|---|
| 新增合成家人，售出可共用次數方案 | 購買人與具名家人共用同一份1次餘額，GRANT只有1筆 |
| 家人使用方案預約 | 餘額仍1次、預留1次，顧客管理顯示可用0次 |
| 店長取消此預約 | 保留1次餘額，沒有扣次帳本；再次可預約 |
| 家人重新預約，由真正技師登入「我的工作」完成 | 恰扣1次，餘額0；實收1000元的50%拆帳500元歸屬實際服務技師 |
| 單次服務收800元並完成 | 實收50%產生400元拆帳 |
| 月結確認後登錄技師付款300元 | 付款與正確服務、實際技師連結 |
| 登錄已收回的拆帳300元 | 追加FEE_VOID -300，保留原FEE及關聯 |
| 取消服務後退款800元 | SALE 800、FEE 300、FEE_VOID -300、REFUND -800四筆保留；共用收支帳四筆的收入減支出為0 |

最終執行 `b5927b65`：**8項通過、page error 0、待發通知0**。證據：[瀏覽器結果](evidence/commerce/results.json)、[資料庫核對摘要](evidence/commerce/database-verification.json)。所有付款方式均為轉帳登錄，沒有真實匯款、退刷或 LINE 發送。

方案購買表單驗證1440×900、1024×768、390×844；月結／退款頁驗證1366×900、1920×1080、1024×768、768×1024、390×844，無整頁水平溢出，並實際完成操作。這是 Chromium 尺寸驗收，並非實體 Safari／iPad 證據。

## 實作改善與驗證

月結原先只有技師、服務與金額，多筆同價服務難以辨認。本輪在每筆月結補上**服務時間與顧客姓名**；資料仍來自權威服務紀錄，拆帳計算與既有權限沒有改變。月結 fingerprint 隨完整明細計算，舊畫面遇變更須重新核對，未改寫舊月結或帳務。

指定回歸4檔／52項通過（transactions、access、allocation、sandbox scope）；TypeScript noEmit、變更來源 ESLint、腳本語法與 diff check 通過。未重跑全站測試。

第一次腳本選單定位過於嚴格；後續修正月結頁等待互動完成及排除無內容的共用alert，再修正驗收程式對 Prisma Decimal 的加總（顯式轉Number）。這些失敗輪次的合成顧客／帳務保留供追溯，沒有刪帳清場；最後以獨立識別碼重新操作完整8項。未把先前未完成的輪次計為通過。

## 重現與證據保留

在既有專用 Sandbox 的 repository 中，透過命令環境提供 `QA_BEAUTY_REVIEW_PASSWORD`，執行 `node --env-file=.env.local scripts/qa/beauty-sandbox-commerce.mjs`。腳本先驗證 exact-origin、專用 loopback DB、受限 backend、development runtime及通知關閉；拒絕正式或共用資料庫。不要將測試密碼寫入文件或程式。

截圖仍保存在該 Sandbox 的 `/tmp/beauty-sandbox-commerce/b5927b65/`，包括方案購買三尺寸、技師完成與月結五尺寸；不是永久儲存。自動審查拒絕將含合成顧客與帳務的截圖放到免登入的公開路徑，因此沒有公開截圖；repository只保留不含顧客識別資料的兩份摘要。

## 待驗與下一步

- LINE 真實登入、身分返回與指定收件人送達：待申請完成及綁定測試通道；通知仍關閉。
- 接續補驗技師撤權、低權限 action 偽造及跨店隔離；不要把隱藏按鈕當成完整後端授權證據。
- 本輪未驗現金抽屜UI、信用卡退刷、所有共用成員修改情境、取消／未到扣次的全部設定組合，或正式 PostgreSQL17／pooler。歷史 domain 測試與正式啟用證據維持分開。
