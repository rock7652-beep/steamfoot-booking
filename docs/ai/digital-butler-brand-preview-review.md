# 品牌隔離 Preview：唯讀前置核對與待批准變更

> 歷史審查快照：後續已獲批准並完成安裝；本頁保留當時提案文字，不代表目前尚未安裝。管理接線與本輪驗收見 [品牌管理紀錄](digital-butler-brand-management.md)，實際安裝證據見原 PR #1596。

2026-11-26（台灣時間），接續 Draft [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)。本輪執行範圍是目標隔離庫的唯讀核對、安裝／ACL／RLS 草稿審查與本機演練。**下列 proposed SQL 均未送到遠端執行，尚未取得安裝或資料寫入授權。**未修改 Production、其他資料庫、Vercel 環境設定或 LINE callback。

## 唯讀結果與證據限制

- Supabase `get_project` 核實目標 `steamfoot-preview`／`ttworfzgwejdeolegkxl`／ap-northeast-1／ACTIVE_HEALTHY，Postgres 17。只對此 project_id 發出 `BEGIN READ ONLY` 查詢；沒有用 database_name=postgres 冒充環境識別。
- AiBrand 八張表與 `public.ai_owner_global_totals()` 均不存在；既有七張 AiButler 私有表 RLS 開啟，owner 為 postgres。成本表未 FORCE RLS，表 owner 可提供完整受限聚合。
- 全域停止 true、四店 enabled=false；Request 53（OpenAI 5）、Dispatch 113，未決均 0，heldMicros=2690。前後核對一致。四店均保留 TEST／gpt-6-luna、月預算 1,000,000 micros、每日 20／每月 100；修訂版見[唯讀證據](../../artifacts/ai-digital-butler/brand-preview-review/read-only-summary.json)。沒有提高或重置額度。
- 既有 `steamfoot_ai_preview_20261125` 可登入、connlimit=8，無 superuser／BYPASSRLS／CREATEDB／CREATEROLE，沒有繼承其他角色，public schema USAGE=true／CREATE=false；有效至 2026-12-02T14:15:52Z，本輪未延長。該角色既有會員／預約等 SELECT 權限保持原樣，主要營運表 INSERT／UPDATE／DELETE／TRUNCATE 均 false。
- **共用同一既有 DB 角色不代表資料庫能辨識 A／B 模式。**本輪僅加品牌物件的 serviceId RLS，不撤銷 B 依賴的既有門市唯讀權限；品牌禁止營運工具仍依嚴格 principal／adapter／工具 registry 的共用核心邊界。不能宣稱品牌使用了一個完全沒有營運 SELECT 權限的新角色。
- SQL 管理工具的 `SET LOCAL ROLE` 被資料庫拒絕；沒有重試升權、變更 membership 或繞過拒絕。後續以 `has_table_privilege`／`has_schema_privilege`／pg_policies 核對既有角色有效權限，在本機以同名最小角色演練。**未宣稱遠端 runtime 帳密登入／TLS 已重新實測**；沒有解密或輸出敏感 Vercel 變數。
- Vercel 只讀 metadata：既有 project `steamfoot-booking`，指定支線的資料庫及 identity/API secrets 仍為 sensitive；隔離標記=1、外發封鎖=1、beauty notifications=0／legacy、pooler mode=`shared-transaction-aws1`。既有 resolver 仍限制 aws-1 隔離 pooler、role＋project suffix、嚴格 TLS；本輪未改連線值或 TLS。

可重複的[目錄唯讀 SQL](../../scripts/sql/ai-digital-butler/brand-preview-review/catalog-readonly.sql)只讀配置、catalog 與帳本統計，不讀對話文字、顧客或會員資料。SQL target 必須由已核實的 Supabase project_id 指定；草稿不是跨資料庫可隨處執行的安裝工具。

## Schema／ACL／RLS 差異

[原始 owner schema 草稿](../../scripts/sql/ai-digital-butler/brand-owner-schema.draft.sql)保留；[本輪安裝提案](../../scripts/sql/ai-digital-butler/brand-preview-review/install.proposed.sql)逐字包含該草稿，再加入下列具體限制：

