# 品牌 AI 實際操作隔離驗收：2ed0b8e5a

2026-11-26，原 PR #1596，Draft。**本輪未通過完整操作驗收；已依失敗即回復要求完成清理。** 沒有第二次建置、沒有擴權或繞過觸發器，Production／正式 Webhook／Cloudflare 設定未變。

## 本輪實際範圍與時間

- 唯一部署 `dpl_mvHSpqtSFAH3Gvaw38GXimHbPBXV`，READY，來源 `2ed0b8e5ae72fc016054b4b8b12a0daa491d115d`；原 Vercel project `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR`／原支線，target=null。網址 `https://steamfoot-booking-ecrcg7s0a-rock7652-2111s-projects.vercel.app`，通行連結已撤銷，不公開 secret。
- 固定窗口台灣時間 **22:57:44–23:27:44**（UTC 14:57:44.290–15:27:44.290），包含建置，未延長。建置 22:58:31 建立、23:03:23 READY。最初 API 請求的 `target:preview` 被 400 參數驗證拒絕、未建立部署；移除該參數後才產生唯一一個 Preview，沒有重複建置。
- 只有 steamfoot-preview `ttworfzgwejdeolegkxl`。開始前核對 ACTIVE_HEALTHY、既有角色非 super／非 bypass、membership0、connlimit8、原期限不變；總停止 true、四店 off、品牌 HIDDEN/off/未發布。支線外發封鎖1、美業通知0，兩個臨時寫入 env 原先不存在。
- 透過官方 CLI 補足精確刪除 env 的管道；不使用 TinyFish 付費自動化。瀏覽器使用暫時 mount 的獨立 NSS 信任庫，嚴格 TLS，沒有永久改信任庫或略過憑證錯誤。
- 原合成 ADMIN，**本輪成功登入1次**，原先2筆加本輪累積3筆；未重試。原四條登入 RLS + 兩條稽核 RLS 在單一交易安裝，AuditLog 僅13欄 INSERT，核對政策6／欄位13；沒有新增角色。
- 唯一新部署的唯一 share link，請求 ttl=1432秒，取建立當時剩餘窗口，不設永久連結；失敗後立即撤銷、不再生。

## 通過、失敗與未執行

| 範圍 | 本輪實際結果 |
| --- | --- |
| HQ HIDDEN／LOCKED／ENABLED | 實際切換、重載及固定主體核對通過。HIDDEN／LOCKED 全部 mutation capabilities=false；ENABLED 且總停止時可以管理資格、不能測試或啟用 |
| 權限與來源 | 未登入 API403、Store 查詢覆寫400、review 夾帶 Store403、偽造 handoff viewKey403、真實 provider 參數403；未呼叫 OpenAI |
| 總停止 | ENABLED 且停止時，啟用遭拒。僅於正向 Mock 準備時由管理通道暫解 TEST 停止，四店全程 off；約62秒後因失敗回復停止 |
| 品牌獨立開關 | **失敗**。點「開啟測試」後出現「品牌操作尚未確認…」，30秒等待成功狀態逾時。實際 DB enabled=false／設定revision1，未假成功 |
| 知識新增／編輯／審核／發布／撤回 | 正向操作階段尚未到達；成功異動0、knowledgeRevision0／未發布。三態下的違法寫入拒絕不等於完整知識操作通過 |
| Mock／最新知識版本引用 | 未執行；新 Request0、Provider呼叫0 |
| 未知轉人工／接手／恢復 | 未執行；成功恢復0 |
| 用量／預算／成本 | 拒絕提高額度的輸入；原配置及帳本未改。沒有正向用量增量或付費預算驗收；不能用0筆活動宣稱完整通過 |
| 稽核與失敗一致性 | 管理通道設定／三態／解鎖／回復共5筆AuditLog保留；失敗品牌開關沒有留下設定修訂或部分成功的業務異動 |
| UI／RWD | 本輪桌機1366×900三態及錯誤畫面有實證；六尺寸操作迴圈尚未到達。先前 b72 唯讀六尺寸及本機六尺寸證據保留，不能混稱本輪六尺寸寫入通過 |

[實際瀏覽器報告](../../artifacts/ai-digital-butler/brand-management/operations-2ed/hosted.json) · [失敗畫面](../../artifacts/ai-digital-butler/brand-management/operations-2ed/failure.png) · [三態截圖](../../artifacts/ai-digital-butler/brand-management/operations-2ed/)

## 阻擋定位與本機修正

唯讀 pg_trigger／pg_proc 檢查顯示既有 AuditLog 上有 `stamp_verified_audit_actor`，它以 SECURITY INVOKER 呼叫 `public.redact_audit_json(jsonb,integer)`；runtime 對該去識別化 helper 的 EXECUTE=false。原本機簡化表沒有掛這個既有觸發器，因此原測試漏掉相依權限。Vercel error-level 查詢未取得底層錯誤日誌；不宣稱其他潛在問題已全部排除。

