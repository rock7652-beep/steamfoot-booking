# 首家課程店 LIFF 交付盤點與開通清單

狀態：**初步盤點已完成；首家店 LIFF 完整交付尚未通過**。2026-09-18，PR #1022；沿用功能版本 6ba449db。只查隔離庫與既有程式，未更動官方帳號、通道、金鑰、資料庫或正式客戶店；未發送任何新訊息。

## 1. 已支援與必要缺口

|範圍|現有能力／來源|交付缺口|
|---|---|---|
|每店入口|Store.liffId、store-resolver；COURSE 無設定時提供同店網頁入口，不借用其他店 LIFF|填入 LIFF ID 不代表其 endpoint、Login channel 或 Messaging API 已相容；須逐店核對 console|
|LIFF 登入|api/liff/exchange 使用中央 Login channel；verify-id-token 驗證 LINE 官方結果、issuer、audience、期限|尚非任意店家 Login channel 通用支援。不同 channel token 目前會被拒絕；不得為了開通而停用 audience 檢查|
|會員身分|驗證 LINE Account 後依本店會員關係查詢；course-line-onboarding 原子建立，衝突拒絕；course-access 再核對 storeId／模組／有效身分|獨立 Provider 的 LINE subject 不能直接合併成中央身分，也不能把登入 ID 當成任何 OA 的可發訊 ID；跨 Provider 需既有驗證連結或另行適配|
|教練|固定帳號與本店 StaffMemberLink、啟用狀態及工作權限；非教練不出現工作入口|已驗證一般功能；首測實際 LINE 教練／兼會員與停用仍須本次實機交付確認|
|發訊通道|line-config 現有店家 token/secret 對應固定三家蒸足；另有蒸管家中央 bot。verified-reminder-line-route 先查收件人相容性，失敗阻擋|沒有任意新店 OA 設定的通用交付路徑；本店獨立 bot 與中央 bot 不能當作同一承諾。先確定首店實際 Provider/通道與發送者，沿用架構適配|
|通知事件與去重|course-reminders 限 COURSE、RESERVED、未取消課次，store lock／事件 ID／LINE retry key；店別與對象檢查|本輪非外發測試通過；真實事件觸發、Flex、按鈕及重送保護尚須固定對象授權後實機驗收|
|深層連結|課程通知使用本店 slug、日期、月份及 bookings 模式，Flex 有會員專區按鈕|目前生成同店網頁連結，不能直接宣稱是已驗收的 LIFF 深層入口。固定 host、登入後保留日期／店別、LINE 開啟方式均須補驗，必要時用既有 LIFF 路由適配|
|試用起算|single-store-trial 有 30 天、今日開通、人員最多 3 位、鎖及操作紀錄；COURSE 建店 action 目前立即呼叫|與本次「LIFF 驗收可用後才起算」不同。需將準備與開通分開，確定交付版本後沿用服務起算；不得重設既有 A／B 或原客戶期限。起算必須有權限、去重與稽核，不能靠改文案完成|
|既有額度|完整單店功能與方案額度分開；不含金流申請／串接|目前另保留 100 顧客／每月 100 預約及通知用量限制，未擅自解除；交付須說明|

