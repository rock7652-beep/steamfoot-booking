# A 店前台驗收收尾

功能版本 `5fe88048`；固定原工程 preview 與 A 店，不調整首頁或後台版面。無資料遷移、正式操作或外發。

## 本次修復

1. 緊急聯絡查閱逐項顯示姓名／關係／電話缺漏，避免有姓名電話就看起來已完整。舊資料不填假值。
2. 教練工作名單原本未接上報到。現在沿用 `markCourseCoachAttendance` 及既有交易服務、固定帳號／店家／授課教練檢查，新增報到按鈕及已報到狀態。未開課時出席仍不可按，未更動時間或扣抵規則。

## 實際操作與資料核對

|項目|結果／證據|
|---|---|
|全新會話登入|兩位既有測試會員以手機／密碼重新登入A；兼任者可切會員／教練，純會員沒有工作入口；未輸出密碼|
|本人＋共卡同堂|9/21 10:00 本次隔離伸展課，未預勾本人；明確選兩位，確認保留4點；卡片remaining10、held由3到7|
|逐人取消|只取消共卡學員，確認文字指出該學員；本人仍RESERVED，共卡學員CANCELLED；容量3、有效1、剩2位；held回5，remaining仍10。前台方案可用5與後台一致|
|教練報到|教練前台自己的9/21伸展名單執行報到，原位顯示已報到・待出席；出席未到時間仍disabled|
|報到重送|從實際UI請求取得原POST，在同一授權會話重送一次，成功；資料仍RESERVED、checkedInAt有值，remaining10、held5、此預約DEBIT0|
|堂數卡|既有新堂數卡remaining4、held1、可用3未變；本輪未重複扣抵測試|
|後台核對|同堂本人有效、共卡已取消／釋放2點；名單1/3、方案可用5；前台顯示剩2位。取消紀錄保留|
|列表更新|專用測試教練名稱暫加驗收後綴，儲存後無手動reload立即出現；再次正常儲存恢復原名。缺漏欄位仍空白、不阻擋無關修改|
|教練隔離|前台只見自己伸展課，不見另一教練肌力；另一店後台拒絕沿用前批證據；角色／跨店後端17項測試補驗|
|未完成A店出席閉環|本次新課9/20、9/21尚未開始，不更動系統時間或回填課次；出席、重送不重扣及更正沿用既有證據，不能記為本次A店新交易全通過|

Chrome手機390尺寸為瀏覽器驗收，不是實體LINE／Safari／iPad。LINE通道與返回27項非外發測試、出席／更正／權限17項及固定環境preflight10項通過，不等於實機。

## LIFF 必要缺口

A店Store.liffId為null，實際 `/s/course-start-0918-a/liff` 顯示本店尚未開通LINE Mini App，未使用他店入口。網頁入口可用，不將它宣稱為LIFF成功。

已於2026/09/20使用現有Chrome登入唯讀查核：蒸管家Provider管理權有效，既有會員登入channel為Published；LIFF清單有既有隔離課程入口但無A店專屬項目。既有隔離課程LIFF使用Full、openid/profile、Add friend Off；endpoint仍指向其原店，不變更。已提出只新增A專屬LIFF與只登錄A隔離Store.liffId的授權，尚未核准即不執行。精確管理頁／channel與端點已私下列予使用者，無需重複登入、不索取密鑰。此開通只驗證中央既有架構的A店入口，不代表首店自己的獨立通道已驗收。

真實事件／Flex／返回未測；收件人、卡片全文、事件、則數需綁定確切通道後集中核准，現階段不外發、既有三則不重送。

## 9/30

網頁核心及本次報到缺口已補；A店新課開課後仍需完成點／堂出席與更正核對。9/22前需具備首店通道設定條件與固定試用環境決策；9/25首店可驗、9/26–27實機，否則5–6店9/30同時LIFF可用有延誤風險。

固定環境沿用 `course-fixed-trial-environment-20260918.md`：專用Vercel project＋獨立Supabase project，固定alias僅更新至驗收SHA，停用自動部署；不能用工程庫作獨立試用庫。初始化SQL／資料範圍須另外審查。2026/09/19重查官方：既有付費Supabase組織每新增專案至少US$10/月compute，額外用量另計；Vercel既有team用量另計，不保證零增費。新Pro組織／team才需重新核准基本費。不得未核准就建立資源或啟用試用。

來源：https://supabase.com/docs/guides/platform/your-monthly-invoice 、https://vercel.com/pricing 。Cloudflare維持豁免，不記通過。PR維持Draft。

功能版本CI：Changed-file ESLint、Typecheck、Full Vitest、Targeted tests、postgres-integration與Vercel均通過；Cloudflare失敗按豁免記錄。部署 dpl_8p9DVaTat5zm8pe5R3A14tAVMyL1，固定alias實頁驗收。
