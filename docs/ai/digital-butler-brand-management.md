# 品牌 AI 管理接線與隔離驗收

> 後續b72修正版已完成雲端六尺寸及舊session HTTP拒絕驗收，並完成清理；見[實際驗收紀錄](digital-butler-brand-hosted-b72-acceptance.md)。下方前輪404與待重驗文字為歷史階段紀錄。

2026-11-26，接續 Draft PR #1596。管理入口 `/hq/dashboard/ai-services`，唯讀 API `/api/ai/brand`，僅指定 AI Vercel Preview 可用。正式環境返回未開放。HQ 門市清單的品牌管理連結只在隔離 Preview 與 audit.read 權限下顯示。

## 操作與共用邊界

沿用 SettingsModuleWorkspace、AiButlerPanel、AiKnowledgePanel、AiHandoffPanel、AiHandoffWorkspace 及 FeatureStateEntry；未建第二套工作台。品牌 adapter 固定 `ai-preview-brand-steamfoot`、TEST、brand-dashboard；拒絕 caller owner/store/module/channel 覆寫。ADMIN + audit.read + 非 HQ 門市檢視，每次 server action / API 重驗。OWNER、STAFF、CUSTOMER 不得讀取品牌管理資料。

品牌知識只取 AiBrandKnowledgeDocument，不混入 SYSTEM，不顯示門市營業時間／課程／價格引用。品牌無營運工具 registry，不能透過 UI 切成 Store。知識、設定、對話、人工隊列及預算均使用既有 Brand owner repository；跨模式仍共用安全總額聚合。共用 DB 角色仍有既有門市唯讀權限，不能將 adapter 隔離誤稱為獨立無門市 SELECT 權限的 DB 角色。

HQ HIDDEN 不出現服務入口，LOCKED 顯示不可用，ENABLED 仍須角色、開關與安全控制。HQ 配置核對介面可供 ADMIN 檢視 HIDDEN 狀態，沒有 grant 修改 API。此核對介面不是已啟用的客服入口。

### 知識與人工操作

- 草稿儲存採 revision 衝突檢查，失敗保留輸入，不顯示已儲存。
- 審核是唯讀檢查已儲存內容、品牌欄位與 provider 輸入上限；不是人工核准正式內容。審核回條以 actor、服務、版本、內容及五分鐘效期 HMAC 綁定，不寫 DB。
- 發布須有相同版本／actor 的有效審核回條，另有 publish 操作窗口；儲存、撤回與發布分開授權。撤回移除 published，不刪帳本。
- 品牌開關僅可改 enabled，不能更改模型、通路、額度或重置用量；總停止時拒絕啟用。
- 人工恢復只走共用稽核隊列、revision 與 commandId 去重，不提供直接解除人工旗標捷徑。

所有異動預設封鎖。僅明確限定的 `AI_BRAND_PREVIEW_WRITE_OPERATIONS` 與最長 30 分鐘 `AI_BRAND_PREVIEW_WRITE_UNTIL` 能提供操作資格，且仍要 ENABLED entitlement；目前未設定、未申請修改。test 僅接受 mock，總停止時拒絕；沒有真實 OpenAI Provider 路徑或任何通路 sender。未設定窗口不能靠偽造 UI capabilities 寫資料。

## 本機已驗

- PGlite 載入已審查的安裝 SQL，以同名最小 runtime role 實測管理流程：角色／環境拒絕、預設七類寫入拒絕、三態與期限、審核不寫入、跨 actor／舊版本回條拒絕、儲存→審核→發布→撤回、開關只改品牌、人工恢復稽核與重送。
- route 測試覆蓋私有 no-store、scope 拒絕、未登入、CSRF、輸入長度及 streaming 上限；後端授權先於讀取 body。
- 連線 preflight 單元測試使用假的 pg client，驗證 strict TLS 與 scope；不冒充實際遠端連線證據。
- AI 及受影響共用回歸：31 檔通過、1 檔略過，468 項通過、6 項略過；另 TypeScript、ESLint 通過。CI 與部署最終結果記原 PR。
- 本機 Chromium 實際共用 TSX + 合成唯讀 action：1920×1080、1366×900、1024×768、768×1024、390×844、360×800。六尺寸無橫向溢出，導覽觸控至少 44px，切區與縮放保留內容，審核回饋可見，發布仍停用，沒有門市引用選項及產業切換，console error=0。修正品牌區導覽原 40px 高度為 44px；未更改全站密度。

