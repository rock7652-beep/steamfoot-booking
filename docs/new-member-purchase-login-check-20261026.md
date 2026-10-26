# 蒸足開卡後會員登入確認

## 行為

體驗建檔或 LINE 通知綁定不表示會員登入就緒。蒸足顧客詳情、預約逐人購買、單次轉購方案及待確認付款入帳完成後，保留開卡結果，在原容器檢查登入。尚待入帳不顯示開卡完成，入帳後才提供確認。

沿用 StoreMemberConnectionPanel、loadMemberConnectionAction、approveLoginRecoveryAction，沒有另造核准機制。沒有申請時請顧客開啟本店會員中心提交資料，店長按重新檢查；有申請時核對本人及同一組確認碼，權限與交易檢查沿用既有後端。核准後仍等待顧客登入，不宣稱 session 成功。完成或關閉結果後才執行原成功回呼，避免收合吞掉待辦；不再次送出購買。

登入摘要只有在唯一 owner、同店 Login link 與 ACTIVE CUSTOMER Account 的 subject 一致時顯示連結就緒。通知已綁定不能推論登入。待核對與未使用授權優先呈現，回傳不包含原始 LINE subject。

## 隔離與驗證

- 分支 fix/new-member-purchase-login-check-20261026，沿用既有 module-roster-preview gate，DATABASE_URL 和 DIRECT_URL 都必須指向 steamfoot-preview；正式或其他資料庫拒絕。
- 相關 11 組 Vitest：193 項通過（登入服務、申請核准、狀態、權限、UI、隔離與購買欄位規則）。
- TypeScript noEmit 通過（本機需 6GB Node heap）；變更 TS/TSX ESLint 無錯誤，collect-single-modal 原有 4 個未使用參數警告。
- Chromium 真實 React 元件合成操作：購買一次 → 保留開卡結果 → 新申請出現 → 核准既有 action 的 request/customer/code → 等待登入 → 重讀連結就緒。檢查 1366×768、1920×1080、1024×768、768×1024、390×844、360×800、320×740，無整頁水平溢出，重新檢查控制至少 44px。
- 重跑：node scripts/qa/new-member-purchase-login-browser.mjs；QA_CHROME_EXECUTABLE、QA_FONT_FILE、PLAYWRIGHT_PATH 可指定本機 browser/font/runtime。僅合成服務回應，所有其他網路請求封鎖。

## 尚未完成的發布條件

本機合成 UI 及 mock 單元測試不能代替真正的「公開體驗建檔 → 開卡 → 門市本人核對 → 真實 LINE token 登入 → 顯示正確方案」業務驗收。隔離 Preview 建置、桌機／iPad 真正後台操作及實際 LINE 最後一段需另記證據；通過前保持 draft、不合併正式站。田小姐正式單筆核准不作本 PR 的測試資料。