本機改為載入既有 `20261007002000_verified_audit_actor` migration 的真實觸發器／helper：撤銷 helper EXECUTE 時，實際 PostgreSQL 引擎回報 `permission denied for function redact_audit_json`，業務修訂與AuditLog均回滾；只在本機套用待審的一函式GRANT後，操作及可信 actor stamp通過；再REVOKE後拒絕。這證實此缺權限本身就是寫入阻擋，並非只憑UI逾時推測。

本輪回復後才做的程式修正（**未部署**）：

1. 每筆品牌異動交易先核對既有去識別化 helper 能力，缺少即以 `AI_BRAND_AUDIT_NOT_READY` 提前拒絕，UI明示「安全稽核尚未就緒，本次未儲存」，不洩露SQL或秘密。
2. 限時寫入建置的唯讀前檢也核對 helper EXECUTE。實際本輪建置日誌沒有 npm prebuild／ai-brand-preflight 記錄，不能聲稱該Hook已執行；修正為在原AI支線 `ci-migrate` 的免migration分支明確呼叫前檢，防止Hosting略過npm prebuild。其他支線不變，仍不安裝schema。
3. 測試納入真實audit trigger與verified actor context、最小13欄INSERT、缺helper回滾、待審SQL的本機GRANT／REVOKE及真正build dispatcher的拒絕案例。

## 新增最小權限提案：未批准、未安裝

[精確GRANT草稿](../../scripts/sql/ai-digital-butler/brand-operations-review/audit-helper-acl.proposed.sql)只新增既有隔離角色對 **一個純JSON去識別化函式**的EXECUTE；guard核對角色／membership、原先無權、SECURITY INVOKER與完整已審函式body、最多30分鐘的安裝窗口。不授權任意函式、不給營運表額外SELECT、不改觸發器、不改為SECURITY DEFINER、不停用RLS。Postgres GRANT本身沒有到期功能，必須依[REVOKE草稿](../../scripts/sql/ai-digital-butler/brand-operations-review/audit-helper-revoke.proposed.sql)收尾撤銷；它不是自動到期權限。

**本輪只有原13欄INSERT授權，故沒有把這項新GRANT套用雲端。** 後續仍須重新明確批准這項增量權限與新的單次驗收窗口／必要新版Preview／連結／登入，才能續做正向流程；原窗口已因失敗清理結束，不能重用授權或為延長窗口重建。

## 已完成安全回復

- global stopped=true，四店 off。品牌 HIDDEN／false／未發布，設定revision1、知識revision0；沒有重置修訂。
- 原 ADMIN SUSPENDED／passwordHash=NULL／updatedAt更新，全部六條短效policy移除，新增13欄INSERT已撤銷；原DB角色有效期仍2026-12-02T14:15:52Z。
- 原cookie在未重新登入下請求品牌API **403**；session **200且無user.id**。不是只從DB狀態推定失效。
- Share revoke回傳剩餘 **0**；全新cookies帶舊連結得到 **302部署保護**，嚴格TLS通過。
- 官方CLI精確移除兩個原支線寫入env，再列metadata確認不存在；CLI logout成功、auth.json不存在，隨後刪除私有密碼／hash／cookies／設定檔、一次性NSS與CLI設定目錄。
- Brand Request0，Store Request53／Dispatch113未變；原全域2690 micros／concurrent0未變；保留5筆管理AuditLog、登入稽核及migration歷史。

[DB與權限清理對帳](../../artifacts/ai-digital-butler/brand-management/operations-2ed/cleanup.json) · [舊session HTTP](../../artifacts/ai-digital-butler/brand-management/operations-2ed/hosted.json) · [撤銷連結HTTP](../../artifacts/ai-digital-butler/brand-management/operations-2ed/share-probe.json)

## 成本及保留事項

本輪 **1次建置／1次成功登入／0次Mock／0次真實OpenAI／0次真實通路外發**。新增OpenAI費用US$0；單次Vercel建置費用無法精確估算，沒有重建。新helper GRANT僅本機試驗，不計雲端安裝。

PR維持Draft，沒有合併。六通路LINE／Messenger／Instagram／WhatsApp／官網／Email規格保留，不擴本輪開發；Cloudflare Workers Builds失敗另案列管，未改正式設定。後續本機與CI最終數字更新原PR，和本輪實際部署2ed的雲端證據分開。

本輪回復後修正的本機驗證：TypeScript（6GB heap）通過，ESLint 0 errors（ci-migrate既有6 warnings保留）；相關AI／權限／導覽 **492 passed／6 skipped**，包含真實觸發器及build dispatcher回歸。這些是修正版本機結果，不冒充2ed部署已通過。
