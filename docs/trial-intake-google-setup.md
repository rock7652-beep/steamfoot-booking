# 體驗申請 Email 與 Google Sheet

通知收件人固定為 **steambutler500@gmail.com**。LINE Developers 授權維持 **rock7652@gmail.com**，兩者分開。

已建立總表：https://docs.google.com/spreadsheets/d/1EANSmhtID5pPWj8_OSUvcH-1TprClsCheFDPeW9td5k/edit

## 一次性啟用

1. 以持有總表編輯權限的 Google 帳號開啟總表，點「擴充功能 → Apps Script」，貼入 `scripts/trial-intake-apps-script.gs` 後儲存。
2. 選 `setupIntake` 執行一次，Google 會要求試算表與寄信權限。這一步設定表格並確認寄信授權，不寄測試信。授權需由帳號持有人確認。
3. 點「部署 → 新增部署 → 網頁應用程式」；執行身分選自己，存取者選所有人。此網址只接收具有伺服器密鑰的 POST，沒有公開讀取功能，試算表本身維持私人。發佈此服務前須確認權限範圍。
4. 將部署的 `/exec` URL 設為網站伺服器 `TRIAL_INTAKE_WEBHOOK_URL`；將 Apps Script「專案設定 → 指令碼屬性」的 `INTAKE_SECRET` 存到 `TRIAL_INTAKE_WEBHOOK_SECRET`。密鑰不貼在聊天、申請表或 GitHub。另設 `TRIAL_INTAKE_SHEET_ID=1EANSmhtID5pPWj8_OSUvcH-1TprClsCheFDPeW9td5k`。
5. 網站需有有效 `NEXTAUTH_URL`。重新部署後，用虛構資料確認 Sheet 寫入、新申請 Email 與同列補件 Email，再開放店家使用。

Google Drive 連接器可建立總表，但不能代替網站長期串接的授權，也未提供 Apps Script 部署或 Vercel 環境變數寫入。本次程式已備妥，尚未部署 Google 接收服務、設定密鑰或實際寄送通知。

## 收件行為

- Google 接收服務先存 Sheet 再寄通知信；信內直接列店名、類型、聯絡人、電話、Email、待補項目與總表連結。
- 依申請編號更新原列，較舊版本不覆蓋新補件；保留 Sheet 中人工填寫的處理狀態與備註。Sheet 狀態不回寫總部，兩者不是雙向同步。
- 每個版本記錄已通知版本，一般重試不重複寄信。若寄信已成功、但記錄已通知版本前 Google 中斷，重試可能重寄；不能承諾 exactly-once 投遞。
- 邀請網址、補件 token 與密鑰不進 Sheet 或 Email，保留在受保護的總部紀錄。
- 開啟 Google webhook 後，不會在 Google 寄信失敗時再用 Resend 重寄，避免雙重通知。沒有設定 webhook 時，沿用 Resend 的 Email 功能，**不代表 Sheet 已同步**。
- Preview 延續全站第三方隔離：不寄真信、不寫入正式 Sheet。隔離測試不等於收件信箱已實際收到。
- Google 寄信額度耗盡或暫時失敗時，網站收件仍成功，通知標為失敗供重試；已加每 5 分鐘自動重試，僅處理至少 10 分鐘未更新的失敗／待送／卡住紀錄，每輪最多 3 件，並依修訂避免覆寫新補件。需確認正式 CRON_SECRET 與 Vercel 排程生效。

## 上線前驗收

- 確認總表擁有者及使用的授權帳號；若要換所有權，另行確認，不公開分享總表。
- Google 服務啟用後，做受控測試，確認實際收到新申請與補件兩封 Email。
- 正式開放前需確認自動重試實際運行，並驗證 Google 寄信額度。長期 Google 授權失效時通知仍無法送達，需有維運監控；本輪未建立第二通知管道。
- 本分支未合併正式站，未修改正式資料庫；教學截圖缺口延續 `docs/trial-application-release.md` 清單。
