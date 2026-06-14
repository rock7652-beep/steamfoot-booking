# 一次性 Vercel Migration 策略（當 prod 憑證鎖在 Vercel sensitive env 時）

> 狀態：**方案文件（Planning only）**，本文件不執行任何動作。
> 適用情境：要對 production 跑一支 migration，但**本機拿不到正式站現用 DB 憑證**時的安全處理模式。
> 觸發本案的具體任務：把 #295 的 `20260614_add_subscription_payment_method` 套到 prod，讓 #296「店家訂閱管理頁」可用。

---

## 1. 問題背景

正式站（Vercel production）目前**正在使用**的 `DATABASE_URL` / `DIRECT_URL` 指向 prod Supabase 專案 `qijlnhtpbintanzpxkvf`，但：

- **本機 `.env` 的 prod 憑證是舊的** → `prisma migrate status/deploy` 回 **P1000（authentication failed）**。
- **`vercel env pull --environment=production` 對 Sensitive 變數回傳空字串**（`DATABASE_URL=""`）——這是 Vercel 對 Sensitive/Encrypted env 的設計：值不可被 pull、Dashboard 通常也看不到。

→ 結論：**沒有可靠管道在本機取得正式站「現用」憑證**。能用這組憑證的，只剩 **Vercel build / runtime 環境本身**。

> 另一個現實：#296 程式已 merge 進 main 並已部署 prod，但 prod DB 還沒有 `paymentMethod` 欄位 →
> 正式站「設定 > 店家訂閱管理」目前可能因缺欄位報錯。其他頁面不受影響（additive、無人讀新欄位），
> 故「晚一點再上 migration」是可接受的，不需在壓力下臨時改 build 流程。

---

## 2. 為什麼不 reset DB password

- 正式站的 DB 密碼若在 Supabase reset，**Vercel production 的 env 不會自動同步** → 正式網站連線立刻失效。
- reset 是高風險、影響全站的動作，**不為了單一頁面的 migration 去 reset prod 密碼**。

---

## 3. 為什麼不使用 Supabase SQL Editor 手貼 SQL

- SQL Editor 直接執行 DDL 等同 `db execute`：**欄位會建好，但不會寫入 `_prisma_migrations`**。
- 結果是 **Prisma migration drift**：`prisma migrate status` 仍顯示該 migration 為 pending，未來 `migrate deploy` 會混亂/重複套用判斷錯誤。
- 違反專案鐵律「套 migration 一律用 `prisma migrate deploy`，禁 `db execute`」。
- 除非同時手動補一筆正確 checksum 進 `_prisma_migrations`（易錯）——**不採用**。

---

## 4. 方法 2：一次性 Vercel build migration 設計

核心：讓 **build 過程跑一次 `prisma migrate deploy`**，用 Vercel 本身持有的真實 prod 憑證（canonical migrate、無 drift），且**只跑一次、之後自動停**。

### 機制：guarded CI migrate 腳本 + 暫改 build 指令

`scripts/ci-migrate.mjs`（概念，尚未建立）：

```
1. 讀環境的 DATABASE_URL / DIRECT_URL，取 project ref（pooler user = postgres.<ref>）
2. if ref !== "qijlnhtpbintanzpxkvf"（非 prod，如 preview→staging）
      → log「skip（非 prod）」並 exit 0     # preview/staging 部署不會誤跑
3. 跑 `prisma migrate status`，解析 pending 清單
4. if pending !== 剛好 ["20260614_add_subscription_payment_method"]
      → exit 1（build 失敗、擋下部署）       # 只允許這一支
5. 否則 → `prisma migrate deploy`            # 只套 pending = 這一支
```

build 指令暫時改成：

```
node scripts/ci-migrate.mjs && prisma generate && next build
```

### 執行步驟（日後授權時才做）

1. **PR-加上**：新增 `scripts/ci-migrate.mjs` + 暫改 build 指令。Review。
2. **Merge PR-加上** → 觸發一次 production 部署 → build 跑 `ci-migrate`：
   - prod ref 通過 → pending 剛好那一支 → `migrate deploy` 套用 → build 繼續 → 部署 promote。
   - 同時的 preview 部署：ref = staging → 自動 skip。
