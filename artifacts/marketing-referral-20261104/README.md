# 推薦活動設計預覽

需求：本次對話確認「成功推薦，雙方各獲主方案 30 天」，官網不特別區分體驗／正式身份。

實作：首頁沿用 ReferralCampaign 元件，呈現活動文案、雙方獎勵卡片、三步驟及可展開活動辦法。活動規則含付款開通滿 30 天未退款、付款前推薦歸屬、不同新客可累積、年繳優惠可併用、同一經營者及重複帳戶排除、贈送僅主方案。

狀態：這是設計與文案預覽，非可參加的推薦系統。兩個推薦入口 disabled 並明示即將開放。未建立店家訂閱推薦碼、關係綁定、獎勵台帳、排程或月繳停扣；既有 Customer 推薦與積分不適用且未變更。正式串接規格見 docs/marketing/subscription-referral-campaign.md。

檢查：修改檔 ESLint、限定修改範圍 TypeScript、既有六個行銷相關測試檔 121 項通過。Chromium 靜態 SSR fixture 實測 360／390／768／1024／1366px，無整頁溢出、兩個入口停用，活動辦法可用 Enter 展開，完整規則存在。每個尺寸各一組；不作真機、Safari、效能或正式業務驗收。

截圖為元件展示，擷取時暫將既有頁首改為非固定以避免遮擋長元件，沒有修改應用程式的頁首。活動原始碼位於 src/app/pricing/referral-campaign.tsx；首頁使用相同元件。重建靜態文案可執行：

```sh
node --import tsx scripts/qa/referral-campaign-preview.tsx
```

此次靜態產物可部署至既有獨立 review 專案。保留 Vercel 保護與 noindex；不改正式域名、應用分支檢查、資料庫或通知。靜態預覽不包含 React hydration，活動辦法使用原生 details；推薦按鈕不啟用。
