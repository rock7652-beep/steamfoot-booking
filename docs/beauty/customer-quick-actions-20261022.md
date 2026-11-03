# 美業顧客端快捷操作驗證

支線 `preview/beauty-ui-alignment-20261021`；程式 `031953807b47812d3240013ece86bb36abc2279e`。本輪僅隔離 Preview 與 steamfoot-preview 測試店，無 migration、PR、正式套用。

## 變更

- 首頁操作靠右；店家資訊列統一留白、標題與單一箭頭。
- 顧客取消只確認，不填原因；後端產生「顧客自行取消」稽核原因。其他角色及狀態更正仍維持原因要求、權限與交易規則。
- 改期進入即載入原日期時段，改日期自動重查，以上午／下午／晚上按鈕選時間；顯示完整起迄。過期回應忽略，送出仍由後端重驗資源與 revision，失敗重試沿用 request key。

## 證據

- 67 個測試檔、506 項通過；TypeScript、ESLint、diff check 通過。
- `03c2d34b` Preview 完成 production build 及真實三端驗證，部署 `dpl_BeLaxKnbXzy9mabzZ5CbtrY8oEk9`。目視發現店家資訊共用樣式與自訂箭頭重複，後續 CSS 修正另部署，沒有重複交易。
- 真實顧客將 11/3 本人做臉改至 11/6 14:30–15:30，再雙擊確認取消；11/3 同行者按摩仍 RESERVED、時間不變。主卡 remaining 2、held 由 1 降為 0，沒有新增扣次帳本；STATUS 紀錄原因為後端產生的「顧客自行取消」。
- 改期與取消驗 360／390／768／1024 Chromium viewport，無整頁橫向溢出。店長班表與技師我的工作入口通過，無 page error。
- 最終 Preview READY，production build 完成：`dpl_3KrcNNkbdavXZWiKWoizbeMCJ61u`，網址 https://steamfoot-booking-dp3c38kfg-rock7652-2111s-projects.vercel.app 。

LINE 仍關閉，憑證空白；正式部署唯讀核對未變。實體手機 Safari／Chrome 與店家簽收仍待完成，viewport 驗證不等於實機驗收。截圖與 JSON 位於同名 evidence 目錄；不保存憑證或部署存取 token。

最後 CSS 部署首次唯讀測試曾在 BUILDING 頁面等待登入欄位而逾時，未執行交易；待 READY 後重新唯讀驗證，不把該次視為通過。

最終 READY 版本重新通過首頁靠右、店家資訊單一箭頭（含 computed pseudo content 檢查）、店長班表及技師工作入口；無 page error。目視最終 390 畫面確認單一箭頭。
