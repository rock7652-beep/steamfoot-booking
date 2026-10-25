# 全站預約前 LINE 身分驗證

使用者決定蒸足、美業、音樂與運動採用先驗證 LINE 身分、預約時連結本店通知的流程。本次實作共用入口與引導，沒有修改正式店家的憑證、LIFF endpoint、資料庫角色、表結構、方案資格或通知開關，也未建立正式預約或外發 LINE。

## 入口與行為

- `/booking-line?store=<slug>` 僅讀取可營運、未封存店家的設定，轉到該店 canonical LIFF；不接受外部 redirect、不設定身分 cookie、不寫會員。未設定為404，不使用中央／其他店備援。
- 蒸足三店沿用現有 public-trial LIFF。公開表單新增驗證入口，既有單次entry、體驗規則與成功回條保留；歡迎訊息改用同一驗證入口，讀取店家資料失敗保留原手動恢復方式。
- 美業 `/beauty-trial/[slug]` 依實際設定提供入口；後端核對 entry 後第一步顯示已驗證。`/s/<slug>/liff/public-trial` 與 `/api/liff/public-trial-entry` 驗證設定中的Login audience、實際Beauty店ID及本店Messaging可達性，再發行原本的單次不透明entry。
- 音樂／運動沿用 COURSE 的 token exchange、已驗證會員、首次姓名／電話登記與門市核對。驗證成功開啟本店課表；首次登記也返回同店預約入口。已設定店家的登入與註冊入口共用 canonical LIFF，不另建課程公開預約權益。
- 共用OA如共用同一LIFF，網址保留 `bookingStore`；只能在同 sharedAccountKey、同實體LIFF的明確設定中切門市。不同LIFF／不同OA／未知店家拒絕，不依cookie或第一筆店家猜測。
- 本次預約入口可透過官方SDK在LINE內或一般瀏覽器驗證；其他既有會員LIFF頁的環境限制維持原狀。沒有把加入好友當作身分驗證，也不宣稱加好友即能推播。

## 預約、身分與權限邊界

美業沿用受限Beauty角色完成預約、Customer lead及單次entry消耗；新增電話的重複檢查在同一Store列鎖內。已存在但尚未驗證的電話不自動收編，BLOCKED／既有owner衝突不覆蓋。

正式Beauty runtime沒有寫入User／Account／CustomerIdentityLink的權限，因此不擴權，也不把Beauty交易改成高權限連線。預約確認提交後，由既有primary身分連線另開身分交易：必須先核對相同requestKey的BeautyCommand、entry token雜湊actor、result.groupId與店家，再驗證原秘密並解密已消耗entry，查該店預約群組的Customer。只有此鏈條完整時才能建立／沿用scope正確的Account及CustomerIdentityLink。

身分交易鎖住Customer、Account、User與本店候選identity links，僅接受ACTIVE CUSTOMER；不覆寫既有owner、跨店會員或他人provider link。新User不填全域登入phone，不以表單電話聲稱已驗證手機所有權。唯一索引衝突或任何失敗使整筆身分交易回復。

預約與身分交易是兩個確認點：身分失敗仍回傳預約成功／通知連結待完成。成功頁可用完全相同的payload/requestKey重新確認，後端只恢復原已提交命令，不再預約或重送店長通知。一般entry解析仍拒絕已使用／過期token；completed-entry模式只供經原命令actor與group核對後的內部恢復，不是新預約入口。

成功頁只依後端finalization結果顯示「LINE通知已連結」，不憑entry參數宣稱成功。提醒仍受好友／封鎖、本店通道可達性、配額、方案與通知設定控制，沒有宣稱實際送達。未驗證的訪客仍按各模組原規則使用；本次沒有授予僅憑電話自動連結既有顧客的能力。

已驗證預約的「再預約一筆」重新開啟本店LINE驗證入口，取得新的單次憑證，不重用已消耗entry；連結確認中禁止同時切換到新預約。

## 驗證與限制

相關測試、TypeScript與diff檢查通過；修改檔ESLint無錯誤，LiffShell的hasWorkAccess未使用警告在原main已存在。最終整合項數及CI結果記於PR。

- 相關測試涵蓋API audience／店家／模組、本店Messaging探測、跨店與共用OA、外部登入啟動、既有phone與blocked身分、原命令恢復、opaque secret、一般token不可重用、會員登入／登記與通知路由。
- PGlite隔離Postgres執行實際身分SQL，驗證新帳號、跨店沿用、不搶全域phone、staff／停用／owner衝突、重試、唯一scope、身分交易回復。這不代表已在正式受限角色或真人LINE跑過完整預約。
- Chromium隔離表單360×800、390×844、768×1024、1024×768、1366×900：回頂端、草稿與時段保留、表單錯誤聚焦、已連結回條、通知待確認重試通過。
- 共用入口與實際OAuth按鈕fixture 390/768/1024/1366：無橫向溢出、LINE按鈕44px、店家URL保留；OAuth、所有外部請求及後端均攔截。截圖不是實際登入或通知送達證明。
- 證據：`evidence/20261026-verified-booking-entry/`；腳本 `scripts/qa/beauty-public-booking-browser.mjs`、`scripts/qa/verified-booking-entry-browser.mjs`。型別、Lint與最終項數另記PR。
- 分支自動部署停用。未更改原STORE_LINE_CONFIG_JSON或追加JSON；銀百合與IDO通道核對仍依使用者指示稍後處理，買吉他與YoungSky繼續暫緩。
- 尚未發布。真正的LIFF suffix／Endpoint、好友與Provider、首次登記及實體iPhone LINE容器，仍需以指定測試身分驗收；不以fixture或READY取代。
