# PR-F2 LINE account-mismatch 修復計畫（read-only design，不執行）

> 本文件只是 **修復策略設計**。本 PR 不執行修復、不寫 DB、不 migration、不 db push、不改任何業務邏輯。實際 repair script 由後續 sub-PR 一筆一支提出，並依本文件規範執行。

## 🚦 Code 開工通行證（最上面一定要看完）

### 五個拍板決策（不要再回頭問）

1. **PR-F2 只設計 + 撰寫 dry-run repair script 框架**。任何 `--apply` 寫入動作必須在後續 sub-PR、且通過 reviewer + 店長雙簽後才能對 prod 執行。
2. **一筆 mismatch = 一支 repair script + 一個 PR**（沿用 chenjiajia / 周雅琴 / 吳曉菁 SOP）。**禁止 loop over candidates**。
3. **不新增任何 schema / migration**。repair log 沿用既有 `AuditLog` model（`beforeJson` / `afterJson`），完全相容。
4. **不碰 LINE OAuth / LIFF / webhook bind-code / wallet / booking 業務邏輯**。本 PR 唯一允許寫入的對象：`Account.userId`、`Customer.{mergedIntoCustomerId, mergedAt, userId, selfBookingEnabled, lineLinkStatus}`、`User.status`、`AuditLog`。
5. **第 3 筆 `needs_manual_business_check` 在店長書面確認、業務簽核之前，PR-F2 一律不動**。

### 絕對禁區（任何一條被踩到 → reviewer 直接退件）

* ❌ 修改 `prisma/schema.prisma`，跑 `prisma migrate` / `db push` / `db reset`
* ❌ 修改 `src/lib/auth.ts`、LIFF 路由、webhook bind-code、`bindLineToCustomerInStore`、`resolveLineLogin`、`finalizeLineBind`、`line-bind-log.ts`
* ❌ 修改 `CustomerPlanWallet` / `WalletSession` / `Booking` / `Transaction` 任何 row（包含 `customerId` 重新指向）
* ❌ 對「方向相反」「雙邊都有經濟足跡」「跨店」「FK 異常」這幾型 mismatch 套用任何自動 repair
* ❌ 在 repair script 內 `loop` 多筆 customer / 自動掃描 candidates / 廣播通知 LINE / Email
* ❌ 把 PR-F1.2 audit script 改成可寫入版本（PR-F1.2 read-only 契約測試必須持續通過）

### PR-F2 只做這 4 件事

1. **本文件** — repair plan 設計（你正在讀的）。
2. **per-record dry-run repair script 框架**：`scripts/repair-line-mismatch-<canonicalShortId>.ts`，DRY RUN default、`--apply` 才寫入；每支 script 只處理一個明確的 `CANONICAL_CUSTOMER_ID`。
3. **invariants checklist**（§2）— script pre-flight 必須跑完 13+ 條全部 PASS 才繼續。
4. **rollback script 框架**：`scripts/rollback-line-mismatch-<canonicalShortId>.ts`，與 repair 對稱，DRY RUN default、`--apply` 才執行。

> 後續 sub-PR（PR-F2.1 / PR-F2.2 ...）才在框架內填入該筆的 6 個 ID 常數，並走 review → dry-run review → apply。

---

## 0. 背景與 prod 現況

PR-F1（#218）完成 LINE binding observability，PR-F1.1（#219）補 triage，PR-F1.2（#220）做 repair-decision audit 並加入 cross-store guard。最新一次 `npx tsx scripts/diagnose-line-mismatch-repair-audit.ts --store=zhubei` 結果：

| 分類 | 數量 | 處理路徑 |
| --- | --- | --- |
| `needs_customer_merge` | 2 | 本 PR 設計安全修復流程（§1） |
| `needs_manual_business_check` | 1 | 等店長書面確認後再評估（§5） |
| `safe_reassign_account_only` | 0 | n/a |
| `do_not_touch` | 0 | n/a |

**重要前提**：因為 PR-F1.2 cross-store guard 已上線，這 2 筆 `needs_customer_merge` 必定 `crossStoreLineUserCount === 1`（同 lineUserId 只出現在 zhubei 單店）。否則 audit 會自動 downgrade 到 manual。本 PR-F2 設計仍會在 pre-flight + in-tx 雙重 re-check 這個條件做 defence-in-depth。

---

## 1. `needs_customer_merge` 安全修復流程（2 筆）

這 2 筆是 chenjiajia 模式：`customer.user` 側是主帳號（有經濟足跡），`account.user` 側掛了一筆 `_oauth_line_*` placeholder 空殼 Customer。修復目標：把 LINE `Account` 搬回主 User，並收尾空殼 Customer + 孤兒 User。

### 1.1 修復目標（一筆共 4 個 DB write + 多筆 AuditLog）

