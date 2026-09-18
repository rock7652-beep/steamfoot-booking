# 固定課程試用環境：待核准執行方案

此方案尚未建立外部資源、設定 LINE 或發訊。與現有工程 preview 及正式營運分離；PR 保持 Draft。

## 已備妥的部署檔

- `vercel.course-trial.json`：獨立設定，Git 自動部署停用、cron 空清單；build 不呼叫 ci-migrate，使用 generate:clients + next build。
- `scripts/course-trial-env-preflight.mjs`：只驗證環境，不連線／遷移。拒絕 production target、現有工程 Vercel project、正式與工程 Supabase ref；核對兩條 DB 連線、固定 HTTPS origin／NEXTAUTH_URL、批准 SHA 與明確 LIFF 店家清單。這不是資料庫 schema 或真實登入驗收。
- `node --test scripts/course-trial-env-preflight.test.mjs`：10 個案例覆蓋有效獨立環境、錯誤目標／版本／網址及空 LIFF 清單。
- `COURSE_LIFF_REQUIRED_STORE_SLUGS`：逗號分隔，僅指定的 COURSE 店改走 LIFF，即使 channel 未就緒也不退回中央 OAuth。已設定 STORE_LINE_CONFIG_JSON 的獨立店同樣走 LIFF；其他課程網頁店與蒸足／SPA 保留既有入口。名單是入口選擇，不是身分／資料授權。

## 擬新增資源（未核准、未建立）

1. Vercel 專用 project，建議名 `steamfoot-course-pilot`；固定網址候選 `https://steamfoot-course-pilot.vercel.app`，可用性與 alias 指派需建立時核對，現在不是測試入口。只部署 preview，不使用 --prod／promote。固定 alias 僅在驗收通過後指向批准部署。
2. Supabase 專用 project，建議名 `steamfoot-course-pilot`；ref 由平台建立後取得。不能使用正式 qijlnhtpbintanzpxkvf 或工程 ttworfzgwejdeolegkxl。
3. 以已核對 schema／migration 建立乾淨資料庫，只加入必要系統設定及首店專用資料，不複製現有顧客、LINE 綁定、交易、密碼或 token。新庫初始化 SQL、順序、來源 checksum、回復方案先列供審查；尚未授權執行新遷移。
4. 共用一個 pilot 資料庫供 5–6 店，沿用 storeId、角色、會員固定帳號與 Provider 隔離。每店独立 LINE／LIFF 設定，不共享其他店的 recipient 或 membership；首店通過後再逐店建置。

費用參考（2026-09-18 查官方價格，非帳戶報價）：Supabase 既有付費 organization 增加 Micro project 通常至少 US$10／月 compute；另有用量及備份加值費，新開 Pro organization 基本費 US$25／月。Vercel 使用既有 team 時仍有用量費，若需升級／新增席位另外核准。不自動購買網域、PITR 或其他加值。來源：https://supabase.com/docs/guides/platform/your-monthly-invoice 、https://vercel.com/pricing 。

## 核准後操作顺序

1. 建立上述獨立資源並記錄精確 ID/ref；確認預算及控制台實際費率。
2. 核准乾淨 schema 初始化後執行，對照三個 Prisma client 與 migration ledger，確認 course／共用表與約束一致。
3. 在新 project 受保護 preview 環境設定 DATABASE_URL、DIRECT_URL、獨立 AUTH_SECRET、NEXTAUTH_URL、COURSE_TRIAL_ORIGIN、COURSE_TRIAL_DATABASE_REF、COURSE_TRIAL_VERCEL_PROJECT_ID、COURSE_TRIAL_APPROVED_SHA、COURSE_LIFF_REQUIRED_STORE_SLUGS。不能把既有 .env 整份複製；必要其他服務逐項核對。
4. LINE 管理者確認 Provider、兩類 channel、LIFF endpoint 與既有串接用途後，另核准精確設定差異。設定 STORE_LINE_CONFIG_JSON 與其引用的受保護 secret；禁止 NEXT_PUBLIC secret。
5. 從核准的乾淨 SHA 建 preview；使用 CLI --local-config 指向本檔，依當時 CLI help 核對語法，不改現有 .vercel project 關聯。CLI 部署須帶可核對的 commit metadata，preflight 的 SHA 比對不可省略。
6. 驗證新店後台登入與 3 人上限、會員／教練固定身分、交易與隔離；再通過手機 LINE／Flex／按鈕驗收。通過後更新固定 alias，再由 HQ 開通一次 30 天。

## 發訊必要缺口

目前 preview 的 `isPreviewExternalIntegrationBlocked()` 會阻擋提醒與 LINE push，這是保留的保護，不能把 VERCEL_ENV 偽裝 production 來放行。真實事件驗收需另準備限定 project／店家／收件人／事件與則數的發送機制，補非外發測試及取得精確外發授權後使用。現有三則文字收訊證據不重送，也不代表 Flex 通過。cron 在初始 pilot 保持關閉，後續事件排程啟用須列授權與用量影響。

## 更新與回復

- 每次先在工程隔離環境驗證，再將候選 SHA 部署 pilot preview。記錄 SHA、deployment ID、schema 版本、驗收結果，通過後才移動固定 alias；不讓分支 push 自動更新店家版本。
- 純程式回復：alias 回指上一個已驗收且與當前 schema 相容的部署。
- DB 變更前先取得備份與還原演練證據。優先加欄位／前向修復；有新交易後不得直接覆蓋回舊資料。必要恢復另建隔離恢復庫核對，再評估停寫及切換，不能宣稱 Vercel 回版會還原資料。
- 第一家通過後依相同清單逐店核对 LINE、角色、入口、資料隔離、外發、試用起算；不自動批次交付。

## 結論與停點

部署檔與拒絕錯誤環境的檢查已備妥，不等於新環境或首店 LIFF 驗收完成。管理頁唯讀授權、外部資源預算／建立、schema 初始化、LINE 設定差異及真實外發皆須分清具體授權。固定 pilot 就緒也不等於正式發布，正式庫／main／正式部署仍禁止。
