# 六類設定儲存結果處理

基準：main `5aebaa69e305caee08e8392de920b46d0599a161`；支線 `fix/settings-save-outcomes-20261021`。本批未合併／發布正式站。

## 修正

自行預約、預約期限、蒸足方案、教學項目、課程方案、人員帳號均使用 `canCloseConfirmedSettingsSave`：乾淨成功才收合，syncWarning 保留可見警告與輸入。新增方案／教學項目與課程表單已確認寫入但有警告時禁止再次提交，避免在警告畫面重複建立。人員權限沿用原後端規則；未變更資料庫 schema、正式環境或交易邏輯。

原有 `useSettingsSave` 的送出鎖、失敗輸入保留、不確定時原 payload/requestKey 重試繼續使用。課程方案父層收到 syncWarning 僅更新確認資料，不關閉正在核對的表單。

## 驗收方式與限制

`scripts/qa/settings-outcomes-browser.mjs` 載入六個實際產品元件，攔截所有網路與 server action。1366×900 各驗成功、明確失敗、不確定、同步警告及人為 3300ms 回覆；另於 1920×1080、1024×768、768×1024 驗成功、草稿尺寸切換與全頁溢出。預期總計 48 案例。測試不確定時 payload/key 完全相同，警告時不得再次提交已確認的寫入。

這些為隔離元件瀏覽器測試，不是登入後資料庫整合、不是真機 iPad/Safari，也不是正式站耗時。Sports saveSportsFee 的獨立 server action 不由此攔截測試證明其回覆契約；不將非 hook 分支概括為完整驗收。

## 完成結果

- 產品提交：`fc994ce11a9b138d2e6873d3eba4e1fb68a31d3d`。
- 48/48 元件瀏覽器案例通過；另補跑 18/18 編輯中尺寸檢查，驗證儲存按鈕在 viewport 可見範圍、編輯時無整頁水平溢出。不是額外 18 個業務情境，與48案例分開記錄。
- warning 截圖顯示輸入與持續提示；1920教學項目、1024方案、768人員及課程方案編輯畫面已人工檢視。垂直內容允許在表單區內捲動。
- 本機最終 TypeScript noEmit、產品 ESLint 與 QA harness ESLint 通過；6 個相關測試檔44項、2個隔離檢查檔27項通過。
- 同產品提交的 CI Typecheck、Changed-file ESLint、Targeted tests 通過；Full Vitest baseline 仍在執行，沒有稱為全綠。Workers Builds 依使用者指示跳過，保留失敗狀態。
- 隔離 Vercel deployment `dpl_BEHigvWD7bbCpEMYWFtwTNGPwmgF` READY、target=Preview，精確分支及隔離 DB guard 由測試驗證；未改正式環境。
- 預覽：https://steamfoot-booking-ejvfeemkp-rock7652-2111s-projects.vercel.app
- Draft PR：https://github.com/rock7652-beep/steamfoot-booking/pull/1386
- 證據：`artifacts/settings-outcomes-20261021/report.html`（自包含圖文）、`results.json`、`rwd-open-results.json`、執行紀錄與截圖。

本批沒有登入後的真實資料庫寫入驗收，亦未恢復暫用帳號。僅曾唯讀核對既有隔離測試店與已停用QA帳號；沒有變更帳號、密碼或店家資料。若接續驗證登入後資料回讀與還原，須另列為整合驗收，不能以本輪合成結果替代。