| # | 對象 | 欄位 | 從 → 到 |
| --- | --- | --- | --- |
| W1 | `Account[id=LINE_ACCOUNT_ID]` | `userId` | `PLACEHOLDER_USER_ID` → `CANONICAL_USER_ID` |
| W2 | `Customer[id=PLACEHOLDER_CUSTOMER_ID]` | `mergedIntoCustomerId` / `mergedAt` / `userId` / `selfBookingEnabled` / `lineLinkStatus` | `null/null/PLACEHOLDER_USER_ID/?/?` → `CANONICAL_CUSTOMER_ID / now() / null / false / UNLINKED` |
| W3 | `User[id=PLACEHOLDER_USER_ID]` | `status` | `ACTIVE` → `SUSPENDED` |
| W4 | `AuditLog` × 4 | — | 新增 4 筆（W1/W2/W3 各一 + 1 筆 summary） |

> **不**動 `Customer[canonical]` 任何欄位、**不**動既有的 `Booking` / `Transaction` / `CustomerPlanWallet` 任何 row、**不**改 `Account` 其他欄位。

### 1.2 流程（per-record，全部在一支 script 內）

```
[1] 載入硬編碼常數（6 個 ID + canonical phone + canonical storeSlug）
        ↓
[2] 印出 DATABASE_URL host（只 hostname:port + db 名；不印帳密）
        ↓
[3] Pre-flight（read-only，outside tx）
      - 跑 §2 全部 invariants
      - 任何一條 FAIL → process.exit(1)，印出失敗的 invariant 名稱與觀察到的值
        ↓
[4] 印出【Plan】(masked)：4 個 write 的 from→to
        ↓
[5] 若 --apply 沒帶 → 印 "DRY RUN — 沒有寫入" → exit 0
        ↓
[6] $transaction (Serializable):
      6a) in-tx 再跑一次 §2 全部 invariants（防 race）
      6b) 寫 AuditLog summary row（先寫，拿到 id）
      6c) W1 Account.update + 寫 AuditLog reassign row
      6d) W2 Customer.update + 寫 AuditLog merge row
      6e) W3 User.update + 寫 AuditLog suspend row
      6f) 任何 step 失敗 → throw → 整筆 rollback（含 AuditLog）
        ↓
[7] Post-apply verify（outside tx，read-only）
      - 再 read 4 個 row，確認 == afterJson
      - 印出 verify 結果 + summary AuditLog.id
```

**為什麼這個順序**：

* Pre-flight 在 tx 外是為了快速失敗（dry-run 時也跑完整 check）；in-tx 再跑一次是因為 dry-run 到 apply 之間可能有 race（顧客在這段時間又 LINE 登入會動 `Account.userId`、店家在後台改了 `lineLinkStatus` 等）。
* AuditLog summary 先寫拿到 id，後續 3 筆 detail row 在 `extra` / `beforeJson` 連回 summary id，rollback 時用 summary id 撈出整組 4 筆。
* W1 → W2 → W3 順序刻意：先搬 Account（讓後續 LINE 登入指向正確 User），再收尾空殼 Customer，最後停權孤兒 User。如果有任何 step throw，整個 $transaction rollback，DB 回到 pre-state。

### 1.3 為什麼一筆一支 script

* **可審計**：reviewer 看 PR diff 就能看到該筆完整 6 個 ID 常數，不用回去查 audit 輸出。
* **可獨立 rollback**：每筆有自己的 rollback script，不影響其他筆。
* **失敗不擴散**：第 1 筆失敗不會影響第 2 筆執行；第 2 筆需要重新 review。
* **沿用既有 SOP**：陳佳佳、周雅琴、吳曉菁三筆 LINE drift 修復都是一筆一支。

> 建議 sub-PR 命名：`PR-F2.1 — repair line-mismatch <canonicalShortId-1>`、`PR-F2.2 — repair line-mismatch <canonicalShortId-2>`。

---

## 2. 必須成立的 invariants（共 19 條；任何一條失敗即 abort）

下列 invariants 在 **pre-flight（outside tx）** 與 **in-tx** 兩個地方都跑一次。每條都帶名字，失敗時印 `ABORT invariant=<name> observed=<masked value>`。

組成：§2.1 身份 13 條 + §2.2 footprint 4 條 + §2.3 cross-store 1 條 + §2.4 idempotency 1 條 = **19 條**。

### 2.1 身份 invariants（13 條）