3. **驗證**：該次 build log 顯示 `Applying 20260614…` / `All migrations applied`；正式站訂閱頁可開。
4. **PR-還原**：build 指令改回 `prisma generate && next build`（腳本可刪或留著不接）。Merge → 之後部署不再跑 migrate。

---

## 5. 如何只跑 `20260614_add_subscription_payment_method`

- `prisma migrate deploy` **本來就只套 pending**；當下唯一 pending 即這支。
- 保險：腳本第 4 步**斷言 pending 必須剛好等於這一支**，否則 build 失敗、擋下部署 → 不會誤套其他 migration。

---

## 6. 如何避免變成「每次 deploy 都跑 migrate」

- **主要**：步驟 4 **還原 build 指令** → 還原後 build 完全不含 migrate，回到原狀（差別於常態化的 B1）。
- **替代**：改用 env flag `RUN_DB_MIGRATE=1` 閘門（設一次、跑完移除）；但這會動到 Vercel env，**還原 build 指令的做法不碰 Vercel env，較乾淨**，故為首選。

---

## 7. Stop / Rollback 條件

**Stop（任一 → build 失敗 → 該次部署不會 promote）**：

- ref ≠ prod（`qijlnhtpbintanzpxkvf`）→ skip（非失敗，只是不跑）
- pending ≠ 剛好那一支 → build fail
- `migrate deploy` 報錯（auth / 連線 / SQL）→ build fail

**Vercel 天然安全網**：

- build 失敗 → 新部署**不會上線**，正式站**繼續服務上一個成功部署** → 不會出現「半套壞掉的版本上正式站」。

**DB 層 / Rollback**：

- Postgres DDL 在 migrate 內具交易性；本 migration additive，要嘛全套要嘛沒套。
- 欄位 nullable，留著也不影響舊流程 → **優先「停 + 回報」，不急著 rollback**；真要還原才手動 `DROP COLUMN` / `DROP TYPE` / `DROP INDEX`。

---

## 8. 優點與風險

**優點**

- ✅ prod 憑證全程不離開 Vercel（最安全，無人需要「取出」密碼）
- ✅ canonical `prisma migrate deploy` → **無 drift**
- ✅ 只跑一次、git 可審計、可還原、**不變成常態**
- ✅ preview/staging 自動 skip；只套這一支；順序自動正確（migrate 在 build 內，先於新部署上線）

**風險 / 取捨**

- 需要 **2 支小 PR**（加上 + 還原）的來回，比「本機一條指令」多幾步。
- PR-加上 與 PR-還原 之間若有其他 prod 部署，也會跑 migrate（idempotent，已套 → no-op，無害）。
- 過程暫改 build 指令，但**還原後完全回原狀**。

---

## 9. 未來若採用：兩支小 PR

| PR | 內容 | 效果 |
|---|---|---|
| **PR-加上** | 新增 `scripts/ci-migrate.mjs`（guarded）+ build 指令暫改為 `node scripts/ci-migrate.mjs && prisma generate && next build` | merge 觸發的 prod 部署套用該 migration |
| **PR-還原** | build 指令改回 `prisma generate && next build`（腳本可刪） | 之後部署不再自動 migrate |

> 兩支都要 review；先確認 PR-加上 的腳本 guard 正確，再 merge；migration 套用、正式站驗證完成後，立即進 PR-還原。

---

## 對照與前置

- 本機有現用 prod 憑證時的最小做法 → 見 `docs/store-subscription-prod-deploy-runbook.md`（guarded 本機 `migrate deploy`）。
- 訂閱系統憲法 → `docs/store-subscription-planning.md`（v2）。
- 本案 migration：`prisma/migrations/20260614_add_subscription_payment_method/`（純 additive：`CREATE TYPE` + `ADD COLUMN`×2 + `CREATE INDEX`×2）。
