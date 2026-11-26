# 本人預約唯讀工具：隔離驗收契約

沿用 PR #1596、既有會員登入與「我的預約」入口，新增 `my_bookings` 唯讀工具。僅指定 AI Preview、合成蒸足及兩個合成 CUSTOMER 帳號可人工驗收；店長不能挑顧客代查。知識 Provider 工具仍關閉，不接真實通路或自動模型規劃，不建立／改期／取消預約，也不讀方案餘額或財務資料。

## 身分與既有服務

共用 `getCanonicalCustomerForSession` 新增 opt-in `confirmedOnly`，預設行為不變。新模式先讀目前 User.status／updatedAt，再沿用 `resolveCentralMemberCustomerForStore` 的確認關係：已驗證身分連結或原有 User–Customer 關係，同店、未合併、無多重顧客衝突，並尊重已核准解除關係。沒有關係或依賴失敗時不退回 Email／電話比對，不呼叫會自動補綁的聯絡資料 resolver。

在原 LIFF 本人預約 reader 增加 `listConfirmedMyBookings`，保留原 `readFetchLiffBookings` 及既有 listBookings 行為。新 reader 只接受有效日期與頁碼；CUSTOMER session 與確認後的 storeId／customerId 由後端取得，不能傳入顧客或店家 ID。每頁 25 筆、最多第 1,000 頁，以時段及 id 穩定排序；同一 RepeatableRead 讀取交易取當頁與總數，交易內不呼叫另需連線的權限 helper。

查詢後重查會員關係與帳號版本，變更則整個結果不交付。工具另重查產業、AI 權益及目前 session scope。工作區 proof 綁定 store、User、已確認 Customer 與 User.updatedAt；不能把 A 的 proof 搬到 B 的登入工作階段。工具註冊在共用 AiToolRegistry，固定 READ_ONLY、STEAMFOOT、TEST，不接受模型或前端指定 scope。

## 最少資料與介面

結果只有日期、時段、人數、預約狀態、分頁與查詢時間。內部身分 metadata 不越過工具邊界；姓名、電話、Email、booking ID、notes、服務備註、錢包與金額都不回傳。沒有預約與「身分未確認／無權限／資料庫讀取失敗」分開處理，失敗不能當成空清單。

既有合成會員「我的預約」頁新增收合的本人查詢測試列，不新增選單或永久營運入口。共同 panel reader、TTL 0；GET `/api/ai/member-bookings` 強制 dynamic、private/no-store、Vary Cookie，範圍參數嚴格 schema。日期更換清掉舊結果，分頁錯誤保留目標頁以便重試，晚到的舊日期／舊會員回應丟棄。SSR 使用伺服器格式化台灣時間。既有會員頁與正式環境不開啟此測試列。

會員流程沿用 CUSTOMER session 與確認關係授權，沒有把員工 plans.edit 權限套到會員，也沒有 staff impersonation。會員前台不新增操作指南；後台共用 AI 指南僅補上此功能的隔離範圍與店長不能代查的說明。

## 隔離資料與收尾

`preview-member-bookings.sql` 只在 steamfoot-preview 準備三個全新合成帳號／Customer、兩筆合成蒸足預約。外店只提供身分對照，不把美業預約塞進蒸足表。預約採店員代建類型，沿用原 trigger 的跳過通知規則，不停用模組防火牆或通知 trigger；沒有財務、付款或真實訊息。

三個帳號初始 SUSPENDED、沒有密碼，驗收時才設定暫存隨機密碼及 ACTIVE。三條 SELECT policy 僅限指定合成 User／Customer／解除關係查核；既有 Booking policy 仍只限合成蒸足。不授任何應用程式商業寫入權限。新工具仍需依 session 添加會員條件，不能把共用 server DB role 的列權限誤當成顧客本人授權。

收尾清除暫存密碼並將測試帳號 SUSPENDED；新工具與本測試入口每次讀取都檢查目前狀態，舊 CUSTOMER JWT 不能繼續查此工具。不宣稱全站既有 CUSTOMER JWT 具備員工 session stamp 的全域撤銷機制。保留合成資料及歷史稽核，不做不可逆刪除。DB 密碼、connection limit 8、嚴格 TLS、Production、真實外發及 AI 總停止不變。

尚未驗真實 LINE／LIFF 身分與真機、其他產業本人 adapter、方案權益或預約寫入；不等於完整 Phase 3。精確版本、測試結果、隔離資料前後值及清理以驗收紀錄為準。