| ID | 條件 |
| --- | --- |
| **I1** | `Customer[CANONICAL_CUSTOMER_ID].userId === CANONICAL_USER_ID` |
| **I2** | `Customer[CANONICAL_CUSTOMER_ID].lineUserId === LINE_USER_ID` |
| **I3** | `Customer[CANONICAL_CUSTOMER_ID].lineLinkStatus === "LINKED"` |
| **I4** | `Customer[CANONICAL_CUSTOMER_ID].phone === CANONICAL_PHONE`（鎖死預期值；防 ID 被誤改套到別人身上） |
| **I5** | `Customer[CANONICAL_CUSTOMER_ID].mergedIntoCustomerId === null` |
| **I6** | `Customer[PLACEHOLDER_CUSTOMER_ID].userId === PLACEHOLDER_USER_ID` |
| **I7** | `Customer[PLACEHOLDER_CUSTOMER_ID].mergedIntoCustomerId === null` |
| **I8** | `Customer[PLACEHOLDER_CUSTOMER_ID].lineUserId === null`（必須為 null，否則 W2 會踩 `uq_store_customer_line` 衝突） |
| **I9** | `Customer[PLACEHOLDER_CUSTOMER_ID].storeId === Customer[CANONICAL_CUSTOMER_ID].storeId` |
| **I10** | `Customer[PLACEHOLDER_CUSTOMER_ID].phone.startsWith("_oauth_line_")` |
| **I11** | `Account[LINE_ACCOUNT_ID].provider === "line" && providerAccountId === LINE_USER_ID && userId === PLACEHOLDER_USER_ID` |
| **I12** | `User[PLACEHOLDER_USER_ID].passwordHash IS NULL`（純 OAuth placeholder） |
| **I13** | `User[PLACEHOLDER_USER_ID].status !== "SUSPENDED"`（防重跑） |

### 2.2 Footprint invariants（4 條）

> 沿用 PR-F1.2 audit 同一組 count 結果；apply 前必須再驗一次，因為 dry-run 到 apply 之間可能有預約 / 交易進來。

| ID | 條件 |
| --- | --- |
| **F1** | Canonical 側 `booking.count({customerId: CANONICAL_CUSTOMER_ID}) >= 1` |
| **F2** | Canonical 側 `transaction.count({customerId: CANONICAL_CUSTOMER_ID}) >= 1 OR customerPlanWallet.count({customerId: CANONICAL_CUSTOMER_ID, status: "ACTIVE"}) >= 1` |
| **F3** | Placeholder 側 **全 0**：`booking / customerPlanWallet / walletSession (via wallet.customerId) / transaction / pointRecord / messageLog / checkinPost / makeupCredit` 對 `PLACEHOLDER_CUSTOMER_ID` count 全 === 0；以及 `customer.count({sponsorId: PLACEHOLDER_CUSTOMER_ID}) === 0` 與 `referral.count({referrerId: PLACEHOLDER_CUSTOMER_ID}) === 0` |
| **F4** | `account.count({userId: PLACEHOLDER_USER_ID, NOT: {id: LINE_ACCOUNT_ID}}) === 0`（孤兒 User 不能還掛其他 OAuth Account，例如 Google） |

### 2.3 Cross-store invariant（1 條，defence-in-depth）

| ID | 條件 |
| --- | --- |
| **X1** | `customer.findMany({where: {lineUserId: LINE_USER_ID, mergedIntoCustomerId: null}, distinct: ["storeId"]}).length === 1`（同一 lineUserId 在未合併 Customer 中只出現在 1 店） |

> PR-F1.2 audit 通過 cross-store guard 才會給 `needs_customer_merge`，所以這條理論上必過。但 audit 到 apply 之間有時間差，必須在 pre-flight + in-tx 雙重 re-check。

### 2.4 冪等 invariant（1 條）

| ID | 條件 |
| --- | --- |
| **A1** | **沒有「未 rollback 的 APPLY」**：對這筆 canonical Customer，每一筆 `auditLog{targetType:"Customer", targetId: CANONICAL_CUSTOMER_ID, action:"LINE_MISMATCH_REPAIR_APPLY"}` 都必須有一筆對應的 `auditLog{action:"LINE_MISMATCH_REPAIR_ROLLBACK"}` 在 `beforeJson.summaryRef.id` 引用該 APPLY 行的 `id`（§6.4 W4' 寫入的結構）。等價：`activeApplyCount === 0`，其中 `activeApply = applyRows − rolledBackApplyIds`。 |

> Pre-flight pseudocode（**不是** PR-F2.0 要寫的 code，僅給 sub-PR repair script 作模板）：
>
> ```
> const applyRows = await auditLog.findMany({
>   where: { targetType: "Customer", targetId: CANONICAL_CUSTOMER_ID,
>            action: "LINE_MISMATCH_REPAIR_APPLY" },
>   select: { id: true },
> });
> const rollbackRows = await auditLog.findMany({
>   where: { targetType: "Customer", targetId: CANONICAL_CUSTOMER_ID,
>            action: "LINE_MISMATCH_REPAIR_ROLLBACK" },
>   select: { beforeJson: true },
> });
> const rolledBackApplyIds = new Set(
>   rollbackRows
>     .map((r) => r.beforeJson?.summaryRef?.id)   // shape per §6.4 W4'
>     .filter(Boolean),
> );
> const activeApply = applyRows.filter((a) => !rolledBackApplyIds.has(a.id));
> // A1 ⇔ activeApply.length === 0
> ```

#### A1 規則細節（PR #221 Codex P2 v2 修正）

