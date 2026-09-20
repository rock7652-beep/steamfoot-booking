> 2026/09/20 最新決策：停止額外備份匯出／Docker 還原及憑證索取，取消相關發布門檻。正式執行狀態、CI 與自動審核阻礙以 [最新發布紀錄](course-production-release-status-20260920.md) 為準。以下保留歷史證據，不再作為重複索取授權或備份憑證的依據。

# 正式發布唯讀配對與開店執行清單（2026/09/20）

## 結論與範圍

**目前不可直接正式發布。** 15 份課程遷移的來源與既有隔離演練一致，正式庫具備已核對的基礎相依，但仍缺真實備份恢復與真實副本演練，另有兩份已套用結構的 Prisma 歷史需補正。本次僅 SELECT metadata 與更新文件，沒有正式 DDL、歷史寫入、部署、建店或通知；不繼續搜尋憑證。A 店不變。

證據：`course-production-readonly-audit-20260920.json`；逐檔 hash 沿用 `course-full-migration-rehearsal-20260920.json`。本文件補充最新結果，歷史文件的未完成項目以本文件及 `course-release-remaining-20260920.md` 為準。

## 版本配對

- 唯讀核對的 PR #1022 HEAD：`f096ca11d7ac8d2ead425934075c19f1a94b049f`，Draft、base main。這是候選版本，並非正式發布核准。
- 此 SHA 的 Changed-file ESLint、Typecheck、Targeted tests、Full Vitest baseline、postgres-integration、Vercel 均 SUCCESS；Cloudflare FAILURE 依既有豁免，不算通過。
- Vercel CI 對應部署：`HrqC51JHQzqXNWgi4iyyLypNjj69`。這是該提交的 CI 對應紀錄，本次未重新斷言可變 alias 在未來仍指向此部署。
- 15 份 SQL 與前次演練逐檔 hash 相同；交易包 SHA256：`b9a63292ff00d2b1ac6e88b44810e3c6982bd94452d58ddd7eaad37439604fd6`。
- 本次只新增發布文件；正式核准仍須鎖定最終完整 SHA、部署 ID、SQL hash 及可回退的正式應用 ID，不能只指定分支名稱。

## 正式現況與差異

正式 metadata 查核時間：2026/09/20 11:51 台灣時間，後續同回合補查 TrialCare 結構。

- PostgreSQL 17.6，btree_gist 1.7 已存在；Store/User 主鍵、Staff/Customer 的 `(id, storeId)` 唯一鍵有效，外鍵所需 text 型別符合。
- 無 Course 資料表，IndustryModule 僅 STEAMFOOT/SPA；課程將新增的 Staff、Customer、StaffMemberLink、MessageLog 欄位尚不存在，未見課程部分套用狀態。
- Prisma 歷史 98 筆：82 筆有效完成、16 筆舊回滾、0 筆未解決失敗。82 份已完成 SQL checksum 全部符合目前來源；Supabase 歷史 36 筆，無本輪課程遷移。
- **額外歷史差異**：以下兩份 Prisma 檔案未登錄，但 Supabase 已套用。實際欄位、型別、預設值、PK/FK/unique、索引及三張表 RLS 已對照符合原 SQL。不能將它們當成未執行 SQL 重跑。

|Prisma 名稱|既有 Supabase 版本|處理方式（尚未執行）|
|---|---|---|
|20260916053215_trial_care_public_spa_packages|20260916054027|正式授權後，再核對結構指紋及檔案 hash，使用受控 `prisma migrate resolve --applied` 補歷史，不執行原 ALTER|
|20260916090000_trial_care|20260916054015|同上；原 TrialCare 資料保留，不重建表|

因此目前 Prisma 名稱差集是 **5 份＝3 份課程＋2 份歷史待核正**，並不表示需要新增 2 份業務遷移。不得直接執行全庫 `migrate deploy` 或 `supabase db push`。

正式 `Staff.userId` 為 NOT NULL、`User.role` 為 enum，與合成演練基底不同；正式還有 Supabase DDL event triggers。這些差異未證明本包不相容，但也不能被合成測試覆蓋；需真實副本補驗。不用正式資料查詢成功冒充備份程式已能連線。

