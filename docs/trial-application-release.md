# 體驗版申請與資料指南

- 申請入口：`/pricing/trial`；官網各體驗 CTA 已改指向此頁。
- 總部入口：`/hq/dashboard/trial-applications`，ADMIN + `staff.manage`，店舖管理可進入。
- 申請先收基本資訊，LINE 可後補；每階段與最後總清單分別顯示進度。
- 本機暫存保留未完成欄位。補件連結使用 URL fragment；伺服器只存 token hash，讀取與修改必須驗證 token；修訂防止舊頁覆寫。
- 邀請資料僅總部或持有專屬補件連結者可讀。Supabase Data API 的 anon/authenticated 權限已撤銷，RLS 已開啟。
- 通知寄到 rock7652@gmail.com，只包含登入總部查看的連結，不含邀請網址或補件 token。
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
- 已在 Vercel 預覽以虛構資料走完瀏覽器→API→Prisma→獨立資料庫收件與補件，確認同一申請編號、通知 DISABLED。總部已登入操作與真實通知仍需上線前驗收。
