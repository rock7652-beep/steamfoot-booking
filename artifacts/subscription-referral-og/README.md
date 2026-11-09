# 申請頁品牌分享卡

使用者核准補齊正式申請入口與品牌分享卡，先驗證、不公開上線。應用來源 `104aa3a5f959254f94b8581a8fdff6ce9b98d84a`，PR #1514。

- public/pricing/apply.html新增Open Graph及Twitter靜態標題、說明、網址、圖片、MIME、尺寸及alt；爬蟲不必執行JavaScript即可讀取。
- 圖片 public/pricing/images/referral-share-v1.png：1200×630 PNG，約87KB；使用現有Logo、深綠／金色品牌色、推薦優惠與適用條件，不含個人資料、推薦碼或秘密。
- 申請頁也供一般需求／體驗使用，分享標題為「蒸管家｜朋友推薦與體驗申請」；優惠說明限定活動開放期間、首次付費開通滿30天且未退款、核對後發放。
- canonical與OG圖片為固定www.steamfoot.com絕對網址，無私人推薦參數；瀏覽器原始ref參數及表單JS不變。
- 由scripts/generate-referral-share-image.mjs生成品牌排版圖，原Logo保持不變；重新生成需Noto Sans CJK TC字型。

本機8項分享／metadata測試、受影響檔案ESLint與完整TypeScript通過，人工檢視圖片文字、尺寸及Logo正確。只有head的meta與新圖片／生成腳本，沒有表單body、CSS、JS、旗標、資料庫、權限、扣款或通知變更。

隔離部署 `dpl_GVwESPeRStm9FJ4dZwoA3xg1iHH7` 已READY，應用及CI來源104aa3a5。CI [42006801699](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/42006801699) 的 Full Vitest baseline、Targeted tests、Typecheck、Changed-file ESLint全部成功。

`browser.json`：授權的隔離預覽中，以模擬預覽爬蟲UA facebookexternalhit/1.1讀取原始HTML，不執行該回應的JS即能取得品牌meta；不是公開LINE爬蟲驗收。透過同一測試站圖片路徑取得image/png、200回應，位元組與已提交的1200×630素材完全一致。實際開啟申請表，ref仍保留、推薦碼帶入、確認框預設未勾選。360×800／390×844／768×1024／1024×768／1366×900均無水平溢出、無pageerror。另以沒有分享存取cookie的新context確認匿名請求仍被保護。

截圖 application.png為實際申請頁、hosted-image.png為實際託管圖片；均使用合成推薦碼，沒有提交表單。可直接查看 [品牌分享卡原圖](../../public/pricing/images/referral-share-v1.png)。字型及Logo人工檢視通過；瀏覽器模擬尺寸不等於實體手機／iPad或LINE實際送訊息。

只有後續文件／證據提交，不重建相同應用；臨時分享token與密碼不提交。

Vercel保護保持啟用，不能以授權測試通過宣稱匿名LINE已能顯示品牌卡；正式域名上的新圖片及meta仍待正式部署，屆時需另驗實際LINE抓取與快取。未傳送LINE訊息或提交申請。
