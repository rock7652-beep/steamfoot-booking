# 蒸足即時空位：隔離唯讀工具

這是 Phase 3 的第一個唯讀介接，沿用 PR #1596 與既有數位管家設定入口。僅供 `ai-preview-steamfoot` 的已授權後台人員人工觸發；不接正式客服、真實通路或模型自動規劃工具。知識 Provider 的工具仍停用，總停止與店家開關不變。人工唯讀驗收不呼叫模型，可在總停止時執行。

## 權威來源與範圍

`steam_available_slots` 註冊於共用 `AiToolRegistry`。只接受嚴格的有效日期 schema，不接受 storeId、actorId、customerId 或模組覆寫；伺服器綁定已驗證 session／目前門市／TEST 通路與權威產業模組。讀取前後重新核對 plans.edit、獨立 AI 權益與 actor/store 工作區 HMAC。既有 `fetchDaySlots` 再核對 booking.read 與指定門市讀取權限，無預設門市 fallback。

沿用同一 `fetchDaySlots(date, verifiedStoreId, {customerView:true})`，沒有另一套空位算法。新增模式僅讓後台採用更嚴格的顧客規則：門市營運狀態、特殊營業日、時段 override、預約人數、值班、開放預約時間、顧客預約期限與蒸足提前 30 分鐘截止。不能與 allowPast 補登並用。既有員工預設及顧客自助預約行為維持。

結果只投影可預約的時間與剩餘人數，捨棄已滿／已過期／停用時段，不回傳容量、已預約明細、顧客、教師、電話或內部 notes。服務失敗或不合法結果不能當成「沒有空位」。過去日期在查詢前拒絕，尚未開放／超出預約窗由原規則回傳無可預約時段。空位是查詢當時的觀察，不保留名額；未來預約仍須由原交易服務重新核對。

共用 registry 在等待 authorize 前凍結 scope 副本，避免 caller 修改原物件造成授權與執行使用不同門市。美業、運動、音樂不能套用蒸足 adapter；它們的 adapter 及會員本人預約／權益查詢尚未實作。不以合成產業選擇器取代真實模組核對。

## 介面與錯誤

原設定頁新增收合的「即時空位查詢」，僅在合成蒸足且 Store.industryModule=STEAMFOOT 顯示。日期＋查詢按鈕直接取得完整結果及伺服器格式化的台灣查詢時間，不整頁刷新、不自動查詢、不新增側欄。使用共用 usePanelReader，TTL 0、按 actor/store HMAC 隔離；每次明確查詢都重新讀取權威結果。

日期改變即移除舊結果；查詢中、空結果與讀取失敗分開呈現。中斷保留輸入並可重試。晚到的舊日期／舊工作區回應不能覆蓋目前畫面；收合重開與調整尺寸保留輸入及已確認結果。唯讀店家視角可查詢，但伺服器仍要求相同權限。查詢不開啟 AI、不寫預約、不更動接手或用量帳本。

## 驗證與部署

本機以實際日期窗、截止 helper 及時段服務測試員工顧客檢視與原行為，另驗 registry 模組隔離／不可變 scope、讀取前後權限、錯誤不假空值及不合法參數。UI 使用真實元件與替代 reader/actions 驗證 SSR hydration、窄容器、日期與工作區晚到回應；瀏覽器 fixture 不是雲端登入驗收。

表層級 SELECT 原已存在，但 Booking／DutyAssignment 缺少該角色的列政策，原先會看不見占用人數。僅在隔離資料庫套用 preview-availability.sql 的兩條 SELECT policy，限 ai-preview-steamfoot，不授任何寫入、不修改其他角色／政策。已用含占用資料的本機 RLS 演練確認讀到正確人數、跨店排除、禁止寫入及移除政策後回復拒讀；雲端不新增預約或值班 fixture。DB 密碼與環境變數不變。只在必要 Preview 建置完成後用合成蒸足營業時間核對實際登入結果；精確 SHA、CI、實測時間、截圖與收尾以驗收證據為準。正式站、其他 Preview 支線及 LINE／Messenger／Email 外發維持原狀；不 promote 隔離 Preview。