* **AuditLog 是 append-only**：rollback **不**刪除、**不**修改既有的 `LINE_MISMATCH_REPAIR_APPLY` 行（也不動 `L1..L3` 任何 detail 行）。它只新增一筆 `LINE_MISMATCH_REPAIR_ROLLBACK`，並在其 `beforeJson.summaryRef.id` 引用被它關閉的 APPLY 行 id。這條規則確保稽核完整性，rollback 不會抹除歷史。
* **「沒被修過」與「修過但已 rollback」是兩種不同的合法狀態**：前者代表初次 apply；後者代表先前 apply 已 rollback、目前 DB row 已回到 pre-repair 狀態（包含 §6.4 W3' 把 placeholder `User.status` 還回 `ACTIVE`）。兩者都通過 A1。**只有「修過且未 rollback」**會 ABORT。
* **不要用** `count(... action: "LINE_MISMATCH_REPAIR_APPLY") === 0` 這種舊寫法 — 那會把已 rollback 的 APPLY 也算成「未關閉」，rollback 之後該筆永遠無法再 pass pre-flight，違反「rollback 真的把狀態還原」的設計約定。

#### 重跑 (re-repair after rollback) 准入條件

完成一次 rollback 之後，可以再對同一筆 canonical Customer 跑 repair，但**必須三項全部成立**才允許進入新的 dry-run / apply cycle：

1. **上次 APPLY 已有 matching ROLLBACK**：A1 invariant 自身會驗；ROLLBACK 行的 `beforeJson.summaryRef.id` 必須引用該 APPLY 行的 id（§6.4 W4'），否則 A1 視為未 rollback、ABORT。
2. **本次 pre-flight 19 條 invariants 全 pass**：包含 §2.1 身份 13 條（特別是 **I13** `placeholder User.status !== "SUSPENDED"`，rollback 必須真的把 placeholder `User` 改回 `ACTIVE`，§6.4 W3'）、§2.2 footprint 4 條、§2.3 cross-store **X1**、本條 **A1**。任何一條 FAIL 都 ABORT。
3. **operator + reviewer 重新書面同意這一輪新的 cycle**：rollback **不**自動授權 reapply；新 cycle 須走完整 §6.4 / §6.5 描述的雙簽流程（reviewer + 店長），等同於第一次 apply 的審核強度。

> 防止同一支 script 被誤跑兩次：若已 apply 過、未 rollback → A1 直接 ABORT；若已 rollback 但未滿足上面三項條件之一 → pre-flight 仍會 ABORT 在對應的 invariant。

---

## 3. 是否做 PR-F2 dry-run repair script

**結論：要做，而且 DRY RUN 是 default。** 三個理由：

1. **Repo precedent**：chenjiajia / 周雅琴 / 吳曉菁 三支 repair 全部 `--apply` 才寫入，default DRY RUN。
2. **不可逆性**：重新 point `Account.userId` 之後，原 LINE OAuth 不會再產生「指回 placeholder User」的事件鏈；錯了只能靠 rollback script + AuditLog snapshot 回復。
3. **Invariants 多**：13 條 identity + 4 條 footprint + 1 條 cross-store + 1 條 idempotency **= 19 條總計**。dry-run 階段要把全部 19 條跑一次、印出 PASS/FAIL，operator 確認後才執行 `--apply`。

### 3.1 設計（per-record script 骨架，僅範例，**本 PR 不寫實際 ID**）

```
scripts/repair-line-mismatch-<canonicalShortId>.ts
├── // 文件 header：背景、ID、SOP
├── const CANONICAL_CUSTOMER_ID = "…"   // ← sub-PR 填入
├── const CANONICAL_USER_ID    = "…"
├── const PLACEHOLDER_CUSTOMER_ID = "…"
├── const PLACEHOLDER_USER_ID    = "…"
├── const LINE_USER_ID  = "…"
├── const LINE_ACCOUNT_ID = "…"
├── const CANONICAL_PHONE = "09…"        // 鎖死，防 ID 套錯
├── const APPLY = process.argv.includes("--apply")
│
├── async function main():
│   ├── printDbHost()                    // 沿用 chenjiajia helper
│   ├── const pre = await loadPreState() // outside tx，1 次 read
│   ├── checkAllInvariants(pre)          // I1-13 + F1-4 + X1 + A1；任何 fail → exit 1
│   ├── printPlan(pre)                    // masked
│   ├── if (!APPLY) → "DRY RUN — 沒有寫入" → return
│   ├── await prisma.$transaction(async tx => {
│   │     const inTx = await loadPreState(tx)
│   │     checkAllInvariants(inTx)        // 再跑一次，防 race
│   │     const summaryId = await writeAuditSummary(tx, …)
│   │     await applyW1(tx); await writeAuditW1(tx, summaryId, …)
│   │     await applyW2(tx); await writeAuditW2(tx, summaryId, …)
│   │     await applyW3(tx); await writeAuditW3(tx, summaryId, …)
│   │   }, { isolationLevel: "Serializable" })
│   └── await verifyPostState()           // 再讀一次，印 OK + summary id
│
└── main().catch(…).finally(() => prisma.$disconnect())
```

