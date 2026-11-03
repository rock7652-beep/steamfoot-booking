# 公開體驗表單正式發布紀錄

使用者先確認運動／美業採共用版型、日後可補各店照片，並授權正式上線；暫停後再要求一起完成銀百合表單並提供網址。本輪繼續完成這份已審閱的共用表單，不另行變更會員權益、營運開關、排課或 LINE 圖文選單。

## 發布前核對

- 正式專案：Vercel `steamfoot-booking` / `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`，team `team_IAPnhzLHM4x540wiXg3lTyS9`；資料庫 `qijlnhtpbintanzpxkvf`。
- 整合基底為最新正式 main `d2358ffae72c8903f030e174321976780e4cf9f3`，保留期間已發布的會員頂列、切店及載入改善。
- 既有正式入口回應 307，銀百合圖文選單網址為 `https://liff.line.me/2010761154-JHgpFEF0/public-trial?bookingStore=silverlily`。
- 正式資料唯讀確認：銀百合 `store-silverlily`，COURSE、business.fitness ENABLED、TRIAL、未封存、trialEnabled=true、預設體驗價499。selfBookingEnabled=false、assignedSchedulingEnabled=true；未來體驗課0堂。不得用現有指定學員課填補公開課。
- 已向使用者詢問體驗課程、時段與名額。未有資料前保留「沒有開放預約的體驗課程」狀態，不造課或打開開關。
- 10檔／96項目標測試通過，TypeScript及修改檔 lint 驗證。視覺證據來自先前合成資料隔離驗收，不代表正式已建立預約。

## 範圍與限制

發布程式與共用頁面，不執行遷移、不解密或改寫通道金鑰、不提交真實預約、不外發 LINE 訊息。透過現有正式 main 建置流程的唯讀 preflight 驗證環境；分支自動部署關閉。

部署結果與正式頁面唯讀驗證於完成後追加。完整隔離互動預覽與45張截圖保留於本次工作區；Git 記錄保留 QA 腳本和可重現測試。
