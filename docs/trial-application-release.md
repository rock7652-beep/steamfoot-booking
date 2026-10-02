# 體驗版申請與資料指南

- 申請入口：`/pricing/trial`；官網各體驗 CTA 已改指向此頁。
- 總部入口：`/hq/dashboard/trial-applications`，ADMIN + `staff.manage`，店舖管理可進入。
- 申請先收基本資訊，LINE 可後補；每階段與最後總清單分別顯示進度。
- 本機暫存保留未完成欄位。補件連結使用 URL fragment；伺服器只存 token hash，讀取與修改必須驗證 token；修訂防止舊頁覆寫。
- 邀請資料僅總部或持有專屬補件連結者可讀。Supabase Data API 的 anon/authenticated 權限已撤銷，RLS 已開啟。
- 通知寄到 steambutler500@gmail.com，包含店名、聯絡方式、缺件摘要、總表與總部連結；不含邀請網址或補件 token。LINE 管理授權仍用 rock7652@gmail.com。
- 需設定有效 RESEND_API_KEY 與已驗證 RESEND_FROM。寄送失敗不影響收件；總部可重試。
- 預覽通知停用；預覽收件僅允許既有獨立測試資料庫，不可沿用正式連線。

## 上線前與驗收

1. 先在預覽設定獨立測試 DATABASE_URL 與 DIRECT_URL，收件表已在 steamfoot-preview 建立驗證。
2. 以虛構資料測試送出、總部查看、補件同一編號、處理進度及權限拒絕。
3. 檢查桌機、iPad、手機，以及每個教學新視窗與原頁暫存。
4. 正式上線需使用本分支的 Prisma migration，確認資料庫角色、寄件網域及通知設定，再驗證一次真實收件通知。尚未合併 main，也未執行正式遷移。

## 教學素材

官方 LINE 權限、邀請、ID 與加好友，以及 LINE Developers Channel Roles 使用官方手冊真實截圖並標示位置。官方申請入口另有現場截圖。Provider 選擇、建立帳號內頁與 Google 地圖仍以短步驟與直接連結引導，尚未具備每一步的實際截图；不得稱為全部逐步圖解已完成。

## 已完成驗證

- 15 項 Vitest：基本資料先申請、未完成草稿還原、網址驗證、token、跨來源、預覽隔離、防重送、修訂競爭、通知失敗與總部狀態保留。
- ESLint、TypeScript、Next production build、Prisma schema validate 通過（大型專案本機檢查需 NODE_OPTIONS=--max-old-space-size=6144）。
- 獨立測試資料庫：migration、交易內寫入並 rollback、RLS、anon/authenticated 禁止讀取。
- 已在 Vercel 預覽以虛構資料走完瀏覽器→API→Prisma→獨立資料庫收件與補件，確認同一申請編號、通知 DISABLED。總部登入操作已完成預覽驗收；真實通知仍需上線前驗收。

### 教學圖片公開路徑修正

教學圖放在 `/pricing/trial-guides/`，沿用官網公開路由，避免未登入訪客的圖片請求被 proxy 導向門市頁。圖片載入失敗時顯示重試提示。

### 收件與通知驗收補充（2026-10-02）

- 30 項測試通過：原申請 API 15 項、通知邊界 6 項、總部操作權限／稽核／通知重試 9 項。
- 通知服務已檢查固定收件信箱、正式 HQ 連結、不附邀請憑證、預覽禁寄、寄送拒絕與網路失敗。這些是隔離測試，不能宣稱實際投遞完成。
- 新版已在瀏覽器 390px 手機及 768px 平板寬度確認教學圖片載入；尚非實體 iPad Safari 驗收。
- 未登入總部收件頁會導向 HQ 登入頁。已以 ADMIN 登入完成清單、資料展開、更新處理進度與通知重試的預覽操作驗收。
- 本機沒有可用寄信憑證；Vercel 目前工具未提供環境設定讀寫，尚無法確認已驗證寄件地址或執行真實投遞。不得改用 Gmail 手動寄信冒充系統通知，也不得解除全站 Preview 寄信隔離。
- Developers 教學補上 Send invitation；來源為既有官方角色管理文件。

#### 教學截圖待補清單

- Developers：選擇正確 Provider、Provider 的 Roles 邀請表單。
- 官方 LINE：帳號申請內頁（現有公開入口圖已具備）。
- Google 地圖：選擇門市、分享及複製連結。
- 完成／切回填寫等提示步驟不需要重複放圖；目前缺圖的操作步驟保留短文字及官方入口，不以其他畫面代替。

### HQ 收件路由修正

登入實測發現 `/hq/dashboard/trial-applications` 被共用 HQ rewrite 導向不存在的 `/dashboard/trial-applications` 而 404。已在 ADMIN 驗證後將該收件路由保留為 HQ 專用頁，不放寬登入或角色權限。新增收件頁 ADMIN pass-through／未登入／店長拒絕與 5 張圖片路由回歸檢查。6 個測試檔合計 102 項通過。

### HQ 登入後操作驗收

- 固定分支預覽網址已完成 ADMIN 登入，HQ 收件清單可查看既有虛構申請及修訂 2 的補件結果。
- 將測試申請從已收件改為設定中，資料庫與 AuditLog 已確認寫入；通知重試仍維持 Preview 停用。
- 發現 React Server Action 完成後將未受控選單 reset 為舊值，已用狀態作為進度表單 key 使儲存後顯示最新值；已在新版預覽確認更新後及重載後皆顯示待補件，資料庫狀態一致。

### 完整流程與平板收件驗收

- 第二筆虛構申請完成基本送出、未送出草稿重載保留及同編號補件，資料庫修訂為 2。
- 總部進度更新為待補件，店家收件畫面同步顯示最新進度。
- 桌機及 768px 平板寬度檢查收件明細；店名搜尋與待補件篩選均只返回符合的申請。平板驗證為瀏覽器寬度模擬，非實體 Safari。
- 本次僅更新草稿分支與預覽，沒有正式合併、正式資料庫遷移或實際寄信。

### Email 與 Sheet 收件（待一次性啟用）

已建立原生 Google Sheet，新增 Apps Script 接收服務與網站 webhook 串接。補件重設通知待送，同列更新、版本防重送、自動失敗重試均有隔離測試。Google 寄信授權、部署與伺服器環境設定尚未完成；不能宣稱已同步或實際收到 Email。詳見 `trial-intake-google-setup.md`。