## 15 份精確順序

先三份 Prisma，再依下表 Supabase 增量；不能跨目錄只按時間排序。

|順序|遷移|正式狀態|
|---|---|---|
|1|`20260915090000_add_course_scheduling`|待執行|
|2|`20260915140000_course_points_booking`|待執行|
|3|`20260915150000_course_coach_member_mode`|待執行|
|4|`20260915082019_course_catalog_categories`|待執行|
|5|`20260915123055_course_catalog_details`|待執行|
|6|`20260916024857_course_attendance_and_staff_contacts`|待執行|
|7|`20260916090234_course_portal_integration`|待執行|
|8|`20260917000515_course_purchase_refunds`|待執行|
|9|`20260917002754_course_purchase_corrections`|待執行|
|10|`20260917011137_course_customer_emergency_contacts`|待執行|
|11|`20260917030753_course_reminder_links`|待執行|
|12|`20260917081039_course_negotiated_refund`|待執行|
|13|`20260917094700_course_low_balance_reminders`|待執行|
|14|`20260917143018_course_trial_separate_payment_attendance`|待執行|
|15|`20260918235710_course_batch2_catalog_qualifications`|待執行|

基礎排程 → 卡片/預約/異動 → 身分 → 分類/內容 → 出席/聯絡 → 購買 → 退款/更正 → 聯絡 → 提醒 → 協商退款 → 低餘額 → 體驗 → 第二批資格/狀態。每步的精確內容以 hash 鎖定 SQL 為準，不臨場改寫。

## 發布、失敗與回復執行清單

以下是待核准的執行計畫，並非可立即執行的授權。

1. 恢復 gate：正式備份恢復狀態仍為 **「缺少既有正式連線，尚未執行」**。停止搜尋；等待合法提供既有連線。恢復到已指定無網路空 DB，驗證資料關聯、存取及必要功能，記錄耗時；不以合成基底代替。再在該副本驗證此精確包與正式相依差異。
2. 鎖版 gate：核准完整 SHA/SQL hash、執行者、維護窗口、正式 target、回退部署 ID；先核對本輪以外的新正式漂移。記錄完整 schema/ledger 指紋，不輸出業務個資。
3. 執行路徑 gate：`package.json` build 會呼叫 `scripts/ci-migrate.mjs`；無 target 時跳過，allowlist 尚不含課程包。**合併不會自動安全完成課程遷移**。需另審精確執行方式及歷史登錄，不新增取 secrets 的入口、不擅改 allowlist。
4. 先核正上述兩份已存在結構的 Prisma 歷史（另需正式寫入授權），保留既有 Supabase 紀錄；查明新 pending 才往下。保留修正前後紀錄與 hash。不得刪歷史或重跑 TrialCare DDL。
5. 在核准窗口執行精確課程交易包，使用既有組裝規則、lock_timeout=5s、statement_timeout=60s、ON_ERROR_STOP；第14份僅移除已審查的外層 BEGIN/COMMIT，以單一外層交易涵蓋15份。沒有 COURSE／Course 表的 preflight 才可執行；部分存在立即停止。
6. 交易提交前錯誤：完整 ROLLBACK；timeout 先分析鎖與窗口，不無限重試。提交後核對表/欄位/約束/RLS與權限，正式歷史分別登錄3份Prisma、12份Supabase精確檔案；不得把全部登錄到錯誤工具。登錄機制與DDL原子邊界須在受審執行方案中明列。
7. DDL 已提交而歷史失敗：不再執行 DDL；保持課程新入口不交付，以結構/hash確認後僅補歷史。不能讓 build 的一般 migration 命令重跑。雙ledger、schema完整才可發布配對應用。
8. 正式部署後：核對實際部署SHA、DB target、健康回應；蒸足/SPA原入口/角色/通知設定不變；核准測試對象範圍內驗課程登入、卡片預約占用/取消、出席/更正及防重送、店別權限。未授權不向真實客戶外發。監看DB錯誤、鎖等待、5xx及通知重複。部署成功不是交易通過。
9. 提交後故障：先停止受影響的新課程寫入，回退**已確認相容**的正式應用版本，保留新schema與所有營運紀錄，前向修復。若前版不能處理COURSE enum/新店，不可盲回退並開放入口。不要DROP新表或用舊備份覆蓋期間交易。
10. 災難資料恢復須另訂窗口、資料截止點及期間交易重建方式並取得授權；本次僅是隔離恢復授權，不能直接還原正式庫。記錄恢復結果後才訂可接受恢復時間/資料損失範圍。

