# 官網文案更新驗收

基準：6da6eb2a。需求來源：本次對話最後確認的模組範圍、方案勾選及年繳規則。
範圍：官網首頁產業卡片、功能介紹、美業介紹、方案比較、加購說明，以及共用方案文字。
初次本機驗收時尚未 push、建 PR 或部署；後續審查與獨立靜態部署紀錄見文末。未變更訂閱或正式資料。沒有恢復任何通知。Cloudflare 不涉及本次本機文案及靜態驗收。

## 已完成

- 美業模組圖示依最新確認改為皇冠；卡片及介紹頁導覽依序為時段預約、美業模組、運動課程、音樂課程。
- 美業模組與時段、運動、音樂並列；涵蓋美容、美體、美甲、美睫、按摩、SPA，統一使用「服務人員」。
- 美業「了解更多」連至新頁 `/pricing/features/beauty`，並加入 canonical 與 sitemap 清單。
- 加購商品包含下午茶、輔銷品等商品；加做項目獨立列出。兩項皆列入日常加購並有完整功能介紹及示意。
- 加購商品：基本版／專業版加購，展店版 ✓。加做項目：三版加購。
- 兩項不占既有免費任選名額；每項年繳 NT$6,000，一次繳清，換算 NT$500／月；依既有活動期限，年繳送 2 個月，共 14 個月。
- 更正加購區月費說明，金額是年繳總額除以 12，贈送月份另計。

## 本機驗證

- 修改的 TS/TSX 檔 ESLint 通過。
- 既有 public-marketing-copy、public-pricing-offer、pricing-plan-copy、marketing-seo、marketing-routing：5 個測試檔、76 項通過。
- 使用實際 React 頁面 renderToStaticMarkup 產生靜態預覽；首頁使用既有公開統計快照，沒有存取資料庫。
- Chromium 模擬 360、390、768、1024、1366px，四頁共 20 組；HTTP 200、無整頁水平溢出。
- 驗證兩項方案格值、日常加購年費、新功能錨點與美業連結，展開新功能情境。
- `results.json` 保存逐頁結果，PNG 保存各尺寸截圖。
- 全專案 TypeScript 檢查達到預設約 4 GB heap 上限而中止；不能標為全專案通過。限定本次修改檔案與其匯入依賴的 TypeScript 檢查已通過（tsc --project /tmp/steamfoot-marketing-tsconfig.json --noEmit）。

## 預覽與限制

預覽在 `preview/`，可從專案根目錄啟動：

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory artifacts/marketing-copy-20261104/preview
```

首頁 `/`、方案 `/pricing/`、功能 `/pricing/features/`、美業 `/pricing/features/beauty/`。
這是靜態 SSR fixture，非 Next.js 部署；沒有 hydration，未驗手機選單、即時倒數或其他 client 互動。Next 圖片最佳化路徑及部分既有資產未複製，不代表正式資產失效。僅檢查本次新連結與錨點，非全站連結稽核。

未驗正式網路路由、Safari／實體裝置及實際訂閱／結帳；不將靜態官網驗收當成後台權益已開通。未更改功能資格、HQ 開關或既有訂閱期限。
操作情境採 08 的窄版可讀性；本次沒有會員搜尋、登入切換、資料寫入、交易或業務面板，因此 01–07、09–10 的動態業務案例不適用。

下一步：使用者確認文案及預覽後，再另行安排發布。


## 線上靜態預覽與 CI 更新

- 審查 PR：https://github.com/rock7652-beep/steamfoot-booking/pull/1514（未合併）。
- 文案來源 commit：1d65756ff4f325bca8186fbe2cc5b4c35b15c6ed。
- 獨立預覽專案：steamfoot-marketing-review-20261104，prj_m8eZZ06IFS6kicRuoK2RDQPtjCj4。
- 部署：dpl_FS6UC7usKQw5uvSx67JuQMgEYMmV，狀態 READY。
- 網址：https://steamfoot-marketing-review-20261104-gxjpwcyqk.vercel.app/ 。保留 Vercel Authentication，臨時分享連結不寫入版本庫。
- Vercel 的部署 target 為此獨立靜態專案的 production，不是 steamfoot-booking 正式站；沒有連接 Git、自訂官網域名、資料庫、API、排程、訂閱或通知。
- 僅上傳既有 HTML、CSS 及四張引用的公開圖片；未上傳 package.json、應用程式碼或任何環境檔，install/build commands 為空。
- 已以帳號授權的 Vercel 讀取工具確認四個頁面 HTTP 200，含 noindex/nofollow；首頁排序與皇冠、美業適用範圍、新功能錨點與 NT$6,000 年費均已核對。
- 靜態預覽仍不包含 React hydration；僅用於文案及版面審查。完整應用的分支驗證沒有更改，原 app 預覽失敗狀態仍保留，不代表正式 Next build 通過。
- GitHub 初次 CI：全專案 Typecheck 及修改檔 ESLint 通過；targeted 與 full baseline 都只失敗同一項 public-guides sitemap 頁數預期（新增美業後 34→35）。本次同步預期頁數，並將 beauty 加入公開模組 URL 驗證。
- 初次 full baseline：16,049 passed、1 failed、261 skipped；不能宣稱全量通過。修正後本機 6 個相關測試檔共 121 項通過、測試檔 ESLint 通過；更新版遠端 CI 待確認。

## 加購功能說明定稿

- 加購商品：下午茶、輔銷品、保養品等商品，隨服務一併選購與結帳，清楚記錄商品、數量與金額。
- 加做項目：依顧客需求追加服務項目，清楚記錄本次加做內容與金額，方便現場交接與結帳核對。
- 同步功能介紹、日常加購列表與靜態文案預覽；方案勾選、年費及贈送月份沿用已確認規則。
