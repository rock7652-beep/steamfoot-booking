# 音樂測試站：跨分頁收款同步與部署相容收款

## 範圍

僅 feat/music-opening-state-20261007 的隔離測試站、store-lubymusic。無資料庫遷移、無正式站發布。

## 修正

- 購課／補繳透過固定 JSON 入口 `/api/music-preview/checkout`，不附 framework 的部署鎖定標頭。原頁面保留所有輸入及 requestKey，由目前部署處理；保留既有交易鎖、付款驗證及冪等檢查。
- 入口限制同來源 JSON、明確相容版本、登入與 transaction.create 權限，並要求測試店與測試資料庫 guard。購課 action 仍執行 wallet.create、折扣及排課權限檢查。
- 不相容協定拒絕送出並保留草稿；網路中斷不自動重送，不退回舊 Server Action。
- 成功購課、收款、更正／退款後發出不含個資的失效通知。營收頁接收通知、重新讀取 Server Components，保留日期與篩選；重複通知合併，背景分頁恢復時補同步。
- 客戶端同步使用同源 BroadcastChannel 與 storage event；訊息只有隨機 token，並不承載餘額或授權資料。

## 驗證方法

- 16 個測試檔、132 項測試通過；TypeScript 與新增元件 ESLint 通過。
- 線上須先開啟版本 A 的購課表單與營收分頁、保留草稿，再發布版本 B；直接從 A 表單送出購課，確認 B 的固定入口接受，營收分頁未點擊或重新整理即更新。
- 補繳後驗證未收歸零、付款列數正確、沒有重複發卡；測試退款回收額度及沖回淨額。
- 後台檢查 1366、1440、1024×768、768×1024；屬模擬 viewport，非實體 iPad。

## 相容界線

載入本次修正之前的舊 JavaScript 不會自動取得新傳輸方式，需開啟一次最新版。修正後的同協定表單可跨部署送出；若日後更改資料契約，必須保留 v1 相容處理或明確拒絕，而不是默默改寫舊資料。

Vercel 文件： https://vercel.com/docs/skew-protection （自訂 fetch 不會自動附加部署 ID）。