| 新物件 | 既有隔離角色新增權限 | RLS |
| --- | --- | --- |
| AiBrandService、AiBrandGrant | SELECT | 只准 `ai-preview-brand-steamfoot`，無 runtime 建立服務或啟用 HQ grant 的權限 |
| AiBrandSetting、AiBrandConversation、AiBrandRequest、AiBrandDispatch、AiBrandKnowledgeDocument | SELECT／INSERT／UPDATE | 各命令獨立 policy；UPDATE 同時 USING／WITH CHECK，限同一 serviceId |
| AiBrandHandoffAudit | SELECT／INSERT | 限同一 serviceId；不能 UPDATE 稽核 |
| public.ai_owner_global_totals() | EXECUTE | 僅完整聚合兩份私有成本帳本的總額／並行數，不回 owner、actor 或訊息 |

合計 **8 張表、2 個索引、19 條 RLS policy、1 個聚合函式**；PK／FK／CHECK 隨新表建立，所有品牌 FK 只到 AiBrandService。角色沒有新 DELETE／TRUNCATE／CREATE／角色管理權；不修改既有 Store／營運表、舊 AiButler 權限、role flags／有效期、全域 default privileges 或瀏覽器授權。

審查實際發現：目標庫 postgres 在 public 的新表預設給 service_role ALL；新函式預設另給 anon／authenticated／service_role EXECUTE。原草稿只撤銷 PUBLIC／anon／authenticated，因此提案**再撤銷新物件的 service_role 權限**，先清除 runtime 在新物件可能繼承的權限，再精確授予矩陣。沒有執行 `ALTER DEFAULT PRIVILEGES`，避免影響其他功能。

成本聚合採 SECURITY DEFINER 的具體理由是：一般 per-owner RLS 會漏算其他 owner，用 invoker 加總不能守住總預算。提案保留現有呼叫 ABI `public.ai_owner_global_totals()`，固定 `search_path=pg_catalog`、全表名限定 public、`row_security=off` 使權限不足時報錯，只回兩個統計欄位；同一交易內撤銷 PUBLIC／anon／authenticated／service_role，再只給既有 runtime 角色 EXECUTE。這是直接 Postgres server role 能力，沒有 Supabase Auth JWT／auth.uid() context，也未授予 browser RPC 權限。移到 non-exposed schema 是另一種設計，但會改目前共用核心 ABI，不混入本次最小安裝提案。

提案使用單一 BEGIN／COMMIT、5 秒 lock timeout／30 秒 statement timeout；先鎖共用控制列、檢查停止／四店關閉／既有最小角色仍有效。任何建立、grant 或 seed 失敗都整批 rollback，沒有 `CREATE OR REPLACE`、`IF NOT EXISTS` 靜默覆蓋既有品牌物件或既有聚合函式。

## 待批准的資料寫入（僅四列）

安裝交易只新增一個不對應任何真實 OA／Store 的 `ai-preview-brand-steamfoot` 主體，共四列：

1. AiBrandService：蒸管家品牌客服（隔離合成）。
2. AiBrandGrant：HIDDEN，不啟用；featureKey=ai_brand_support。
3. AiBrandSetting：enabled=false、TEST only、gpt-6-luna；月預算 1,000,000 micros，每日 20／每月 100，初始 revision=1。不是提高任何既有店家額度。
4. AiBrandKnowledgeDocument：一份明示「不代表正式售價」的合成 FAQ 草稿，published=null、發布版本=0；沒有發布、對話、請求、發送或人工稽核事件。

**本輪沒有寫入這四列。**發布／撤回／HQ 三態切換／人工恢復的實際操作亦屬後續資料寫入，不能靠這個提案默認授權；解除全域停止、啟用品牌、Mock／真實 API 窗口、外發、短效通行連結另行批准。

## 回復方式

