# 官網發布前的本機驗證

本目錄驗證 PR #1514 實際 Next.js production build 的公開頁面，非靜態 fixture；不代表正式部署或活動啟用。

重現方式（須無 .env 系列正式設定）：

```sh
node scripts/qa/marketing-publication-local.mjs --build
node scripts/qa/marketing-publication-local.mjs --serve
# 開啟 http://localhost:3117；NextURL 將 loopback 正規化為 localhost
```

專用本機模式只接受固定合成連線／auth 設定，不繼承外部憑證，不允許 hosted provider 設定，禁止資料庫與 migration，公開入口以外回 404，所有寫入回 405。未略過 TypeScript 或更動 Vercel／Cloudflare 的既有准入規則。

完整 production build 與 TypeScript 檢查通過；相關回歸 613 項與本機隔離／申請表 621 項通過。

瀏覽器測試已通過 25 組，涵蓋 360、390、768、1024、1366 像素的首頁、收費、功能說明、美業頁與帶推薦碼的申請表；結果見 browser-results.json，全部 HTTP 200、無頁面水平溢出及 JavaScript pageerror。截圖僅供對應版本的視覺驗收，不能取代登入後的店家／總部交易驗證。

正式五表安裝的獨立證據在 ../subscription-referral-management/private-installation-apply-success.json。活動保持關閉；未在正式帳戶發獎、改訂閱或執行扣款。
