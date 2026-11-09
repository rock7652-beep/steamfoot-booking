# 調整堂數：Cloudflare 建置與正式發布路徑調查

2026-10-31；只讀調查，未修改正式設定、部署護欄、通知或 Cloudflare 關聯。

## 已證實

- PR #1476 head `5776a8649d9408d767d127ad0782c6472fae5d32` 的 GitHub Actions CI 及三組隔離 PostgreSQL 檢查皆成功；Workers Builds 檢查為 failure。
- 同一 Workers 檢查在原 main `2d9a4354b9d1f1036427581a74daacbc86b97246` 亦失敗；該 main 的 Vercel production deployment `dpl_AVPYwGx9ipT8ceh9rKzpykMXehvA` 為 READY。本功能不是這項平台失敗的首次觸發者。
- Vercel 專案 `prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR` 的正式網域清單包含已驗證的 `www.steamfoot.com` 與轉址至 www 的 `steamfoot.com`。
- 公開 DNS 查詢 `www.steamfoot.com` CNAME 為 `c38b887406feef5d.vercel-dns-017.com.`。正式後台登入路徑 `/hq/login` 的唯讀 HEAD 回應為 200，包含 `x-vercel-id` 與 `x-vercel-cache: HIT`。此證據確認本次網站發布路徑是 Vercel，不等於盤點過 Cloudflare 的全部路由、排程或其他服務。
- GitHub `/branches/main` 回傳 `protected: false`，`required_status_checks.contexts` 與 `checks` 均空、`enforcement_level: off`；repo rulesets 清單亦空。依本次可讀設定，Cloudflare 不是 main 必要的合併檢查。未放寬或更改任何分支規則。

## 程式層可重現的部署不相容

`next.config.ts:44` 呼叫 `assertReviewedReleaseEnvironment()`。正式發布判斷要求 Vercel production/main 與正確 repo metadata，並明確排除 `WORKERS_CI_BRANCH`／`CF_PAGES_BRANCH`（`scripts/sports-shared-card-preview-scope.mjs:76`）。未知環境落入 Preview 驗證，仍拒絕 Cloudflare metadata。

僅呼叫純驗證函式、不建立資料庫 client 的四個本機診斷案例：Cloudflare main、Cloudflare feature、混合 provider metadata 均拒絕；正確 Vercel production/main 回傳 `production`。前兩者錯誤為 `Sports shared-card branch requires VERCEL_ENV=preview with outbound notifications blocked.`。未改動護欄以讓另一平台建置通過。

此結果證明既有建置流程不接受 Cloudflare 環境，但**尚未證明它是該次遠端建置第一個失敗原因**。Cloudflare build `9eed3966-fe8d-4c87-b423-7d337f4bdc94` 的 GitHub check 只提供 dashboard URL，沒有錯誤日誌或 annotations；目前 runtime 沒有配置 Cloudflare credentials 或可讀取其建置日誌的工具。實際失敗階段仍未取得，不將推測標成已確認 root cause。

## 結論與合併前狀態

Cloudflare 自動建置屬既有獨立平台問題，不應繼續作為本次 Vercel 功能驗收或合併準備的通用阻擋。保留失敗紀錄；若另需維護、停用或轉移該 Worker，須先取得其實際建置／路由／排程設定，不能只憑官網 DNS 就刪除整合。

本次調查期間 main 已前進至 `9114df63dced135a8c069a7467ef7b09a9de02f0`，相對既有驗收基準新增 6 commits／18 個檔案，包含提醒介面、通知鈴聲、兩份操作指南來源及 Framework。不能將舊 main 上的通過結果冒稱已驗最新整合版本。下一步由助理核對這些差異與本 PR 的交集、整理同版合併驗收；本調查未合併正式站或發布。

## 整合追蹤

2026-10-31 接續核對上游 18 檔：17 個檔案可完整沿用 main，唯一直接交集是 `src/lib/operation-guide-catalog.ts`；該檔三方合併無衝突，保留兩側更新。本報告本身只記錄調查，不變更任何外部平台設定。
