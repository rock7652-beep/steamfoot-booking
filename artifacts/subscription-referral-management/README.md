# 推薦活動管理介面驗證

2026-11-04。使用實際 HQ／店家呈現元件、合成資料，無資料庫及登入 session。預覽表單不儲存或處理扣款。

- 360、390、768、1024、1366px：總部、我的推薦與實際申請 HTML 均無水平溢出。
- 申請網址帶碼，確認框預設不勾選；未確認不可提交，確認後保留正確碼與確認值。
- 活動不可用仍保留候選碼；到期帳戶保留獎勵且無發放按鈕。
- 共 18 項檢查，詳見 browser-results.json 與同目錄截圖。
- 申請 POST 僅由本機 Playwright 攔截，未外送申請、通知、金流或正式資料。
- 產生 fixture：node --import tsx scripts/qa/subscription-referral-management-preview.tsx。
- preview/hq.html、hq-expired.html、mine.html 可供靜態檢視；未 hydration，不能據此宣稱真實 server action 已驗收。apply.html 保留原申請程式，僅供隔離本機測試，不應上傳為可對外提交的預覽。

正式旗標及資料表未啟用；完整業務驗收仍須安裝審查、實際登入與總部核對扣款安排。