LINE 官方說明：同一 Provider 下，不同 Login／Messaging channel 對同一人的 user ID 相同；不同 Provider 不同，不能用來直接識別同一人。即使同 Provider，同一身分仍不等於本店授權。[LINE Developers：Console overview](https://developers.line.biz/en/docs/line-developers-console/overview/)。系統必須同時驗證 token 的 channel 與本店會員／教練權限，不能以入口 URL 或 LIFF ID 代替。

## 2. 隔離店設定盤點

唯讀確認 Store 欄位，**不把空 DB 欄位誤報成部署環境一定沒有 fallback**，也未讀取／輸出金鑰。

- 五家 COURSE 店：僅原 0916 店有 DB LIFF ID；另外四家（含新 A／B）沒有。五家均無本店 Messaging destination。
- SPA：既有 module QA 店有 DB LIFF ID；其他三家沒有，四家都沒有 DB Messaging destination。
- Steamfoot：五家皆未填 DB LIFF；其中台中有 DB Messaging destination。既有程式另有三店中央 LIFF mapping、環境設定及本店訊息通道，不據 DB 空值否定既有服务。
- 原 0916 實機會員登入、Logo、四分頁成功及三則純文字收訊沿用既有證據；這只證明既有隔離中央串接，不是新店自己的 OA 已接通。
- LINE console 的 Provider 歸屬、角色權限、OA 既有 webhook／rich menu／其他系統依賴，目前尚未核對，不推測為可改。

## 3. 固定試用入口與版本方案（未執行）

首店先用專用、固定的試用 host；每店維持 `/s/<slug>` 店別與現有 LIFF 前台，不另建前台。不要交付目前會隨分支推送更新的工程 alias。

試用 host 應固定指向通過驗收的部署版本，由受控發布才更新。LIFF endpoint、登入 callback、通知 base URL、cookie 與返回網址統一核對該 host；不能只把入口綁固定域名，通知卻指向每日產生的 VERCEL_URL。現在 deriveBaseUrl 優先 NEXTAUTH_URL、再用 VERCEL_URL，需在專用試用環境驗證設定與來源約束。

**固定部署仍不足以固定資料行為**：若共用工程測試 DB，後續遷移仍會影響試用。交付環境應隔離於日常工程遷移，或有明確凍結及相容升級規則、備份與回復流程。此項尚未配置，不能宣稱已有獨立穩定試用站；新資料庫／新遷移及官方 LINE 設定變更先列明目標與影響，再依授權執行。

## 4. 第一家店最少資料與授權（一次收齊）

1. 首店名稱、負責人、店長登入信箱、預計交付日；確認現有官方 LINE 是否可用於試用。
2. OA 名稱／Basic ID、LINE Developers Provider ID、Login channel ID、Messaging API channel ID、既有 LIFF ID／endpoint（如有）。這些識別資料可提供；密碼、access token、channel secret 不貼對話或 PR。
3. 有權操作的 OA 與 Developers 管理者，能否登入 console 協助唯讀核對或授予必要角色；後續變更另列清單供確認。目前不要求改 webhook、rich menu、關聯 OA 或既有 callback。
4. 既有服務依賴：是否已有機器人／預約系統、webhook、選單與登入；確認課程訊息要由店家 OA 還是蒸管家 OA 發送。若 Provider 不同，先確認驗證連結方式，不搬移通道或覆蓋綁定。
5. 指定測試店長、教練、學員（可有兼會員）、可接收測試訊息的人。收到資料後另提供**原文／Flex 預覽、指定收件人、確切則數與事件觸發方式**，獲准才外發；不能沿用已用完的三則額度。
6. 固定試用網址的管理權／可使用域名及預期部署隔離方式。正式發布和正式建店不在現有授權內。

## 5. 每店可重複開通清單

- [ ] 唯讀盤點 OA／Provider／兩類 channel／LIFF／既有系統依賴，確認帳號管理者。
- [ ] 固定試用部署、資料環境及 base URL；備份與回復方式可操作。
- [ ] 準備 COURSE 店、店長、教練／會員關係與初始設定；尚未交付不得開始消耗 30 天。
- [ ] 依核准清單接 LIFF endpoint 與通道；保留原服務，不自動改 OA webhook／rich menu。
- [ ] LINE 學員登入／本店會員核對；教練僅本店工作，兼會員切換；錯店、錯 channel、停用與未連結均拒絕未授權操作。
- [ ] 本店購買→核帳→發卡→預約／代約→逐人取消→出席→更正；沿用未受影響核心交易證據，補驗 LINE 身分與返回路徑。
- [ ] 授權對象的真實事件→Flex→按鈕→正確店別、日期及登入狀態；再次觸發不重複；外發紀錄與實機接收分別記錄。
- [ ] 蒸足／SPA 受影響部分回歸；跨店資料、權限、健康不得互通。
- [ ] 確認入口可用後，由有權限者啟動一次 30 天試用並交付起迄日；人員上限 3 位；不含金流申請與串接。
- [ ] 首家通過後才按相同清單開其餘 4–5 家，不批次複用 LIFF／收件人／會員關係。

## 6. 本次自主驗證與正式發布前條件

非外發測試：LIFF exchange、ID token、課程 LINE onboarding／access、提醒／合併去重／cron／到期／餘額、trial service、store presentation 共 11 檔 122 測試通過；通知通道路由另 2 檔 9 測試通過。合計 **13 檔 131 測試通過**，屬程式測試，不替代實機交付。

沿用 `course-new-store-trial-20260918.md` 的新店交易、角色與雙店隔離，以及 `course-module-isolation-audit-20260918.md` 的蒸足／SPA 回歸。已接收三則純文字不重送；本次未呼叫發送引擎或開啟外發開關。

正式發布前仍需：上述首店 LIFF 驗收通過、試用延後起算實作與測試、固定試用環境配置、最新遷移差異／順序／備份還原及前向修復核准、共用相容性結果、最新 CI（Cloudflare 仍明列豁免）及使用者最終發布同意。會員自助體驗仍維持待決策／店長建立，不擴張範圍。

結論：可進入首家店資料與通道核對；**尚不可宣稱一家已可直接交付 LIFF 試用**。本文件是首輪盤點交付，不代表工程收尾完成。