* **絕對不接 `--force` / `--skip-invariants` / `--quick` 等任何放寬旗標**。失敗就失敗，由 operator 排除原因後重跑。
* **不接 `--customer-id=` 動態傳入**：ID 一律 hard-code 在 script 頂部，PR diff 即審計。
* **Script 名稱用 short-id**（前 6 碼）讓 reviewer 一眼看到目標：`repair-line-mismatch-cmojvb.ts`。實際完整 ID 在常數內。

---

## 4. apply 是否必須逐筆 `customerId` confirm

**必須。共 4 道閘**：

1. **一筆一支 script**：每筆 mismatch 一個 PR，PR diff 直接顯示 6 個 ID 常數。
2. **常數鎖定 + I4 phone 防誤套**：`CANONICAL_PHONE` 在 invariant 內比對，若 reviewer 不小心把 cmojvb... 的 phone 套到 cmou1y... 的 script 上，I4 會立刻 abort。
3. **`--apply` 必須是獨立指令**：先跑 dry-run（無 `--apply`）→ operator 把 stdout 貼到 PR comment 給 reviewer 看 → reviewer approve → operator 再跑 `--apply`。同一個 terminal session 也不准用 `&&` 串接 dry-run 與 apply。
4. **不接受 batch mode**：禁止任何 `for c of [...]` loop；禁止 `--from-file=mismatches.json`；禁止 `--all-needs-customer-merge`。

> 兩筆 `needs_customer_merge` = 兩支 script = 兩個 PR = 兩次獨立 dry-run + apply + verify。中間不可並行（一支 apply 完、verify 通過、店長確認顧客 LINE 登入正常後，才開始下一支）。

---

## 5. 第 3 筆 `needs_manual_business_check` — 店長須確認什麼

PR-F1.2 audit 對這筆會在 `reasons` 印出觸發子原因。**先看 reason，再對應確認清單**。可能子原因有 6 種，店長須做的事不同：

### 5.1 對應表

| audit reasons 包含 | 子型別 | 主要疑問 |
| --- | --- | --- |
| `direction_flipped` | A 才是主帳號 | 顧客自己認哪個是主號? |
| `both_sides_have_economic_footprint` | 雙邊都有業務資料 | 是同一人重複付費還是兩個不同人? |
| `account_user_is_live_login_without_data` | A 是活躍登入但無業務資料 | A 是顧客本人在用嗎? 還是測試帳號 / 員工? |
| `cross_store_line_user_detected` | 同 LINE userId 跨多店 | 顧客主要在哪一店? 其他店要不要解綁? |
| `account_user_missing` | A 的 User row 不存在(FK 異常) | **這是工程問題,不是業務確認** — 直接由工程查 cascade 設定 |
| `signals_inconclusive` | 訊號不足 | 先回去看 audit 詳細輸出與時間軸,再對應上述任一型 |

### 5.2 各型店長須確認

**direction_flipped（A 才是主）**

* 主動電聯顧客，確認哪個是顧客自己「想要保留的主帳號」（通常顧客只認自己常用的那個）。
* 確認顧客是否知道有兩個帳號（多半不知）。
* 確認 C 側（customer.userId 指向的 Customer）有沒有顧客在乎的歷史：預約紀錄、購買紀錄、累積積分；若有 → 升級到「雙邊都有」型，走業務 + 工程雙簽。
* 確認顧客同意把 C 側 deactivate / merge 到 A 側。

**both_sides_have_economic_footprint（雙邊都有業務資料）**

* 電聯顧客，確認雙邊 phone / 真實姓名是否為同一人。
* 若同一人：確認哪邊的歷史要當主，並列出**完整**要合併的資料：bookings 數、wallets 與剩餘堂數、transactions 金額、points、checkins。把這份對照表給工程做財務合併（**這不在 PR-F2 scope**，需另開 PR-F3 設計兩筆 Customer 的 wallet/booking/transaction merge 規格與店家簽核流程）。
* 若不同人（不應該但有可能）：確認是否有 phone 重複 / OAuth 串錯，回去查 LINE OAuth fallback 是否有 bug。

**account_user_is_live_login_without_data（A 是活躍登入無資料）**

* 查 A.user 的 `User.role`：若 `OWNER` / `STAFF` → **立刻停手**，這不是顧客身份分裂，是員工帳號被誤綁了 LINE OAuth，要工程查 staff bind path。
* 查 A.user 的 Account 列表：若有 Google `Account` → 顧客可能用 Google 跟 LINE 兩種方式登入，且 LINE 那把走錯 User。
* 查 A.user 的最近 `Session.expires`：若還活著，先別動，等顧客下次登入前確認。
* 確認顧客是否有意保留 A 那個登入身份（即使空）。