證據：[local-ui.json](../../artifacts/ai-digital-butler/brand-management/local-ui.json)，同目錄六張截圖。命令：`node scripts/qa/ai-brand-management-ui.mjs`。這些是本機合成 action、模擬視窗，沒有登入遠端，不能當雲端業務或實體 iPad 驗收。

## 遠端安全與一次必要建置

目標 steamfoot-preview / ttworfzgwejdeolegkxl，唯讀核對 ACTIVE_HEALTHY、全域停止、四店關閉、Brand HIDDEN / false / unpublished。既有角色 connlimit=8、無 superuser / BYPASSRLS / create DB / create role，有效期 2026-12-02T14:15:52Z 未改。共用帳本 total=2690 micros / concurrent=0。

新 prebuild 在指定 Preview 使用既有 Vercel sensitive DATABASE_URL，嚴格 TLS 實際連線既有角色，BEGIN READ ONLY 核對上述停止狀態、current_user 及聚合。剝除 pg URL 可覆蓋 SSL 的參數，沿用現有 Prisma 已使用、指紋核對的 Supabase Root 2021 CA，設定 rejectUnauthorized=true，檢查 TLS authorized/encrypted。失敗立即阻止 Next 編譯，只輸出安全代碼，不輸出連線字串／密碼。其他部署直接 skip，不連線、不安裝 schema、不更改資料。雲端成功證據須以新部署 build log 為準。

舊部署 005ce6e61 沒有本輪介面，不能驗新版。原支線 auto Vercel disabled 維持原樣；集中修改與本機測試後，目標為一次成功的既有專案 Preview，成本無法由現有工具精確預估。首次嘗試 dpl_B5UNj6BEXWsTBka48w65WNZgHJSp 在新增 pg 前檢因未載入既有 Supabase CA 而 SELF_SIGNED_CERT_IN_CHAIN，於 Next 編譯前安全拒絕；修正為重用指紋核對的既有 CA，不放寬 TLS。連線及資料庫 URL 回歸 29 項通過後才補建修正版。未改 Production / Webhook / 發送 / Cloudflare 設定。

## 本輪雲端驗收原授權提案（已執行並清理）

目前無合成 ADMIN 可登入。既有四個合成 owner 的角色為 OWNER、密碼為空，不修改／升級它們。正常登入會寫 StaffLoginRecord，現有 runtime RLS 僅允許四店 OWNER；不能繞過登入稽核。

以下為本輪已批准並執行、其後已清理的限定範圍；重驗不沿用此次授權。實際受阻與清理結果見本頁末段：

1. 僅新部署：一條 30 分鐘測試通行連結，持有者在有效期可存取隔離部署；不公開連結或密碼。
2. 僅隔離庫：建立單一合成 `User.id=ai-preview-brand-hq`，role ADMIN、無 Staff／Store 關係，臨時隨機密碼；不修改其他帳號或 DB role。窗口結束 status=SUSPENDED、passwordHash=NULL、updatedAt 更新，使既有 JWT session stamp 失效，保留帳號供稽核識別。
3. 僅既有 runtime role 的四條臨時 RLS policy，不改 table grants：User SELECT 僅上述 id；StaffLoginRecord SELECT／INSERT／UPDATE 三條，只准同一 actorUserId、ADMIN、storeId IS NULL、outcome SUCCESS。每條固定至窗口 deadline（不超過 30 分鐘）。最多兩次成功登入及該兩筆的 lastUsedAt 更新；不允許其他登入紀錄或原有門市資料。結束移除四條 policy，保留登入稽核。
4. 只讀新管理頁與審核回條，六尺寸、角色直接連結及保護驗證；不儲存／發布知識，不改 HQ／AI 開關，不增模型事件，不設寫入 env，不外發。
5. 無論成功失敗中斷，撤銷連結並核對剩餘為零、停用帳號／清空密碼、移除四條 policy，重驗全域停止／四店／Brand 狀態及模型／發送事件數未變。

風險：連結持有者短期可通過部署保護；測試 ADMIN 在隔離庫有 HQ 身分，必須限定合成帳號與短時 RLS，不能套用到 Production。執行前需固定部署 ID、精確截止時間與 policy SQL，再按取得的批准執行；若原 RLS 或使用者狀態不符即停止。全域停止與品牌 HIDDEN 不必解除。

## Cloudflare 獨立待查

Workers Builds 既有失敗持續獨立列管，未拿到失敗細節，不宣稱修復。新 head 的檢查狀態記 PR，不變更正式設定，也不以 GitHub CI 通過稱所有平台檢查全綠。

