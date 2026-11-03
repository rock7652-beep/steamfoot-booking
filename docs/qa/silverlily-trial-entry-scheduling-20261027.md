# 銀百合體驗入口與排課模式修正

## 問題與證據

使用者回報含 `/public-trial?bookingStore=silverlily` 的 LIFF 連結在手機仍開啟會員中心，並提供新增排課仍顯示「開放選課」的截圖。既有正式唯讀設定已確認 selfBookingEnabled=false、assignedSchedulingEnabled=true，本次不改開關。

LINE 官方 Opening a LIFF app 文件說明：LIFF URL 的額外路徑／查詢先包在註冊 Endpoint 的 `liff.state`，SDK 初始化後才走 secondary redirect。原 root page 一律建立會員 LiffShell，可能先進行會員交換與課程前台導向，沒有在 primary endpoint 選擇體驗初始化流程。先前僅驗證直接 `/liff/public-trial` HTTP 回應，不能等同 LINE 內的完整開啟驗收。

排課表單本身已依 schedulingModes 過濾模式，但 CourseWorkspace 的原生 SportsScheduleDialog 分支漏傳該 prop；另一個排課分支已有傳入。漏傳後使用舊預設，導致關閉的選項仍顯示。

## 修正

- Root LIFF page 先讀取 `liff.state`，辨識唯一的 public-trial 目的後，沿用現有 PublicTrialLiffPage / bridge 初始化，避免掛載會員 shell。一般會員及原深層連結保留。
- 僅解析體驗意圖與單一 bookingStore；外部 URL、重複／非法 store 與重複 state 拒絕。門市、共享 OA、Login audience 及憑證驗證仍由現有 resolver / endpoint 執行，不用 state 授予會員權限。
- 原生排課視窗補傳 activeSchedulingModes，沿用現有新鮮課表設定與後端模式 guard。關閉開放選課時只顯示指定學員、隱藏容量／候補；兩者都關閉仍阻擋新增；保留時間與學員草稿。

## 驗證

8檔／66項：primary-state root 實際 dispatch、一般會員保留、格式與跨店解析、原生父視窗的 props 傳遞、排課模式切換與後端檢查相關回歸。TypeScript、修改檔 ESLint及diff檢查。

`scripts/qa/sports-scheduling-mode-entry-browser.mjs` 以真實 SportsScheduleFields 與合成資料，在390、768、1024、1366寬度驗證開放選課不可見、無容量欄、沒有橫向溢出；動態切換模式後保留15:30時間，全部關閉不能送出。封鎖網路與所有真實寫入；截圖在本次工作區 `/workspace/reports/silverlily-entry-mode-fix-20261027/`，不是正式後台登入驗收。

## 發布範圍與限制

延續使用者已授權的正式發布與後續修正要求，發布兩項修復；不改資料庫、不變更金鑰／LIFF設定、不建立課程或預約、不發送訊息。分支自動部署停用。

正式體驗網頁：`https://www.steamfoot.com/sports-trial/silverlily`。LIFF 圖文選單入口仍使用既有本店ID及 `/public-trial?bookingStore=silverlily`，但先完成 primary-state routing 修復才要求再驗。發布後可唯讀確認 root primary state 回應體驗 bridge；真人LINE登入／最終預約仍需使用者手機驗證，不用HTTP或隔離fixture冒充驗收。銀百合尚無公開體驗課，關閉開放選課的營運設定保持不變。