**cross_store_line_user_detected（跨店）**

* 店長須與其他店店長 / 業主一起決議：這位顧客的「主要服務店」是哪一店。
* 確認其他店的 Customer 是否要：(a) 維持各店一筆 known-split；(b) merge 為單店主帳；(c) 解綁 LINE。
* **PR-F2 scope 內什麼都不做**：跨店身份統一是策略問題，超出本 PR 範圍。

**account_user_missing（FK 異常）**

* 不是業務問題。工程查 `Account` row 是否真的 orphan，看 `Account.userId` 指向的 User 在哪裡（被刪? cascade 漏了?）。
* 不在 PR-F2 scope；先開 issue ticket 給工程。

**signals_inconclusive**

* 工程協助店長還原該筆 Customer 的時間軸（建議用既有 `scripts/diagnose-customer-<name>.ts` 模式新寫一支 read-only diagnose）後，再對應上面 5 型之一。

### 5.3 店長必須交付的書面紀錄

* 顧客電聯日期 / 與誰確認 / 顧客原話（masked phone，存內部）
* 店長簽核欄位（用 `OpsActionLog` model，`module="line_mismatch_repair"`, `refId=CANONICAL_CUSTOMER_ID`, `status` 走 `assigned/contacted/decided/rejected`）
* 業務決策結果（一句話：要不要 repair / 走哪一型 / 顧客同意保留哪邊）

> `OpsActionLog` 既有 model 可用，**不改 schema**。

### 5.4 店長一個人不能決定的事

* 直接動 DB
* 任何 `Wallet` / `Booking` / `Transaction` 的合併或移轉（必須由工程 + 財務雙簽，並走 PR-F3 設計）
* 跨店身份的調整（須業主拍板）
* 把第 3 筆「降級」成 `needs_customer_merge` 走 §1 流程 — 這需要工程確認 audit reason 是否真為單純空殼，店長無權判斷

---

## 6. rollback / audit log / repair log 設計

### 6.1 AuditLog（DB，沿用既有 model，不改 schema）

既有 `model AuditLog { actorUserId, targetType, targetId, action, beforeJson, afterJson, createdAt }` 完全足夠。每筆 repair 共寫 **4 筆**：

| # | targetType | targetId | action | beforeJson | afterJson |
| --- | --- | --- | --- | --- | --- |
| L0 | `Customer` | `CANONICAL_CUSTOMER_ID` | `LINE_MISMATCH_REPAIR_APPLY` | 整組 6 ID + classify() 結果 + 全部 invariants 觀察值 + cross-store count | 修復後同樣一份 snapshot |
| L1 | `Account` | `LINE_ACCOUNT_ID` | `LINE_MISMATCH_REPAIR_REASSIGN_ACCOUNT` | `{userId: PLACEHOLDER_USER_ID, provider, providerAccountId}` | `{userId: CANONICAL_USER_ID, ...}` |
| L2 | `Customer` | `PLACEHOLDER_CUSTOMER_ID` | `LINE_MISMATCH_REPAIR_MERGE_PLACEHOLDER` | `{userId, mergedIntoCustomerId, mergedAt, selfBookingEnabled, lineLinkStatus, lineUserId}` | 修改後同樣 6 個欄位 + `linkedSummaryId: L0.id` |
| L3 | `User` | `PLACEHOLDER_USER_ID` | `LINE_MISMATCH_REPAIR_SUSPEND_ORPHAN` | `{status: <previous>}` | `{status: "SUSPENDED", linkedSummaryId: L0.id}` |

* `actorUserId`：跑 script 的 operator User.id；script 必須要求環境變數 `OPERATOR_USER_ID` 設定才執行 `--apply`，否則 abort。**禁止用任何 system / bot User**（這是審計要求）。
* L1/L2/L3 都把 `L0.id` 寫進 `afterJson.linkedSummaryId`，rollback 時用一個 `where: { OR: [...], action: { in: [...] } }` 把 4 筆一起拉出。
* `beforeJson` / `afterJson` 不含 raw `lineUserId` / `phone` / `email` / `name` / `passwordHash` — 若這些欄位被 snapshot，先 mask 再寫；ID 是 cuid 可以保留全文（既有 audit 都是這樣）。

### 6.2 Repair log（operator-facing stdout，落 file）

* Script stdout `tee` 到 `scripts/.repair-logs/repair-line-mismatch-<canonicalShortId>-<UTC-timestamp>.log`（`.repair-logs/` 加進 `.gitignore`，不入 repo）。
* 內容：dry-run 完整輸出、apply 的 in-tx assertion 結果、4 筆 AuditLog 的 id、verify 結果、若 abort 則印 invariant 名稱 + 觀察值。
* operator 把整份 log 貼到 PR comment 作為 reviewer audit trail。
* **不**含 raw lineUserId / phone / passwordHash（沿用 PR-F1.2 mask helpers）。

