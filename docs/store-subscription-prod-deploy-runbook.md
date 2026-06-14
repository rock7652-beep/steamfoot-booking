# 店家訂閱管理 — Production 部署 Runbook

> 用途：把 #295（schema additive 擴充）+ #296（店家訂閱管理頁）推上正式站的安全流程。
> 也作為**日後每次正式站 migration / deploy 的通用範本**（guarded migrate + smoke + stop 條件）。
>
> **鐵律**：migration **先於** deploy；只用 `prisma migrate deploy`，**不用** `db execute`；
> 每一步確認後才下一步，**不自動連跑整條**；prod 連線一律走機器上的 `.env`（已是 prod）+ guard，
> **不接 chat 內貼的連線字串**。

---

## 環境對照（重要）

| 檔案 | 讀取者 | Supabase project ref | 判定 |
|---|---|---|---|
| `.env` | **Prisma CLI 預設** / 一般 runtime | `qijlnhtpbintanzpxkvf` | **PROD** |
| `.env.staging.local` | 需顯式指定 | `ttworfzgwejdeolegkxl` | STAGING |
| `.env.local` | `next dev`（覆蓋 `.env`） | `localhost:5432/steamfoot` | 本機 |

> ⚠️ `prisma migrate deploy` 預設讀 `.env` → 直接打 **prod**。動 migrate 前一律先驗 project ref。
> 辨識 ref：pooler user = `postgres.<ref>`；直連 host = `db.<ref>.supabase.co`。

**部署標的**：#295 migration `20260614_add_subscription_payment_method` + #296 管理頁
**main commit**：`8148ef4`（或更新）
**prod project ref**：`qijlnhtpbintanzpxkvf`

---

## 0. 前置（授權 + 環境確認）

- [ ] 已取得「prod 部署」**明確授權**
- [ ] `.env` 的 DATABASE_URL / DIRECT_URL project ref = `qijlnhtpbintanzpxkvf`（prod）
- [ ] prod DB 憑證有效

---

## 1. Prod migration 前檢查

- [ ] **project ref = `qijlnhtpbintanzpxkvf`**（guard 會驗）
- [ ] **pending migration 只有一筆** = `20260614_add_subscription_payment_method`
- [ ] **migration SQL 為純 additive**：只有 `CREATE TYPE` / `ADD COLUMN`(nullable) / `CREATE INDEX`
- [ ] **無** `DROP` / `RENAME` / `NOT NULL` / `ALTER COLUMN`
- [ ] 只用 `prisma migrate deploy`，**不用** `db execute`

預期 SQL（已 review，與 staging 套的同一支）：

```sql
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD');
ALTER TABLE "StoreSubscription" ADD COLUMN "paymentMethod" "SubscriptionPaymentMethod",
ADD COLUMN "updatedBy" TEXT;
CREATE INDEX "StoreSubscription_expiresAt_idx" ON "StoreSubscription"("expiresAt");
CREATE INDEX "StoreSubscription_billingStatus_idx" ON "StoreSubscription"("billingStatus");
```

---

## 2. Prod migration 執行步驟

> 從 latest `origin/main`（含 #295/#296）的乾淨 checkout 執行。`.env` 即 prod，但仍用 guard 顯式確認。

**(a) Guarded read-only status**（先看，不寫）：

```bash
PROD_DB=$(grep -E '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')
PROD_DIRECT=$(grep -E '^DIRECT_URL=' .env | sed -E 's/^DIRECT_URL=//; s/^"//; s/"$//')
ref_of(){ echo "$1" | sed -E 's#.*://postgres\.([a-z0-9]+):.*#\1#'; }
EXPECT="qijlnhtpbintanzpxkvf"; STG="ttworfzgwejdeolegkxl"
[ "$(ref_of "$PROD_DB")" = "$EXPECT" ] && [ "$(ref_of "$PROD_DIRECT")" = "$EXPECT" ] || { echo "❌ ABORT: not prod"; exit 1; }
printf '%s%s' "$PROD_DB" "$PROD_DIRECT" | grep -q "$STG" && { echo "❌ ABORT: staging ref present"; exit 1; }
DATABASE_URL="$PROD_DB" DIRECT_URL="$PROD_DIRECT" npx prisma migrate status
```

