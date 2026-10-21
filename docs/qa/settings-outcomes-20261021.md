# 六類設定儲存結果處理

基準：main `5aebaa69e305caee08e8392de920b46d0599a161`；支線 `fix/settings-save-outcomes-20261021`。本批未合併／發布正式站。

## 修正

自行預約、預約期限、蒸足方案、教學項目、課程方案、人員帳號均使用 `canCloseConfirmedSettingsSave`：乾淨成功才收合，syncWarning 保留可見警告與輸入。新增方案／教學項目與課程表單已確認寫入但有警告時禁止再次提交，避免在警告畫面重複建立。人員權限沿用原後端規則；未變更資料庫 schema、正式環境或交易邏輯。

原有 `useSettingsSave` 的送出鎖、失敗輸入保留、不確定時原 payload/requestKey 重試繼續使用。課程方案父層收到 syncWarning 僅更新確認資料，不關閉正在核對的表單。

## 驗收方式與限制

`scripts/qa/settings-outcomes-browser.mjs` 載入六個實際產品元件，攔截所有網路與 server action。1366×900 各驗成功、明確失敗、不確定、同步警告及人為 3300ms 回覆；另於 1920×1080、1024×768、768×1024 驗成功、草稿尺寸切換與全頁溢出。預期總計 48 案例。測試不確定時 payload/key 完全相同，警告時不得再次提交已確認的寫入。

這些為隔離元件瀏覽器測試，不是登入後資料庫整合、不是真機 iPad/Safari，也不是正式站耗時。Sports saveSportsFee 的獨立 server action 不由此攔截測試證明其回覆契約；不將非 hook 分支概括為完整驗收。

執行紀錄與最終隔離 Preview URL 待本輪驗收完成後補記。