### 6.3 In-tx rollback（自動，免成本）

* `$transaction` 包住 W1 + W2 + W3 + 4 筆 AuditLog。任何 step throw → 整組原子回滾。
* Pre-flight + in-tx 雙重 invariants 把這個發生機率降到極低，但 race 邏輯仍要靠 transaction 保底。

### 6.4 Post-apply rollback（手動，獨立 script）

對稱於 repair，每筆一支：`scripts/rollback-line-mismatch-<canonicalShortId>.ts`。

> **Rollback 不會自動發生**。它必須是 operator 拿到 repair summary id（L0.id，由 repair log / PR comment 取得）後，明確去跑這支獨立 script，並通過 reviewer + 店長雙簽（§6.5）。repair 自身的「in-tx rollback」（§6.3）是同一個 transaction 內 throw 後 Prisma 自動回滾，那不是這裡講的 post-apply rollback。

Rollback 必須對稱反轉 §1.1 列的 W1..W3 三個寫入群組，再加上 rollback 自身的 AuditLog 寫入（W4'）。**任一群組漏做都會留下 mismatch**：例如只反轉 W1 把 Account.userId 還回 PLACEHOLDER_USER_ID，卻沒同時把 W3 反轉、User.status 仍卡在 SUSPENDED，會直接被 NextAuth `authorize()` 對 non-ACTIVE user 的拒絕擋下來 — 顧客的登入行為並未真正回到 pre-repair 狀態。

```
- 接 --summary-id=<L0.id> 為唯一入口（不接 customerId）
- 用 summary-id 撈 L0..L3 四筆 AuditLog（repair 寫入的）
- 對 L1..L3 各自的 target row：read current DB state，assert == L1..L3.afterJson
    若不一致 → ABORT，因為已有人在 repair 之後動過資料，
    rollback 不能蓋掉那些後續變更，必須走人工。

- printPlan：明確列出 4 個 reverse write groups —
    W1' (反向 W1 / Account.userId)：
        從 L1.afterJson.userId (= CANONICAL_USER_ID)
        改回 L1.beforeJson.userId (= PLACEHOLDER_USER_ID)。

    W2' (反向 W2 / Customer[placeholder] merge fields)：
        Customer[id=PLACEHOLDER_CUSTOMER_ID] 的
            mergedIntoCustomerId / mergedAt / userId /
            selfBookingEnabled / lineLinkStatus / lineUserId
        全部從 L2.afterJson 改回 L2.beforeJson
        （= 取消 merge、還原 selfBookingEnabled、把
         lineLinkStatus + lineUserId 還回原綁定狀態）。

    W3' (反向 W3 / placeholder User.status)：
        User[id=PLACEHOLDER_USER_ID].status 從
            L3.afterJson.status (= "SUSPENDED")
        改回 L3.beforeJson.status —— pre-repair 預期值是 "ACTIVE"
        （L3.beforeJson 是 repair 當下實際 snapshot 的值，
         理論上一律 ACTIVE 才符合 §1.1 W3 的 from→to）。
        **這一步不可省略**：少了它，rollback 完成後 placeholder User
        仍卡在 SUSPENDED，NextAuth authorize() 對 non-ACTIVE user
        直接 reject，pre-repair 的登入行為並未真正復原。

    W4' (rollback 自身的 audit write)：
        新增 1 筆 AuditLog，action="LINE_MISMATCH_REPAIR_ROLLBACK"
            actorUserId = OPERATOR_USER_ID
            targetType  = "Customer"
            targetId    = CANONICAL_CUSTOMER_ID
            beforeJson  = 引用 L0.id 與 L1..L3.afterJson 全套 snapshot
            afterJson   = 4 個 reverse write group 套用後的最終值
                          （含明寫 User.status 已從 SUSPENDED 還回原值）
        rollback 自身**只**寫這 1 筆 AuditLog（repair 寫的 L0..L3
        是 append-only 不修改、不刪除）。

- 沒 --apply → DRY RUN：只 print W1'..W4' 計畫不寫入，
                       並印出 L1..L3.afterJson vs current row 的 diff。
- 有 --apply：
    $transaction (Serializable):
      - 再驗一次 row state == L1..L3.afterJson（in-tx race guard）
      - 套用 W1'
      - 套用 W2'
      - 套用 W3'  ← 必跑；不允許 skip
      - 寫 W4' (rollback AuditLog)
    全部原子：任一 step throw → 整組 transaction 回滾，
    placeholder User 不會被殘留卡在 SUSPENDED。

- 不 cascade 任何「W1'..W3' 範圍外」的清理：
    - 不刪 CANONICAL_USER_ID 底下 apply 之後新增的 Session
      （如需清，operator 另跑 prisma.session.deleteMany — 不在本 script）
    - 不對 PLACEHOLDER_USER_ID **以外** 的 User 做任何 unsuspend
      （W3' 對 placeholder 自己的 unsuspend 是 rollback 的必要步驟，
       屬於 W1'..W3' 範圍內，**不**受此「不 cascade」限制）
    - 不通知 LINE / Email 顧客
```