- [ ] 輸出顯示 pending **只有** `20260614_add_subscription_payment_method`（若 ≠ 1 筆 → **停**）

**(b) Guarded deploy**（同 guard，通過才 deploy）：

```bash
DATABASE_URL="$PROD_DB" DIRECT_URL="$PROD_DIRECT" npx prisma migrate deploy
```

- [ ] 輸出：`Applying migration 20260614_add_subscription_payment_method` → `All migrations have been successfully applied.`

**(c) Post-status 確認**：

```bash
DATABASE_URL="$PROD_DB" DIRECT_URL="$PROD_DIRECT" npx prisma migrate status
```

- [ ] 輸出：`Database schema is up to date!`（無 pending）

> 註：Prisma client 查詢若要連 prod，用 pooler URL（`.env` 的 DATABASE_URL，:6543 pgbouncer）；
> migrate 走 DIRECT_URL（:5432 session）。

---

## 3. Vercel production deploy

- [ ] 確認要部署的 **main commit = `8148ef4` 或更新**
- [ ] **順序**：先確認步驟 2 已 `up to date`，**才** 觸發 / 放行 prod 部署（欄位先存在，頁面才不會炸缺欄位）
- [ ] 觸發 Vercel production 部署
- [ ] 等部署 **Ready**（確認看的是 production deployment 的 `githubCommitSha = 8148ef4…`，不是只看 alias）

---

## 4. 正式站 smoke test（steamfoot.com）

- [ ] 以 **OWNER** 登入
- [ ] 進入 **設定 > 店家訂閱管理**，頁面正常開啟（prod 目前應只有竹北 1 店）
- [ ] 列表正常顯示（竹北「尚未建立訂閱」或既有狀態）
- [ ] **建立**一筆訂閱（竹北）：plan / billingCycle / 起始日…
- [ ] **編輯** `paymentMethod`、`billingStatus` → 儲存成功、列表更新
- [ ] **年繳日期輔助**：起始 2026-07-01 →「依週期帶入」得 2027-08-31（月繳 → 當月底前一天）
- [ ] 確認 **`Store.plan` 未被更動**（竹北方案不變）
- [ ] 確認 **`UpgradeRequest` 未受影響**（升級申請頁數量 / 內容不變）
- [ ] **測試資料處理**：
  - 若這筆是竹北的**真實訂閱**（金額 / 付款屬實）→ 保留，note 註明來源
  - 若純測試 → note 標記「測試，待刪」，或用 guarded 腳本（EXPECT = prod ref）`storeSubscription.delete({ where: { id } })` 清除（不碰 Store / UpgradeRequest）

---

## 5. Rollback / Stop 條件（任一觸發 → 立即停止並回報）

- 🛑 project ref ≠ `qijlnhtpbintanzpxkvf`（guard abort）
- 🛑 pending migration **不只一筆**，或不是 `20260614_add_subscription_payment_method`
- 🛑 migration SQL 出現 `DROP` / `RENAME` / `NOT NULL` / `ALTER COLUMN`
- 🛑 `migrate deploy` 任何錯誤（auth / 連線 / SQL）
- 🛑 正式站頁面報錯（error boundary / 缺欄位 / 500）

**Rollback 注意**：本 migration 純 additive，最壞情況可手動 `DROP COLUMN` / `DROP TYPE` / `DROP INDEX` 還原，
但**先停下回報、不自行 rollback**；新欄位 nullable，留著也不影響舊流程，
通常「停 + 不前進」比急著 rollback 更安全。

---

## 附錄：本流程的由來（沉澱的經驗）

- staging 部署時發現：預設 `.env` 指向 **prod**（不是 staging），且 staging 憑證一度失效；
  靠「project ref 硬 guard」擋下兩次差點誤打 prod 的情況 → 故本 runbook 每個 migrate 動作都先驗 ref。
- #295 / #296 已在 staging 完整驗證（data-layer 11/11 PASS：列表 / 建立 / 編輯 /
  paymentMethod / billingStatus / 年繳日期 / 不動 Store.plan / 不影響 UpgradeRequest）。
- 相關文件：`docs/store-subscription-planning.md`（憲法 v2）。