- 安裝途中失敗：整個交易 ROLLBACK，不保留新物件或 seed，不動舊控制與帳本。
- 尚無品牌活動：經批准可執行[空資料移除提案](../../scripts/sql/ai-digital-butler/brand-preview-review/remove-empty.proposed.sql)。只有 Request／Dispatch／Conversation／Audit 全空、沒有其他品牌資料、知識與設定仍為原始 seed 時，才刪新函式與八張表；不使用 CASCADE，意外依賴會整批拒絕。草稿／發布／預算／主體設定變動亦禁止空資料移除，只能保留資料停用。舊程式偵測不到 BrandRequest 後沿用原 Store 帳本，不動歷史用量。
- 已有品牌活動：禁止破壞性移除，改用[停用提案](../../scripts/sql/ai-digital-butler/brand-preview-review/soft-stop.proposed.sql)，將該品牌設回關閉／HIDDEN、撤銷新增品牌表的 runtime 權限，保留全部帳本、對話及稽核。**保留窄聚合 EXECUTE**，使 Store 模式仍計入既有品牌成本；不能因回復而退回或重置已花用／未決預留費用。全域停止與四店關閉仍為執行前置條件。

回復不要求 runtime 登入仍未到期，避免角色自然到期反而阻止管理者回復；本機已模擬過期驗證，沒有延長遠端角色。

回復 SQL 也未執行於遠端；新授權應同時明確涵蓋失敗交易回復及符合條件的上述回復方式，不含刪除既有營運資料。

## 驗收準備與目前阻擋

| 驗收層級 | 本輪結果／下一個必要條件 |
| --- | --- |
| 本機 schema／ACL／RLS／回復 | 新增 11 項真正 PostgreSQL 引擎演練，含模擬實際 default ACL、service_role BYPASSRLS 仍無物件權限、跨品牌 UPDATE WITH CHECK、稽核 append-only、RLS 隱藏成本完整合計、安裝失敗原子回復、空移除／有活動保留 |
| 共用核心回歸 | 與既有雙模式 36 項、六通路 5 項合跑，**3 檔／52 項通過**；型別及新測試 lint 通過。無網路 API／訊息外發 |
| 遠端品牌基礎配置 | 被明確的「不授權安裝」範圍阻擋：需批准上述 schema／ACL／19 policies／聚合與四列關閉的 seed |
| 新版 Preview 實際操作 | 舊部署仍 `005ce6e61562a1e5694b7537fbcbdb5d04eab5da`／`dpl_8XMZsnsSwHjMs9cFRRSqSYbm2Nn1`，不含雙模式核心。最新 core 的 createBrandAi 尚無 app route／工作台呼叫；安裝本身不等於品牌頁面可操作。先完成 schema 批准與既有工作台 owner 接線，才做一次必要新版 Preview，不能為只有 SQL 草稿的更新先付費重建 |
| HQ 三態／發布／預算／人工與多店實際驗收 | 清單已備：品牌 Hidden／Locked 拒絕、Enabled 仍受總停止／品牌開關、發布版本與引用、獨立日月額度／共用總額、人工靜默與稽核恢復、品牌與四店互不串資料。涉及狀態寫入或 Mock 時另外取得明確窗口；目前不執行 |
| UI／RWD | 本輪無畫面變更；後續沿用現有 Settings／知識／人工元件，驗桌機、iPad 橫直、窄容器及原六尺寸，不另造工作台。不能以本機 fixture 充當 Preview 可操作證據 |

通行連結、測試登入、開關變動及任何外發未建立或執行。新 Preview 沒有建立，因目前缺 schema 與品牌操作入口，先建無法完成目標驗收；目前待批准事項不是操作失敗後的繞路方案。

## Cloudflare 獨立待查

前一工程 head `342cc3afa` 的 `Workers Builds: steamfoot-booking` 為 failure，Build ID `c851b6d6-f22e-4ea6-bbb4-996d91356078`，GitHub check ID `139838942367`；output 只有控制台連結，沒有可判讀的失敗原因。[現有隔離守衛](../../scripts/ai-digital-butler-preview-scope.mjs)刻意拒絕 Cloudflare claim，不能據此斷言那就是這次平台建置失敗的根因。獨立待查內容為取得該 build log、核對支線／來源 SHA／建置環境與實際失敗步驟。未改 Workers／Production 部署設定，未修復、未忽略為全綠，也不將其混同於 Vercel 品牌驗收。

原 PR 的最新階段摘要與 CI 狀態另記 PR metadata；此文件不宣稱尚未完成的遠端安裝／品牌平台驗收已通過。
