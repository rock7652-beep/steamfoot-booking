# 官網文案更新驗收

基準：6da6eb2a。需求來源：本次對話最後確認的模組範圍、方案勾選及年繳規則。
範圍：官網首頁產業卡片、功能介紹、美業介紹、方案比較、加購說明，以及共用方案文字。
僅本機修改，未 push、建 PR、部署、變更訂閱或正式資料。沒有恢復任何通知。Cloudflare 不涉及本次本機文案及靜態驗收。

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
