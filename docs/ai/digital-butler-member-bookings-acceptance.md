# 本人預約唯讀：隔離 Preview 驗收

2026-11-26（台灣時間），沿用 Draft PR [#1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)、`feat/ai-digital-butler-core`。本輪只完成合成會員人工唯讀工具，不代表完整 Phase 3 或正式 AI 客服開放。[契約](digital-butler-member-bookings.md)、[Runbook](digital-butler-runbook.md) 與 [結構化證據](../../artifacts/ai-digital-butler/member-bookings/summary.json) 共同記錄範圍。

## 版本與環境

- 程式／Preview：`48a6391ec2974a6f40c98392605c2bc89fccd0d8`；後續文件證據提交以 PR head 為準，程式不變。
- Deployment `dpl_G2DchZU8Dpc8UUUAabjd6YcnNxVF`，READY，[受保護 Preview](https://steamfoot-booking-h860efoco-rock7652-2111s-projects.vercel.app)。
- 僅既有 steamfoot-preview `ttworfzgwejdeolegkxl`、既有隔離角色。AWS1 Transaction 6543、嚴格 TLS、connection limit 8、原 DB 密碼及支線 Sensitive 變數不變。
- main 基準 `378cd9475317f6c4ab804f0e48642f1d4f0f567a`；不合併、不 promote、不修改 Production。Cloudflare 不在本次 Vercel 原生測試依賴內。

## 行為與資料

沿用共用身分 resolver 的 opt-in confirmedOnly、原 LIFF 本人預約 reader 與共用工具註冊。只接受日期／頁碼，由後端綁定已確認的 CUSTOMER session；不以 Email／電話補綁，不接受前端傳入 customerId／storeId。前後重查帳號版本、身分關係及 AI 權益，失敗不回空清單。知識 Provider 工具維持關閉。

最少投影只有日期、時段、狀態、人數與分頁／查詢時間；不回姓名、聯絡資料、預約 ID、備註、方案餘額或金額。既有合成會員「我的預約」收合測試列沿用 SettingsListRow／panel reader，TTL 0、private/no-store、Vary Cookie；更換日期清舊結果，失敗可保留頁碼重試，晚到日期／會員回應不顯示。沒有前台操作指南或新主選單。

隔離 SQL [preview-member-bookings.sql](../../scripts/sql/ai-digital-butler/preview-member-bookings.sql)，SHA256 `e00044dec0a3500764b3f24b24780c440daacd5c1fbd3ff4b090656a54f9ea81`；成功 migration 名稱 `ai_preview_member_bookings_read`。新增三名合成 CUSTOMER／Customer，A/B 同蒸足店、C 外店且與 A 共用合成聯絡資料。只建立兩筆 2026-11-27 蒸足預約：A 10:00／1 人／CONFIRMED，B 11:00／2 人／PENDING。外店無蒸足 Booking。使用 STAFF 代建類型與原 trigger 規則跳過通知，不停用模組防火牆或通知 trigger。

新增三條指定 fixture ID 的 User／Customer／解除關係 SELECT policy。既有 Booking policy 限合成蒸足，並非顧客本人隔離；應用層每次依 session 加上本人條件。沒有授 Booking INSERT、User UPDATE 或 Customer UPDATE，沒有新私有表或角色擴權。

## 驗證結果

- 34 項新增身分／查詢／工具／實際 PGlite RLS 測試；含既有中央會員、登入恢復與 LIFF reader 回歸，共 8 檔 76 項通過（已含新增 34 項）。型別檢查與變更檔 ESLint 通過。
- 程式 CI [45760583721](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45760583721) 四項 job 成功；全量 1,863 檔／17,637 項 passed，36 檔／340 項 skipped，407.82 秒。其他運動／音樂／混合課程隔離 workflow 成功，Booking／editorial 依條件跳過。
- [本機 UI](../../artifacts/ai-digital-butler/member-bookings/local-ui.json)：實際元件 SSR／hydrateRoot、替代 reader，11 情境、1920／1366／1024／768／390／360 六尺寸；51 筆分頁 25／25／1、重試保留頁碼、收合、空資料、網路錯誤、錯 proof、晚到日期／actor。無 hydration error。此部分不是雲端真實資料驗收。
- [雲端](../../artifacts/ai-digital-butler/member-bookings/hosted.json)：沿用正常登入與既有會員原生頁，17 情境與六尺寸通過，errors／failures 均空。A/B 各只見本人；A proof 在 B session 拒絕；C 即使聯絡資料相同亦拒絕；Owner 不能代查；未登入拒絕。無效日期、額外身分參數、超過頁碼上限回 400；權限回 403。確認零筆與超過末頁分別顯示，網路中斷不當成零筆，重試恢復。
- 先實際停用 A，再沿用原 CUSTOMER cookie 查詢，API 與 UI 都立即拒讀並清掉結果。既有 Owner 空位工具讀到 10:00 剩 5、11:00 剩 4，證明兩筆預約實際扣除占用。
- 雲端瀏覽器使用既有環境 CA，未忽略 HTTPS 錯誤。六尺寸為 Chromium 視窗模擬，不是實體手機／iPad 或真實 LINE LIFF。

第一輪部分驗收 A 的自動化登入至入口合計 18,298ms，A 正向查詢及 RWD 已完成，之後 QA helper 誤把瀏覽器 Response.status 當函式而中斷。只修正 `/tmp` 測試 helper，重用同一 Preview，沒有程式重建。完整輪 A 合計 15,479ms、B 12,337ms、Owner 11,486ms；A 兩次查詢 1,563／1,438ms、重試 1,432ms，B 查詢 1,490ms。此合計從開啟登入頁開始，包含登入頁載入、自動填表、登入／轉址、測試工具換分頁、原生目標頁及 networkidle 等待；不是「登入後單頁載入時間」，也不是點擊至第一筆查詢結果的完整任務耗時。舊 helper 未分段，不能從這個數字判定登入、資料庫、冷啟動或頁面效能瓶頸；不宣稱已完成載入效能優化或強制冷啟動測試。

2026-11-26 後續效能盤點已更正上述定義；[分段量測準備與阻擋](digital-butler-member-performance.md) 保留目前進度。

隔離 DDL 首次因 UserStatus 使用不存在的 INACTIVE 失敗並完整 rollback；查核新 Users／Bookings／policies 均 0。核對實際 ACTIVE／SUSPENDED／DELETED enum，補上本機實際 enum 測試後改為 SUSPENDED，才成功安裝。未為此失敗建立 Preview。收尾唯讀查核曾用錯欄位名，依既有 schema 修正查詢後成功；沒有資料異動。

## 收尾與界限

前後模型帳本均 47 COMPLETE（Mock 44、OpenAI 3）、估算 1,310 micros；Dispatch 65、恢復 audit 8、原合成 handoff 1 均不變。global stopped=true、四店 enabled=false，真實 LINE／Messenger／Email 仍封鎖。本輪新增模型請求 0；一次必要 Preview 建置，沿用既有 Turbo，工具沒有單次 Enhanced 選項、未修改全專案機型。平台實際費用／供應商帳單未取得。

隔離全庫 Booking 127→129、Customer 1,364→1,367，對應新增 fixture Booking 2／Customer 3；合成 SteamfootStoreNotice 0、DigitalButlerLead 0。Security advisors 3→3、新增 0；既有建議不視為已修復。測試角色無 superuser／bypass／建庫／建角色權限，連線上限 8 未變。

三個合成會員收尾全部 SUSPENDED、passwordHash NULL；合成 Owner 更新登入版本，手動 share grant 撤銷（剩餘 0），私密暫存檔刪除、測試瀏覽器關閉。保留合成 fixture／稽核，不做不可逆刪除。此工具及測試入口重查會員狀態而拒絕舊 session，不代表全站既有 CUSTOMER JWT 具備員工 session stamp 的撤銷機制。

後台 AI-BUTLER-PREVIEW-01 只補本功能範圍與 Owner 不能代查的說明；指南 205 題／96 待驗保持來源審查，沒有全站指南驗收。其他產業本人 adapter、真實 LINE 身分、其他會員資料、模型工具自動呼叫、餘額、預約建立／改期／取消、正式 API Project／migration 與試營運均未開放。