## CI 冷啟動時限修正

e2d56ce67 的完整 CI 首輪為 17,859 passed / 340 skipped / 1 failed；唯一失敗是既有 `image-announcements-production-migration.test.ts` 第一案例超過預設 5 秒。本機重現同樣 timeout，診斷時限下全部三項斷言通過；同模組 `image-announcements-migration.test.ts` 原已有 30 秒 PGlite 冷啟動時限。本輪只為此真 PostgreSQL 引擎案例加 30 秒，保留全部 schema / ACL / ledger drift 斷言，不改 migration 或任何營運程式。再驗 CI，最終數字記原 PR。

此後提交僅有上述測試時限與說明，READY Preview 仍使用 e2d56ce67 的相同執行程式；以 git diff 核對，沒有為測試／文件變動再觸發 Vercel 建置。

## 本輪已批准雲端驗收：受阻及清理

2026-11-26，僅原部署 dpl_DVzaJJAGfoT5XyAC29RAmZb3xFHw／steamfoot-preview。本輪沒有建立新部署或補發連結。

- 事前核對project、角色、RLS、停止與原帳本。Chromium環境代理CA預查失敗；永久改共用NSS遭自動審查拒絕，未執行。改用一次性mount namespace的獨立NSS庫後，嚴格TLS通過，未使用憑證略過設定。
- migration ai_brand_hq_qa_temporary_access 建立單一ai-preview-brand-hq ADMIN、無Staff／Store，及提案四條時限policy。僅User SELECT、StaffLoginRecord SELECT／INSERT／UPDATE，限定該帳號、ADMIN、storeId NULL、SUCCESS及固定期限；不改table ACL、DB角色或既有policy。
- 唯一share link createdAt=1795696007100、expires=1795697807（約30分鐘）；secret未放入證據。正常登入成功 **1次**，未用第二次額度，保留登入稽核。
- 未登入品牌API實際403；登入後session確為合成ADMIN，但品牌頁回404。因此 **雲端六尺寸0/6，尚未完成**；不將既有本機fixture冒充雲端通過。
- 根因：HQ proxy清單漏新路徑，驗證ADMIN後rewrite到不存在的 /dashboard/ai-services。本機實際proxy測試修正前重現；修正僅加入品牌根路徑／子路徑pass-through，保留ADMIN與OWNER隔離、相似前綴不放行、Preview守衛及其他路由。舊部署不可原地修改，修正版未部署。
- 原提案誤寫UserStatus=INACTIVE，實際enum為ACTIVE／SUSPENDED／DELETED。首次清理交易拒絕並回滾，已修正使用 **SUSPENDED**；成功停用帳號、passwordHash=NULL、updatedAt更新、四policy全移除，稽核保留。帳號停用核對時間2026-11-26T12:38:12.845Z。
- share revoke回傳剩餘 **0**；全新cookies與嚴格TLS帶原撤銷連結，實際302回部署保護，撤銷驗證成功。
- 舊瀏覽器session HTTP重驗因清理協調等待逾時，未取得證據。DB停用、清空密碼、更新stamp及移除User SELECT已核對；auth callbacks每次回查DB安全stamp，既有本機auth回歸覆蓋停用、無密碼及查無使用者拒絕。不能宣稱做過舊session live probe。下輪應登入後先私下保存storageState，以便中斷後重驗，完成後刪除且不得提交。

清理後：全域停止true、四店關閉、品牌HIDDEN／false／未發布／revision0；品牌Request／Dispatch／Conversation／Audit全0，Store Request53／Dispatch113未變，DB角色有效期未變。真實OpenAI、Mock、LINE／Messenger／Email外發均0。security advisors前後已查，未擴大修正既有非本次通知。

證據：[清理](../../artifacts/ai-digital-butler/brand-management/cloud-cleanup.json)、[受阻紀錄](../../artifacts/ai-digital-butler/brand-management/cloud-attempt.json)、[撤銷核對](../../artifacts/ai-digital-butler/brand-management/revoked-share.json)、同目錄cloud-404.png。本次並非完整雲端驗收通過。

本輪授權已隨清理結束，不復用舊連結或重新啟用帳號。重驗需另批一次修正版Preview及僅該新部署的30分鐘窗口，沿用同一帳號／隔離庫、相同四條時限policy與最多兩次登入，保持停止／HIDDEN／未發布／零模型與外發，任何結果均清理。Production、Cloudflare設定不變，PR仍Draft。