## 每家正式體驗店開通清單

先一店驗收，再複用至其餘4–5家；尚未建立任何正式客戶店。

|階段|需提供／執行|完成條件|
|---|---|---|
|資料與歸屬|店名、唯一店家代碼、店長信箱；既有帳號/店家、官方LINE及其他系統串接情況；取得必要管理邀請|先查重；不依同名/電話合併，不索取聊天中的密碼/token|
|HQ建店|明確核准後，沿用HQ建立COURSE，初始EXPERIENCE，記錄Store ID與建立人|沿用實際存在的 `/hq/login?store=<slug>` 共用登入頁及店別返回；交付名稱標示本店店長登入，勿交無store的HQ入口；路徑名稱不代表授予HQ權限|
|試用與額度|30天，3位啟用人員；既有100顧客/100本月預約規則，不任意放寬；日期未驗收前不啟動|入口驗收完成才由HQ啟動一次，重送不延長；不含金流申請/串接|
|基本設定|營業/公休、付款資訊、取消規則、教室容量、課程、合資格教練、點/堂方案|人員兼任只計一人；緊急資料及身分連結依既定規則；不改舊店|
|LINE/LIFF|沿用已查明的Provider/Login channel所有權；人工Console建立本店LIFF，登錄同一系統設定來源；核對官方帳號與通知token歸屬|設定、技術檢查、實機通過分開記錄；登入channel驗證與已驗證會員關聯不跨店、不覆蓋既有LINE；必要變更逐店核准|
|三方驗收|店長登入核帳、學員購買/預約/取消、教練本人課次/出席/更正；同店雙身分與跨店拒絕|卡別扣抵、占用、紀錄及報表一致；測試通知先核准收件人/內容/則數，按鈕返回本店|
|交付與起算|固定正式網頁/LIFF入口、簡明指南、問題回報方式、明列未實作功能|入口完成驗收後30天起算；試用不是測試帳號；不宣稱報酬/分潤/固定期課等已可用|
|後續升級|HQ在原Store切BASIC/GROWTH/ALLIANCE，保留帳號/會員/方案/預約/交易/LINE關聯|權限/額度及會話更新；無搬資料、無重建店、無覆寫歷史|

逐店交付前仍須以該店一般店長實際登入，確認返回同店後台且無HQ權限，不自行新增另一套登入頁。

## 集中剩餘 gate 與9/30影響

- **已完成**：本次正式metadata/雙歷史/15來源hash對照、兩份歷史差異定位、release/runbook/每店開通清單。
- **需存取能力**：正式備份所需既有PostgreSQL連線仍缺；MCP metadata唯讀可用，不等於pg_dump連線可用。真實副本演練因此未執行，不新增搜尋。
- **需另行核准並執行**：兩份歷史核正、精確15份正式執行路徑、窗口/回退ID、正式遷移/合併/部署、真實店家及各店LINE設定/外發。
- **保留未測**：實體iPad/Safari/鍵盤、cron實機與非本次通知事件；已確認Flex收件/呈現/返回不重送。升級fixture未含的關聯仍不擴張宣稱。
- **9/30風險**：上述恢復及執行gate未關閉前，不能承諾5–6家正式可交付。建議9/22前解決恢復與執行審查、9/25前首店完整驗收、9/26–27複製開通、9/28–29僅修缺陷。這是排程目標，不代表新增授權；逾期應縮減交付店數或延後，不跳過恢復gate。