### 6.5 Rollback 限制（必須在 PR description 明寫）

* **Session 不會被自動清掉**：apply 完成後若顧客已用 LINE 登入過，會在 `CANONICAL_USER_ID` 底下產生 `Session`；rollback 後這些 Session 依然存在。若需要清，由 operator 另跑 `prisma.session.deleteMany({ where: { userId: CANONICAL_USER_ID, createdAt: { gte: applyAt } } })` —— **本 PR-F2 不寫這個 helper**。
* **顧客 LINE 端不會被通知**：顧客下次登入若行為改變，是正常後果；店長須事先告知。
* **無法 rollback 的情境**：apply 之後新增任何 booking / transaction / wallet 操作到 placeholder Customer（理論上不會，因為 placeholder 已 mergedInto + selfBookingEnabled=false + User SUSPENDED）；若真的發生，rollback script 的 in-tx assertion 會 abort。
* **時間窗建議**：apply 後 24 小時內最容易 rollback；超過就 case-by-case 判斷。
* **rollback 自身也需要 reviewer + 店長雙簽**，不是「執行者自己想 rollback 就跑」。

---

## 7. 絕對禁區（再次列明）

### 7.1 Schema / DB

* 不改 `prisma/schema.prisma`
* 不跑 `prisma migrate dev/deploy` / `prisma db push` / `prisma db reset`
* 不新增任何 model、enum、index、unique 約束
* **複用** `AuditLog` / `OpsActionLog` 既有 model

### 7.2 LINE / OAuth / LIFF

* 不改 `src/lib/auth.ts` 任何 callback
* 不改 `/liff/*` route / page / shell / form
* 不改 webhook bind-code handler
* 不改 `bindLineToCustomerInStore` / `resolveLineLogin` / `finalizeLineBind` / `mergePlaceholder*` / `line-account-sync`
* 不改 `src/lib/line-bind-log.ts` mask helpers
* PR-F1.2 read-only contract test 必須持續通過

### 7.3 Wallet / Booking / Transaction 業務邏輯

* 不動 `CustomerPlanWallet`、`WalletSession`（不轉移、不合併、不改 status）
* 不動 `Booking`、`BookingSlot`、`MakeupCredit`（不改 customerId / staffId）
* 不動 `Transaction`、`CashbookEntry`、`CashDrawerSession/Entry`（不退款、不轉移）
* 不動 `ServicePlan`、`ShopConfig`、`BusinessHours`、`SpecialBusinessDay`、`SlotOverride`、`DutyAssignment`
* 不動 `Customer` canonical 側任何欄位
* 不動 `Customer` placeholder 側除上述 W2 5 個欄位之外的任何欄位

### 7.4 通訊與通知

* 不發 LINE 推播
* 不發 Email / SMS
* 不寫 `MessageLog` / `Reminder`
* 不動 `OpsActionLog` 既有 row（只允許新增 `module="line_mismatch_repair"` 用途的 row）

### 7.5 留給未來（不在 PR-F2 scope）

* 真實「雙邊都有經濟足跡」的 wallet / booking 財務合併 → 另開 PR-F3 設計
* 跨店身份統一策略 → 另起設計，須業主拍板
* `Account[google]` / 其他 provider 的 drift 修復 → 沿用同設計再做
* 自動掃描 + 自動修復 service → 不做。always 手動 per-record
* PR-F1.2 audit 從 `--store=zhubei` 擴到全店 → 等 zhubei 三筆收完，再決定是否擴

---

## 8. 開發順序建議

1. **本文件 merge**（PR-F2.0，docs-only） — reviewer 確認 invariants / SOP / 禁區無爭議
2. **PR-F2.1**：第 1 筆 `needs_customer_merge` 的 repair + rollback script（含 6 個 ID 常數），dry-run output 貼 PR comment，reviewer approve 後 operator apply
3. **PR-F2.1 apply 後 24h 觀察**：顧客 LINE 登入是否成功（請店長協助驗證）、是否有 ErrorLog 出現異常
4. **PR-F2.2**：第 2 筆 `needs_customer_merge`，重複 PR-F2.1 流程
5. **第 3 筆 manual-check**：店長 + 業務簽核完成 → 開 PR-F2.M 設計該筆專屬 SOP（不直接套 §1 流程）
6. **PR-F2.3**：對 PR-F1.2 audit 再跑一次 `--store=zhubei`，驗證 mismatch 數降到預期值

---

## 9. 給 reviewer 的一句話

> 本文件只設計修復流程、不修改任何 code/schema/DB；後續任何 sub-PR 上來，先確認該 PR 內所有寫入點都在 §1.1 的 W1–W4 範圍內、所有 invariants 對齊 §2、SOP 對齊 §3–§4、rollback 對齊 §6、禁區對齊 §7。任何越界 → 退件。
