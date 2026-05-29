# Steamfoot LIFF identity binding / Customer binding — 實作前 pre-audit

> 本文件只做盤點與計畫。**不改 code、不寫 DB、不開 PR、不寫 migration**。實作由後續 PR-G5.x 系列依本文件規範執行。

---

## 🚦 Code 開工通行證（最上面一定要看完）

### 不可動搖的前提

1. **下一階段的「主入口」是 LIFF**：顧客從 LINE OA / Rich Menu 進入 LIFF。任何 LINE 身份綁定的 happy path 都必須優先走 LIFF。
2. **PR-F1 / F1.1 / F1.2 已完成觀察 + audit**，PR-F2.1 / F2.2 已修完 2 筆 `needs_customer_merge`。剩 1 筆 `needs_manual_business_check` 不在本 PR 系列範圍。
3. **`bindLineToCustomerInStore` 是 canonical helper**（PR-C1 已立）。任何新寫的綁定點都必須 wire 過這支，**不再各自 inline `prisma.customer.update`**。
4. **PR-2 / `identity-flow.md` 的 `/oauth-confirm` 流程曾被撤**（auth.ts 註解明寫原因），dead code 仍在 repo。本 pre-audit 提議「有條件、有 mitigation 地復活」，**不是無腦 revert PR-2**。
5. **目前 prod 餘下的 LINE drift 已可控**：PR-F1.2 read-only audit + CI 可定期掃。本 PR 系列目標是「**停止新增**」，而不是「立刻清歷史」。

### 必須遵守的既有設計鎖

| 來源 | 鎖死條款 | 本 PR 系列必須遵守 |
| --- | --- | --- |
| `identity-flow.md` §1.1 | 找到 phone ≠ 找到本人；已啟用顧客必過密碼 | ✓ |
| `identity-flow.md` §1.2 | **禁止建立 placeholder phone（`_oauth_line_xxx`）的 Customer** | ✓（auth.ts Case C 現在違反，要改） |
| `identity-flow.md` §1.3 | server 不做 redirect；回 discriminated union | ✓ |
| `identity-flow.md` §1.4 | DB 改完 lineUserId 必須 RELOGIN（不可 `router.push`） | ✓ |
| `pr-c2-liff-onboarding-plan.md` §6 | 不動 `bindLineToCustomerInStore` 介面或行為 | ✓（只加 caller，不改 helper） |
| `pr-c2-liff-onboarding-plan.md` §6 | 不動 Prisma schema、不寫 migration | ✓（見 §8） |
| `pr-f1.2` read-only contract test | `scripts/diagnose-line-mismatch-repair-audit.ts` 不可 gain write capability | ✓ |
| `pr-f1.2` cross-store guard | `crossStoreLineUserCount > 1 && canReassignSafely` 必降級 | ✓（新代碼也要符合） |
| **本 PR 系列範圍鎖**（Codex round 6 P2）| **PR-G5 是 LINE identity-binding only**；Google OAuth placeholder（`_oauth_google_*`）行為**完全不在本 PR train 範圍**，需保持現狀不變 | ✓（A2 invariant 僅檢 `_oauth_line_` prefix；**禁止**用廣義 `_oauth_` ban 連帶擋 Google，否則首次 Google OAuth 沒既有 Customer 的顧客會被誤拒；若未來要設計 Google 替代流程，須另開 docs / PR train，**不**在 PR-G5.x scope）|

### 本 pre-audit 只做這 1 件事

**產出本文件**（你正在讀的）。除此之外 0 個檔案改動。所有 §6 列出的 PR-G5.x 是「未來工作」，本 audit **不**寫任何 code、不開任何 PR、不動任何 schema/DB/migration。

---

## 0. 背景 / 進度回顧

| 階段 | PR | 已完成事項 |
| --- | --- | --- |
| 觀察 | PR-F1 (#218) | 三條綁定路徑 structured logging + mask helpers + `bindLineToCustomerInStore` P2002 guardrail |
| 觀察 | PR-F1.1 (#219) | account-mismatch triage fields |
| 觀察 | PR-F1.2 (#220) | repair-decision audit script + cross-store guard |
| 修復 | PR-F2.1 / F2.2 | 修完 2 筆 `needs_customer_merge`（陳佳佳模式） |
| 待辦 | — | 1 筆 `needs_manual_business_check`（店長確認後另議） |
| Canonical helper | PR-C1 | `bindLineToCustomerInStore` 寫好（含 7 種 status branch + P2002 guard） |
| LIFF wiring | PR-C2 | `/liff/onboarding` action 用 canonical helper |
| **未完成** | PR-C3 | 「把 OAuth Case 1/2/3 wire 過 `bindLineToCustomerInStore`」— **計畫存在,從未實作** |
| **回滾** | — | PR-2 `/oauth-confirm` 流程被 `auth.ts` Case C 撤掉,dead code 仍在 |

**root cause 一句話**：3 筆 prod drift 都是 `_oauth_line_*` placeholder phone Customer，來源是 `auth.ts` LINE OAuth callback Case C（找不到既有 Customer 時直接在 `$transaction` 內建完整身份鏈）。`auth.ts` 註解明寫此 trade-off「由後台合併工具處理」，本 pre-audit 提議移除這個 trade-off。

---

## 1. 正確資料模型（Customer + User + Account[line]）

### 1.1 三表關係（ER 文字版）

```
User (NextAuth 登入身份, 1:1 ←→ Customer)
  ├── id (PK)
  ├── phone (optional, 同 role unique)
  ├── email (unique 全域)
  ├── passwordHash (optional; 有=密碼登入啟用過)
  ├── role (CUSTOMER / STAFF / OWNER)
  ├── status (ACTIVE / SUSPENDED / DELETED)
  ├── 1:N → Account  (NextAuth OAuth providers)
  ├── 1:N → Session
  └── 1:1 → Customer (via Customer.userId @unique)

Customer (店家側顧客資料, store-scoped)
  ├── id (PK)
  ├── userId @unique (1:1 to User; nullable: 未啟用顧客)
  ├── storeId (FK, 多店每店一筆)
  ├── phone (per-store unique: @@unique([storeId, phone]))
  ├── email (per-store unique)
  ├── googleId (per-store unique)
  ├── lineUserId (per-store unique: @@unique([storeId, lineUserId]))
  ├── lineLinkStatus (UNLINKED / LINKED / PENDING)
  ├── lineBindingCode (per-store unique 6 碼)
  ├── authSource (MANUAL / EMAIL / LINE / GOOGLE)
  ├── mergedIntoCustomerId (合併追蹤)
  └── ...業務欄位

Account (NextAuth OAuth tokens)
  ├── id (PK)
  ├── userId (FK → User)
  ├── provider ("line" / "google")
  ├── providerAccountId (LINE userId 或 Google sub)
  └── @@unique([provider, providerAccountId])  ← 全域 unique, 不分 store
```

### 1.2 Schema 已強制的 invariants

| ID | 條款 | 強制方式 |
| --- | --- | --- |
| **S1** | 同 store 同一 phone 只能有一筆 Customer | `@@unique([storeId, phone])` |
| **S2** | 同 store 同一 lineUserId 只能有一筆 Customer | `@@unique([storeId, lineUserId])` |
| **S3** | 同 store 同一 googleId 只能有一筆 Customer | `@@unique([storeId, googleId])` |
| **S4** | 同 store 同一 6 碼綁定碼 unique | `@@unique([storeId, lineBindingCode])` |
| **S5** | User ↔ Customer 1:1 | `Customer.userId @unique` |
| **S6** | Account 在「同一 OAuth provider 同一 providerAccountId」全域 unique | `@@unique([provider, providerAccountId])` |
| **S7** | Account.userId → User cascade delete | `onDelete: Cascade` |
| **S8** | Customer.user → User SetNull | `onDelete: SetNull`（User 被刪 / Suspended 時 Customer 不消失） |

### 1.3 Schema 沒有強制、靠應用層維持的 invariants

| ID | 應該成立的條件 | 為何 schema 管不了 |
| --- | --- | --- |
| **A1** | 「真實顧客」的 `Customer.phone` 必須為正規化台灣手機（10 位 09 開頭） | Prisma 不支援 check constraint；目前由 `normalizePhone()` + Zod 在寫入點驗證 |
| **A2** | **不應該存在 `Customer.phone LIKE '_oauth_line_%'` 的「placeholder」row** | 目前 `auth.ts` Case C 違反 |
| **A3** | 若 `Customer.lineUserId IS NOT NULL` 且 `Customer.userId IS NOT NULL`，則必存在 `Account[provider=line, providerAccountId=Customer.lineUserId, userId=Customer.userId]` | **目前 baseline 並未完全 enforce**：既有 `bindLineToCustomerInStore` 在 `$transaction` 內 commit User+Customer，**之後**才呼叫 `syncLineAccountForUser`（**outside tx**、catch Prisma error 並回傳 `error` status）。若 sync 失敗，Customer 已 commit、Account 缺失 → 形成 `missing-account` drift。**PR-G5.x target invariant**：把 Customer + User + Account[line] 三件寫入收進同一個 `$transaction`（任一失敗整組 rollback），新 entry point `bindLineToExistingCustomerById` (§5.3) 必須生來就是 atomic；既有 helper 受 PR-C2 §6「不改行為」鎖，atomicity 兼容性升級由獨立 sub-PR 評估，期間靠 PR-F1.2 diagnostic + PR-F2 範本修復承擔殘餘風險。 |
| **A4** | 同一 `lineUserId` 出現在多 store 時，不應走任何「自動 reassign Account.userId」路徑 | PR-F1.2 cross-store guard 已在 audit 端實作；寫入端目前無等價防線 |
| **A5** | `Customer.userId` 不為 null 後，其 `User.passwordHash !== null` 或至少有一筆 `Account` | 「啟用」的隱性定義；目前未明文 |
| **A6** | `Customer.lineLinkStatus === "LINKED"` ⇒ `Customer.lineUserId !== null` | 邏輯耦合，未強制 |
| **A7** | `Customer.lineLinkStatus === "UNLINKED"` ⇒ `Customer.lineUserId === null` | 同上 |

### 1.4 已知「合法但會壞」的狀態（PR-F1.2 audit 已涵蓋）

| 狀態名 | 條件 | 處理 |
| --- | --- | --- |
| **orphan-line** | Customer.lineUserId 已設，Customer.userId IS NULL | 預期狀態:webhook 綁定碼後、顧客還沒密碼登入;但若量持續上升 → /profile 啟用流程斷掉 |
| **missing-account** | Customer.lineUserId+userId 都有，Account[line] 找不到 | PR-F1 已在 auth.ts Case A 加 best-effort repair；舊資料用 backfill |
| **account-mismatch** | Account[line].userId ≠ Customer.userId（同 lineUserId） | 本系列起源;PR-F2.1/F2.2 修完 2 筆 |
| **cross-store** | 同 lineUserId 多 store 出現 | 設計上接受（方案 B），但任何自動修復都要先過 cross-store guard |

---

## 2. 店長先建檔（姓名 + 電話） → 顧客 LINE 登入綁回同一個 Customer

### 2.1 期望流程

```
[店長後台建檔]
  → 寫 Customer { name, phone, storeId, userId=null, lineUserId=null, lineLinkStatus=UNLINKED }
        ↓
[顧客從 LINE OA Rich Menu 點開 LIFF]
        ↓
[/api/liff/exchange (LIFF id_token verify + storeId resolve)]
        ↓
  查 Customer where (storeId, lineUserId)
        ↓
   ┌─ 找到(含 userId)→ mint session,直接登入
   │
   └─ 找不到 → 回 { status: "need_onboarding" }
        ↓
[/liff/onboarding 表單 (UX 已存在)]
        ↓
[submitOnboarding(idToken, storeSlug, name, phone) server action]
        ↓
[bindLineToCustomerInStore(storeId, lineUserId, phone, name, lineName)]
        ↓
   單一 $transaction:
     1) 找 Customer by (storeId, phone)
     2) 命中且 Customer.lineUserId === null && Customer.userId === null
          → 為這筆 Customer 建 User + 寫 Customer.userId, lineUserId, lineLinkStatus=LINKED
          → 建 Account[line]
     3) 回 status: "bound_existing"
        ↓
[/liff/onboarding RELOGIN → 顧客已綁]
```

### 2.2 LIFF entry 現況

**✓ 業務邏輯已對，但 A3 atomicity 未完全 enforce**。

- `/api/liff/exchange` 路徑（PR-B）：(storeId, lineUserId) 查無 Customer → 回 `need_onboarding`，不寫 DB。
- `/liff/onboarding/actions.ts`（PR-C2）：呼叫 `bindLineToCustomerInStore`。
- `bindLineToCustomerInStore` 第 148-298 行：明確處理「candidates 由 (storeId, phone) 命中 1 筆、`!real.lineUserId && !real.userId`」→ create User + bind LINE 到既有 placeholder Customer。
- **Current baseline atomicity**：User + Customer 在 `prisma.$transaction` 內 commit；**之後**才呼叫 `syncLineAccountForUser`（**outside tx**），該 helper 把 Prisma error catch 起來回傳 `error` status — 也就是說 Account 寫入失敗**不會** rollback Customer 綁定。在罕見 transient 失敗（DB connection drop / unique-index race）下，仍可能留下 `Customer.lineUserId` 已設但 `Account[line]` 缺失的狀態 → PR-F1.2 audit 偵測到的 `missing-account` drift。P2002 guard（PR-F1）只覆蓋 0-candidate User+Customer create 的 transaction throw 情境，**不**等同 Account 同 tx atomic。
- **PR-G5 target**：見 §1.3 A3。讓 Customer + User + Account[line] 三件在同一個 `$transaction` 內 atomic write，新 entry point `bindLineToExistingCustomerById` 從一開始就 enforce；既有 helper 在 PR-C2 §6 鎖下保留 best-effort post-tx 行為，殘餘風險由 PR-F1.2 audit + PR-F2 範本承接。

### 2.3 非 LIFF（browser）entry 現況的破口

**❌ 不對**。

若顧客**不**從 LIFF 進來、而是從手機瀏覽器 / desktop 按「Sign in with LINE」按鈕：

1. 走 NextAuth LINE OAuth callback (`src/lib/auth.ts`)。
2. 由 `(storeId, lineUserId)` 查 Customer → 找不到（顧客是新 LINE）。
3. 既不知道 phone（NextAuth callback 無此資訊）、又繞過 LIFF onboarding 表單。
4. 進入 **Case C**（auth.ts L705-790）→ **直接建 `_oauth_line_*` placeholder Customer**。
5. 之後店長若手動把 phone 補進 Customer，這筆「新 phone Customer」與「店長先建檔的 phone Customer」就同 phone（會踩 `@@unique([storeId, phone])`），或被 staff 拿來 manual merge。
6. 若顧客同時做了「店長先建檔」與「LINE OAuth」→ 兩筆 Customer 並存 = drift 重現。

### 2.4 修復方向

| 修法 | 描述 | 評估 |
| --- | --- | --- |
| **(P) 主推:LIFF-only** | 不在非 LIFF 環境提供「Sign in with LINE」按鈕。LINE 顧客 100% 從 OA/Rich Menu 進 LIFF | 業務面要先確認:有沒有非 LIFF LINE 登入的真實需求(desktop?)。Steamfoot 顧客以手機為主,實務上可行 |
| **(P) 必做:auth.ts Case C 斷流** | Case C 不再建 placeholder Customer。改為**用 `src/lib/oauth-stage-token.ts` 簽 stage token + return Auth.js redirect URL 指向 `/api/oauth-line-stage?t=...`**（query 參數名稱**必為 `t`**，與 `src/app/api/oauth-line-stage/route.ts` 既有的 `req.nextUrl.searchParams.get("t")` 對齊；若 auth.ts 誤發 `?token=` 將收到 `null` → token verify fail → 顧客被導去 `/oauth-confirm` 看到 expired session — Codex round 8 P2）；由該 route handler 驗證 token、寫 oauth_line_session cookie、再 redirect 到 `/oauth-confirm` 表單收 phone（復活 PR-2 stage flow，但只在此 case 觸發）。**auth.ts 不可 import `src/lib/server/oauth-temp-session`** — 該檔案 import `next/headers`，會污染 NextAuth 的 edge-compatible bundle。 | 與 PR-2 撤的原因相反,但這次有 LIFF 為主流;非 LIFF 是 fallback,接受較低 conversion |
| **(O) 可選:identity-repair 強化** | login 後 best-effort 用 phone 找同 store Customer。已存在,但若 OAuth 階段沒拿到 phone 就無用 | 不解決 Case C 的根因 |

**建議:採 (P) 兩條同時做**:
- LIFF entry 為主流入口(主推);
- 為 Case C 提供「補 phone」出口(必做,replace Case C placeholder fallback);
- A2 invariant 寫進 Zod / helper：**新 Customer.phone 不得 `startsWith("_oauth_line_")`**（**LINE-only**；Google OAuth 的 `_oauth_google_*` 不在本 PR train scope，A2 validator 必須 narrow 到 `_oauth_line_` prefix，否則會誤殺首次 Google OAuth 沒既有 Customer 的顧客 — Codex round 6 P2）；既有 row 暫留為歷史債，等 ad-hoc backfill 清。

---

## 3. 顧客已有電話帳號時，避免 LINE OAuth 另開新 Customer

### 3.1 問題重述

顧客 X 已有：
- `Customer { phone: 0912345678, userId: U1, passwordHash IS NOT NULL }`（已啟用、能密碼登入）

X 從 LINE OAuth 第一次登入：
- NextAuth callback 用 (storeId, lineUserId) 找 Customer → **找不到**（X 的 Customer 沒 lineUserId）
- Case C 觸發 → 建第二筆 Customer `_oauth_line_*` + 新 User U2 + Account[line, userId=U2]
- 結果：同一個 X 在 DB 有兩筆 Customer、兩個 User。chenjiajia 模式重現。

### 3.2 LIFF 路徑（已對）

走 LIFF 時，`/liff/onboarding` 表單會收 phone：

- `bindLineToCustomerInStore` 第 187-198 行：`(storeId, phone)` 命中 1 筆 `Customer.userId !== null && !Customer.lineUserId` → 回 `"phone_taken_by_other_user"`。
- `/liff/onboarding/actions.ts`：對應 status mapping → 顯示「此電話已綁定登入帳號,請走 webhook 綁定碼（或請店家協助）」。
- 不會盲綁、不會 hijack。

> 防 hijack 的關鍵:bindLineToCustomerInStore 沒有「強制蓋掉 existing Customer.lineUserId」的 path。任何「真實已啟用顧客」必須走外部驗證(綁定碼 / 密碼登入)才能加 LINE。

### 3.3 NextAuth LINE OAuth Case C（根因）

NextAuth callback **不知道 phone**（LINE OAuth scope 沒有 phone），所以 Case C 完全繞過 `bindLineToCustomerInStore`、無從觸發 `phone_taken_by_other_user`、直接建第二筆 Customer。

### 3.4 修復方向

| ID | 修法 |
| --- | --- |
| **F1** | auth.ts Case C **不再 inline create**。改為：用 **`src/lib/oauth-stage-token.ts`** HMAC 簽一個短期 stage token（payload: `lineUserId` / `displayName` / `storeId` / `nonce` / `iat` / `exp`）→ 從 signIn callback 回傳 Auth.js redirect URL 指向 **`/api/oauth-line-stage?t=...`**。⚠ **query 參數名稱必為 `t`**，與既有 `src/app/api/oauth-line-stage/route.ts` 的 `req.nextUrl.searchParams.get("t")` 對齊（Codex round 8 P2）；若實作改成 `?token=` 而沒同 PR 改 route handler，route 會拿到 `null` → token verify fail → 顧客被導去 `/oauth-confirm` 看到 expired/missing session error。**auth.ts 不可 import `src/lib/server/oauth-temp-session`** — 該檔案 import `next/headers`，會污染 NextAuth 的 edge-compatible bundle。寫 cookie 的責任完全交給下一站。 |
| **F2** | **`/api/oauth-line-stage/route.ts`** 驗 stage token（HMAC + TTL + nonce 一次性使用）→ **此 route handler 才呼叫 `setOAuthTempSession({ lineUserId, displayName, storeId, nonce })`** 寫 oauth_line_session cookie → redirect `/oauth-confirm`。`oauth-temp-session.ts` 的合法 callers 只有這支 route + `/oauth-confirm` server actions，**完全不包括 auth.ts**。 |
| **F3** | `/oauth-confirm` 表單收 phone → `resolveLineLogin(phone, storeId)` 跑 §3 PR-2 三狀態判定 → 對應 `NEW_USER` / `BOUND_EXISTING` / `NEED_LOGIN` 三條 client-side redirect。`NEW_USER` / `BOUND_EXISTING` 由 `resolveLineLogin` 直接呼叫 phone-driven `bindLineToCustomerInStore` 完成綁定（candidates=0 走 create-new、candidates=1 走 bind-existing-placeholder 分支）。 |
| **F4** | `NEED_LOGIN` 流程：redirect `/login?phone=...&callback=/oauth-confirm/finalize` → 顧客密碼登入 → `finalizeLineBind` **先驗 `oauth_line_session` cookie 的 signature / nonce**（§5.3.1）；驗失敗 → return auth/session error + **0 byte DB 寫入**；通過後才取出 `storeId` / `lineUserId` / `lineName` + 從 PR-2 resolveLineLogin state 取 `customerId`，呼叫 **`bindLineToExistingCustomerById({ storeId, customerId, lineUserId, lineName })`** 寫 Customer.lineUserId + Account[line]。新 entry point **必須**從一開始就 enforce A3 atomicity（Customer.update + Account.create 同 `$transaction`、任一失敗整組 rollback）+ helper 內部 enforce `customer.storeId === storeId`（不等 → `store_mismatch`，0 byte 寫入）+ helper 內部 enforce `customer.userId !== null`（null → `customer_has_no_user`，0 byte 寫入，finalize **不**靜默自動建 User，redirect 回 `/oauth-confirm` 顯示「請改走 LIFF onboarding」見 §5.3.2）— 這些是 PR-G5 target invariant，**不是**從既有 `bindLineToCustomerInStore` 繼承來的行為（§2.2 baseline 仍是 Account post-tx best-effort）。**不可用 `bindLineToCustomerInStore`**：NEED_LOGIN 表示該筆 Customer 已有 `userId`（密碼確認過的真實顧客），phone-driven helper 的 hijack guard 設計上就會回 `phone_taken_by_other_user`（這正是它該擋的情境）；唯有 customerId-driven helper 能在密碼確認後安全 finalize。 |
| **F5** | 為了 mitigate PR-2 conversion drop-off：`/oauth-confirm` 提供「我先不綁、純看內容」邊路 → 此 click 不寫任何 Customer，只發 emit ErrorLog 紀錄「未綁定 LINE 登入嘗試」供店長後台主動聯絡；oauth_line_session 5 分鐘 expire 即清，不留 orphan User |

> 註:**禁止**為了 conversion 直接幫顧客建 placeholder Customer 來「保證有 LINE badge」— 這是 PR-2 撤的原因,但代價就是現在 3 筆 prod drift。本 PR 系列正是要把這個 trade-off 翻過來。

---

## 4. 顧客沒有帳號時，建立 User / Account / Customer

### 4.1 期望流程（LIFF default）

```
LIFF entry → /api/liff/exchange → need_onboarding
        ↓
/liff/onboarding 表單(name + phone)
        ↓
bindLineToCustomerInStore(storeId, lineUserId, phone, name, lineName)
        ↓
$transaction:
  1) (storeId, phone) candidates 為空
  2) tx.user.create({ name, phone, role: "CUSTOMER", status: "ACTIVE" })
  3) tx.customer.create({
       name, phone (real), storeId,
       userId: newUser.id,
       authSource: "LINE",
       lineUserId, lineLinkStatus: "LINKED", lineLinkedAt,
       lineName,
     })
  4) tx.account.create({ userId, provider: "line", providerAccountId: lineUserId, ... })
        ↓
return { status: "created_new" }
        ↓
RELOGIN → 顧客已登入
```

**✓ 此路徑已對**（LIFF + bindLineToCustomerInStore canonical）。

### 4.2 必須 enforce 的條件

| 條件 | 怎麼 enforce |
| --- | --- |
| `Customer.phone` 必須是正規化台灣手機 | 既有 `normalizePhone()` + Zod schema 已 enforce |
| `Customer.phone` 不得 `startsWith("_oauth_line_")` | 新增 Zod refine / 在 `bindLineToCustomerInStore` 與 auth.ts 寫入點檢查（A2 invariant，**LINE-only**）；**禁止**擴成 `_oauth_` 廣義 ban — `_oauth_google_*` 屬於 Google OAuth fallback 路徑，PR-G5 train 不設計 Google 替代流程，連帶擋下會破壞首次 Google OAuth |
| 同 $transaction 內 User + Customer + Account[line] 三件齊全 | **Current baseline 並未 enforce**：`bindLineToCustomerInStore` User+Customer 同 tx、Account post-tx best-effort（§2.2）；auth.ts Case B 三件分次 top-level write（不在單一 `$transaction`）。**PR-G5 target**：新 entry point `bindLineToExistingCustomerById`（§5.3，existing-user 專用、不建 User）從一開始即 atomic；**Case B 走獨立的 activation helper `activatePrecreatedCustomerWithLine`（§5.3.3，User+Account+Customer 三件同 tx）**，PR-G5.5 收斂至該 activation helper；既有 `bindLineToCustomerInStore` 受 PR-C2 §6 鎖，atomicity 升級獨立評估。 |
| `Customer.lineLinkStatus === "LINKED"` ⇔ `Customer.lineUserId !== null` | 在 helper 集中 set；任何外部 inline update 都禁 |
| `authSource = "LINE"` 寫入點明確（不被 default 蓋掉） | 已對 |

### 4.3 非 LIFF 直接 LINE OAuth 的對等路徑

非 LIFF 路徑也要走「先收 phone、再 create」。**禁止 `_oauth_line_*` placeholder**。具體流程同 §3.4 F1-F4。

收到 phone 之後，server action 應**直接呼叫 `bindLineToCustomerInStore`**（不用 inline tx），由 helper 走「candidates 為空」分支建完整身份鏈。

> 重點:auth.ts / /oauth-confirm 都是「拿到 phone 之後的 thin caller」,真正寫入由 canonical helper 統一。這就是 PR-C3 原本計畫的事。

---

## 5. webhook 綁定碼 / LIFF onboarding / NextAuth LINE OAuth 三條路徑要如何一致

### 5.1 現況一致性矩陣

| 維度 | LIFF onboarding | webhook 綁定碼 | NextAuth Case A (customer 存在+userId) | NextAuth Case B (customer 存在+無 userId) | NextAuth Case C (customer 找不到) |
| --- | --- | --- | --- | --- | --- |
| 用 canonical helper? | **✓ 是** | ❌ inline `prisma.customer.update` + 條件 `syncLineAccountForUser` | ❌ inline | ❌ inline | ❌ inline `$transaction` |
| 建 placeholder phone? | ❌ 否 | n/a | n/a | n/a | **✓ 是（_oauth_line_*）** |
| 同 tx Account[line] sync? | ❌ baseline（User+Customer 同 tx；Account post-tx best-effort，sync 失敗 catch + 回 `error`、Customer 不 rollback → 殘留 `missing-account` 風險）／**PR-G5 target = ✓** | ❌（僅 customer.userId 存在時才 sync，否則留 orphan-line） | ❌ baseline（best-effort drift repair, PR-F1；Account.create 非同 tx） | ❌（User.create + Account.create top-level，不在單一 `$transaction`） | ✓（Case C 唯一在單一 `$transaction` 內寫 user/customer/account 三件 — 但 Case C 本身要在 PR-G5.4 撤除） |
| P2002 guard | ✓（helper level） | ❌ | ❌ | ❌ | ❌（tx 內 throw 會 rollback,但無 friendly status） |
| logLineBindEvent? | ✓ | ✓ | ✓ | ✓ | ✓ |
| 防 hijack 已啟用 Customer? | ✓（helper 回 `phone_taken_by_other_user`） | ✓（綁定碼必由店長產生） | n/a | n/a | ❌（直接建第二筆） |

### 5.2 收斂目標（單一寫入點原則）

**所有「會把 LINE 身份寫進 Customer/User/Account」的 path 都必須 wire 過 `bindLineToCustomerInStore`**。三條 path 在 helper 之上各自負責「身份來源驗證」即可：

| Path | 身份來源 | 餵給 helper 的 input |
| --- | --- | --- |
| LIFF onboarding | LIFF id_token + 表單 phone | `{ storeId, lineUserId, phone, name, lineName }` |
| webhook 綁定碼 | LINE OA bot webhook + 6 碼 code 對應到 Customer | `{ storeId, lineUserId, phone: <Customer.phone>, name: <Customer.name>, lineName: <displayName> }`;**helper 需多加一條 path:「強制綁定到已知 customerId」**因為這條 path 是 staff 預先建檔、顧客提供綁定碼證明 LINE 控制權,不走 phone match |
| NextAuth LINE OAuth (Case C 後的 /oauth-confirm) | OAuth callback + /oauth-confirm 表單 phone | `{ storeId, lineUserId, phone, name, lineName }`（同 LIFF） |

### 5.3 Canonical helper 的小幅擴充（與 `pr-c2-liff-onboarding-plan.md` §6 不衝突）

`bindLineToCustomerInStore` 現有 7 種 status 涵蓋 phone-driven 流程。webhook 綁定碼、`/oauth-confirm/finalize` NEED_LOGIN 路徑、auth.ts Case B 都是 **「customerId-driven」**（caller 已決定要綁哪筆 Customer），不需 phone 比對。要 wire 它們必須**在 helper 加新入口**：

```ts
bindLineToExistingCustomerById({
  storeId,          // required, trusted source (see §5.3.1):
                    //   webhook resolveStore / signed+verified oauth_line_session
                    //   cookie OR server-side nonce / NextAuth signIn signed cookie
  customerId,       // 由綁定碼 / verified cookie session / NEED_LOGIN finalize state resolve
  lineUserId,
  lineName,
}): { status:
  | "bound_existing"
  | "already_synced"
  | "customer_locked"
  | "store_mismatch"
  | "customer_has_no_user"     // §5.3.2: customer.userId IS NULL，無 User 可掛 Account
                               //         (a.k.a. skipped_no_user; PR-G5.1 二選一命名，
                               //          本文件統一用 customer_has_no_user)
  | "unique_conflict"
}
```

#### 📋 Pre-write checklist（existing-user helper 專屬；任何 caller 都必走完全部 5 步才可寫 DB）

此 checklist **僅適用於 existing-user helper `bindLineToExistingCustomerById`**（其先決條件是 `customer.userId !== null`）。所有呼叫該 helper 的 path（webhook **userId !== null 分支** / `/oauth-confirm/finalize` NEED_LOGIN）**必須**按以下順序執行；任何一步失敗 → return 對應 status 或 auth/session error + **0 byte DB 寫入**（含 AuditLog）。

> **NextAuth Case B 不適用本 checklist**：Case B 前提就是 `customer.userId === null`（staff 後台先建檔、顧客首次用 LINE OAuth 啟用），如果走本 checklist 會在 step 4 被 `customer_has_no_user` 擋下，啟用流程整個壞掉。Case B 必須走 §5.3.3 的 **activation helper `activatePrecreatedCustomerWithLine`**，**禁止** wire 至 `bindLineToExistingCustomerById`。

> **Webhook userId === null 分支也不適用本 checklist**：見 §5.3.2，webhook 既有 legacy 行為是「Customer.update 不建 User」（顧客僅憑綁定碼接 LINE、尚未有任何 auth secret），保留原樣，**不**經本 checklist 也**不**經 activation helper（無 OAuth 認證事件 → 不該自動建 User）。

| # | 檢查 | 在哪做 | 失敗回什麼 | 失敗時 DB 寫入 |
| - | --- | --- | --- | --- |
| **1** | **驗 oauth temp session 完整性**（僅當 `storeId` / `customerId` / `lineUserId` / `lineName` 任一來自 `oauth_line_session` cookie 時必做）：signature / decrypt / server-side nonce 任一機制（§5.3.1）通過才能讀取 cookie payload | caller（`/oauth-confirm/finalize` server action）— webhook resolveStore / NextAuth signIn JWT 路徑跳過本步 | auth/session error | **0 byte** |
| **2** | 用 `customerId` load Customer | helper 內部（read-only） | n/a（純 read） | **0 byte** |
| **3** | 驗 `customer.storeId === storeId` | helper 內部 | `{ status: "store_mismatch" }` | **0 byte** |
| **4** | 驗 `customer.userId !== null` | helper 內部 | `{ status: "customer_has_no_user" }` | **0 byte** |
| **5** | 在單一 `$transaction` (Serializable) 內執行 `Customer.update` + `Account.create` + AuditLog；任一 throw 整組 rollback（A3 atomicity） | helper 內部 | `{ status: "unique_conflict" }` / Prisma throw 重拋 | tx rollback → **0 byte** |

> **強制順序**：1 → 2 → 3 → 4 → 5。**不可**跳過任何一步、**不可**用 caller-side check 取代 helper-side check（step 3 / step 4 內 helper enforce 是唯一真實守門），webhook 與 finalize 都不得把 step 1 推給 helper 做（helper 不認 cookie；caller 才知道 source 是不是 cookie）。

#### Helper contract semantics（PR-G5.1 必實作）

1. **`storeId` 是 required, trusted context**：呼叫者必須從**可驗證**的可信來源取得（不可從 URL query / form field / 不受驗證的 raw cookie / 任何 client payload）。**可信來源**只限以下三類，**且 source 本身必須通過 server-side 驗證後** caller 才能取值：
   - **webhook resolveStore**：webhook handler 解析 `lineDestination` 對到的 `Store.id`（DB-resolved，不接受 client-supplied）。
   - **signed/encrypted oauth_line_session cookie** 或 **server-side nonce 驗證後的 session row**：必須經 §5.3.1 描述的 integrity check 通過後才能讀取 `storeId`；raw HttpOnly cookie **不算**可信來源。
   - **NextAuth signIn 階段已 resolve 的 `targetStoreId`**（signed JWT session 取自 cookie，cookie 已由 NextAuth 簽名驗證）。
2. **第一步:用 `customerId` 載入 Customer**（read-only），不寫入任何 row。
3. **第二步（任何寫入前必驗）:`customer.storeId === storeId` 必須相等**。不等 → return `{ status: "store_mismatch" }`，**helper 不執行任何 DB 寫入**（Customer / User / Account / AuditLog 一律 0 byte）。global `customerId` 在多店架構下不足以唯一定位:某 customerId 落在 store A，但呼叫者期望操作 store B → 必須立刻拒絕。
4. **第三步（必驗）:`customer.userId !== null`**。若為 null（staff 後台先建檔但顧客還沒啟用登入）→ return `{ status: "customer_has_no_user" }`，**helper 不執行任何 DB 寫入**。無 User 就沒有對象掛 `Account[line]`；此 helper **不會**自動為這種 Customer 建 User（避免靜默 schema 行為改動 + 違反 PR-G5.2 webhook refactor 的 golden-output 保證，見 §5.3.2）。
5. **第四步:Customer.update + Account.create 進同一個 `$transaction` (Serializable)**，任一 throw 整組 rollback（A3 atomicity，§1.3）。
6. **cross-store guard + no-user guard 只在 helper 裡實作一次**:webhook handler / `/oauth-confirm/finalize` / Case B caller **不可** 在外面再寫一份 `if (customer.storeId !== storeId)` 或 `if (customer.userId === null)` — 重複實作會發散，正確做法是 caller 把可信 `storeId` 傳進來、讓 helper 統一守。

#### 5.3.1 oauth_line_session cookie integrity 要求（PR-G5.4 必實作）

**問題（Codex P1，已二度提醒）**：既有 `src/lib/server/oauth-temp-session.ts` 把 `{ lineUserId, displayName, storeId, nonce }` 以 **raw JSON 直接寫進 HttpOnly cookie**（具體實作:`cookieStore.set(OAUTH_LINE_SESSION_COOKIE, JSON.stringify(session), { httpOnly: true, sameSite: "lax", maxAge: 300, secure: true })`）。HttpOnly 只擋 JavaScript 讀取，**完全不**對抗「使用者用 DevTools / curl / fetch 手刻 `Cookie:` request header 重寫 payload」。在 PR-G5.4 落實 §5.3.1 方案 A/B/C 任一前，`/oauth-confirm/finalize` 若直接消費 cookie 欄位，攻擊者可以：

- 完全跳過 LINE OAuth 與 `/api/oauth-line-stage`，
- 自己手刻 `oauth_line_session={"lineUserId":"<任意 U...>","storeId":"<目標店>","customerId":"<自己已認證的>","nonce":"x","displayName":"x"}`，
- 直奔 `/oauth-confirm/finalize`，
- 把任意 LINE 身份綁到自己 `customerId` 上（account takeover）。

**field-level 禁止規則（必須寫進 PR-G5.4 review checklist）**：

- ❌ `/oauth-confirm/finalize` **不可**消費 `tempSession.storeId` 來決定 `bindLineToExistingCustomerById.storeId` ── 直到 step 1 integrity 通過。
- ❌ `/oauth-confirm/finalize` **不可**消費 `tempSession.lineUserId` 來決定 `bindLineToExistingCustomerById.lineUserId` ── 直到 step 1 integrity 通過。
- ❌ `/oauth-confirm/finalize` **不可**消費 `tempSession.customerId` 來決定 `bindLineToExistingCustomerById.customerId` ── 直到 step 1 integrity 通過。
- ❌ `/oauth-confirm/finalize` **不可**消費 `tempSession.lineName` 來決定 `bindLineToExistingCustomerById.lineName` ── 直到 step 1 integrity 通過。
- ❌ 任何把 raw `getOAuthTempSession()` 回傳值傳進 helper 的 PR review，必須在 PR description 列出「step 1 integrity 已落實 + 驗證點」，否則直接退件。
- ✅ Helper 仍 enforce step 3 / step 4 — 但這是 defense-in-depth，**不**取代 step 1 必須在 caller 端做完。

**設計規則（PR-G5.4 ship 前必擇一落地）**:

| 方案 | 描述 | 取捨 |
| --- | --- | --- |
| **A. Signed cookie**（推薦） | cookie payload 後附 HMAC-SHA256（密鑰來自 `NEXTAUTH_SECRET` 或獨立 env），讀取時必驗簽，簽錯 → 視同無 cookie | 簡單；payload 仍可被 read（HttpOnly 擋 JS、但用戶仍可在 DevTools 看自己的 cookie）— 對本 use case 無 confidentiality 需求所以可接受 |
| **B. Encrypted cookie (JWE)** | A 之上再對 payload 加密 | confidentiality + integrity 都覆蓋；但只有 server 看得到 payload，debug 麻煩 |
| **C. Server-side nonce / session 表** | cookie 只放 opaque `nonce`，真實 payload 存 Redis / DB row；讀取時用 nonce 對 server-side store 取回；server-side row 不存在 / 被消費過 / 過期 → 視同無 cookie | 最強；多一次 DB / cache hit；需新基礎設施 |

**絕對禁止**：把現行「raw `JSON.stringify(session)` + HttpOnly + sameSite=lax + maxAge=300」當成「足以信任 payload」。**HttpOnly 不是 integrity 機制**，本文件之前任何把 `oauth_line_session` cookie 直接列為 "trusted source" 的描述都必須讀作「**經 A / B / C 任一機制驗證通過之後**才 trusted」。在 §5.3 Pre-write checklist step 1 通過之前，`tempSession` 物件**所有欄位**都是 untrusted user input，等同 `request.body`。

**`/oauth-confirm/finalize` 必驗順序**（= §5.3 Pre-write checklist 的 step 1 細節）:

1. read cookie → 驗 signature / decrypt / 用 nonce 對 server-side store 取回 — 任一步失敗 → return auth/session error，**0 byte DB 寫入**（含 AuditLog），**不**讀取也**不**回傳 `tempSession` 任何欄位給 client。
2. 驗 nonce 一次性（已用過 → reject、視同 step 1.1 失敗）。
3. 驗 TTL 未過期（已過期 → reject、視同 step 1.1 失敗）。
4. 全部通過後才能把（且只能把）`tempSession.storeId` / `tempSession.lineUserId` / `tempSession.lineName` 傳給 `bindLineToExistingCustomerById`；`customerId` 來自 PR-2 `resolveLineLogin` 的 NEED_LOGIN state（同樣需 verified — `resolveLineLogin` 結果存放與消費機制亦適用本節整潔規則）。

#### 5.3.2 No-user Customer 處理（PR-G5.1 helper / PR-G5.2 webhook 各自規則）

**Helper 端（`bindLineToExistingCustomerById`）**：見上方 rule 4。`customer.userId === null` → `customer_has_no_user`、0 byte 寫入；helper **不**靜默建 User。

**Webhook 綁定碼 PR-G5.2 refactor 端**：既有 `handleBindingRequest` 對 `Customer.userId === null` 的支援必須**保留** — 已上線的 staff-pre-created Customer + 顧客先用綁定碼接 LINE 的 flow 不能斷。具體做法：

- webhook caller 在呼叫 `bindLineToExistingCustomerById` 之前先檢查 `customer.userId`：
  - 若 `null` → 不呼叫 helper，沿用 legacy 寫法：`prisma.customer.update({ lineUserId, lineLinkStatus, lineLinkedAt })`，**不** sync Account（無 User 可掛）。這正是 §5.1 矩陣裡 webhook 「同 tx Account[line] sync? ❌（僅 customer.userId 存在時才 sync，否則留 orphan-line）」描述的 legacy 行為。
  - 若 `!== null` → 呼叫新 helper 走 atomic Customer.update + Account.create。
- 這個 caller-side branch 並**不**重新發明 cross-store guard（helper 仍會驗 storeId）— 只是在 caller 端決定「該不該走 helper」vs「走 legacy update」。
- PR-G5.2 golden-output test 必須同時覆蓋兩條 branch（userId null vs not-null），確保 byte-equal。

**NEED_LOGIN / `/oauth-confirm/finalize` 端**：NEED_LOGIN 路徑前提就是「該 phone 已綁存有 password 的 User」（resolveLineLogin §3 三狀態判定中的 NEED_LOGIN 條件），所以 `customer.userId` 必非 null。但 finalize 仍必須做**防呆 re-check**：若 `customer.userId === null`（race condition / state 流轉異常）→ helper 回 `customer_has_no_user`、finalize **不**重試自動建 User，而是 redirect 回 `/oauth-confirm` 顯示「請改走 LIFF onboarding 從頭啟用帳號」。靜默自動建 User 會破壞「NEED_LOGIN = 已認證為既有顧客」的語意。

> 設計約束:這是「**新增 API**」不是「**改既有 API**」,所以不違反 `pr-c2-liff-onboarding-plan.md` §6「不改 `bindLineToCustomerInStore` 介面或行為」— 既有的 phone-driven 入口 0 動。新 entry point 可以**共用** internal mask helpers 與 logLineBindEvent，但 atomicity + cross-store guard 必須升級：`bindLineToExistingCustomerById` 從一開始就**強制** Customer.update + Account.create 同 `$transaction`（任一 throw 整組 rollback）、且 helper 內部 enforce `storeId` 比對，而**不是**沿用既有 helper「User+Customer in tx, Account post-tx best-effort」的 baseline 行為。換言之這是新 entry 的擴充屬性，**不**是從既有 helper 繼承來的。

#### 5.3.3 Case B activation helper：`activatePrecreatedCustomerWithLine`（PR-G5.5 必實作；獨立於 existing-user helper）

**為什麼要獨立的 helper（Codex round 5 P1）**：existing-user helper `bindLineToExistingCustomerById` 的 §5.3 Pre-write checklist step 4 要求 `customer.userId !== null`，**正是 Case B 的反面**。Case B 的本質是：

- staff 後台已先建好 `Customer { name, phone, userId: null, lineUserId: null }`，
- 顧客首次用 **LINE OAuth** 進站，
- NextAuth signIn callback 命中該 Customer，
- **需要** 在這個瞬間原子地：建立 `User` + 建立 `Account[line]` + 更新 `Customer.userId / lineUserId / lineLinkStatus / lineLinkedAt`。

如果硬把 Case B wire 到 `bindLineToExistingCustomerById`，會被 step 4 立刻 `customer_has_no_user` 擋下，**首次 LINE 啟用流程整個斷掉**。所以 PR-G5.5 必須 wire 一支**獨立**的 activation helper，**不可**共用 existing-user helper。

> **Case B activation helper input must include `oauthProfile` + `oauthAccount`** because PR-G5.5 is **byte-equivalent refactor-only**：caller 必須把 NextAuth signIn callback 內現有 baseline 會寫入 `User` / `Account[line]` 的 OAuth 欄位**原值**轉交 helper（profile email/image/name + account type/provider/providerAccountId/access_token/refresh_token/id_token/expires_at/scope/token_type）；漏帶任何一個 = silently drop baseline 欄位 = 違反 refactor-only 合約。同樣地，helper 也**不得**靜默增加 baseline 沒寫的欄位（如 `Account.session_state`）或改變 `User.name` 來源（baseline 用 `customer.name`，**不是** `oauthProfile.name`）。

**接口**（新增於 `src/server/services/bind-line-to-customer.ts`，與 existing-user helper 並列）:

```ts
activatePrecreatedCustomerWithLine({
  storeId,           // required, trusted source（同 §5.3 rule 1 三類）
                     // Case B 來源 = NextAuth signIn callback 內 resolved targetStoreId
  customerId,        // 由 LINE OAuth profile + (storeId, lineUserId / email / phone) match 取得
  lineUserId,        // 由 LINE OAuth profile 取得（已通過 NextAuth signIn provider 驗證）
  lineName,          // displayName，best-effort 寫入 Customer.lineName

  // ⚠ OAuth metadata preservation（Codex round 9 P2 + round 10 P2 baseline-match）—
  //   PR-G5.5 必須**精準對齊** auth.ts Case B 現行寫入的「**那一組**」OAuth 欄位（不是
  //   provider schema 上所有可能欄位），refactor 才能符合「byte-equivalent except
  //   transactional grouping」的合約。多寫 = 靜默變動 row 內容；少寫 = silently drop。
  //   ⚠ Baseline (auth.ts Case B lines 620-647) 唯一真相，違反 = 自動 refactor regression。
  oauthProfile: {
    email,           // → User.email（baseline 行 625：`email: oauthEmail`；NULL 也要原值傳）
    image,           // → User.image（baseline 行 629：`image: oauthImage`；NULL 也要原值傳）
    name,            // ⚠ **不**寫進 User.name（baseline 用 `customer.name`，見 step 6）；
                     //   此欄位僅作為 caller-side 診斷 / Customer.lineName fallback 來源
                     //   （baseline 行 656：`if (oauthName) updateData.lineName = oauthName`）。
                     //   如果 PR-G5.5 想改成把它寫進 User.name，必須在 PR description 明寫
                     //   為「intentional behavior change vs baseline」並另開 PR train，
                     //   **不**塞進 PR-G5.5 refactor-only scope（Codex round 10 P2）。
  },
  oauthAccount: {
    provider,            // baseline 行 638：`provider: account.provider`
    providerAccountId,   // baseline 行 639：`providerAccountId: account.providerAccountId`
    type,                // baseline 行 637：`type: account.type`
    access_token,        // baseline 行 640；null/undefined 也必須原值傳遞
    refresh_token,       // baseline 行 641
    id_token,            // baseline 行 645
    expires_at,          // baseline 行 642
    scope,               // baseline 行 644
    token_type,          // baseline 行 643
    // ⚠ session_state **故意不在此 list**：baseline auth.ts Case B 沒寫入此欄位
    //   （見 lines 634-647 — 完全沒提到 session_state）；若加進 helper 即等於 silently
    //   擴增 Account row 欄位，違反 byte-equivalent（Codex round 10 P2）。若未來
    //   provider 真的要保留此欄位需明寫為 intentional change + 另開 PR。
  },
}): { status:
  | "activated"                  // ✅ 成功建 User + Account + update Customer
  | "store_mismatch"             // customer.storeId !== storeId（§5.3 rule 1 cross-store 防呆）
  | "customer_already_has_user"  // ⚠️ 與 existing-user helper 反向 — 此情境應改走 existing-user helper
  | "customer_already_linked_to_other_line"  // Customer.lineUserId 已被別的 LINE 占用 → 拒絕（防 hijack）
  | "unique_conflict"            // Prisma P2002（race condition：別的 path 同時也在啟用）
}
```

**OAuth 欄位保留規則（Codex round 9 + round 10 P2 必入測試；baseline = auth.ts Case B lines 620-647 的精準快照）**：

- PR-G5.5 是 **refactor-only**：把 Case B 既有「`User.create` + `Account.create` + `Customer.update` 三件分次 top-level write」整併進單一 `$transaction`，**除了 transactional grouping 之外，每個 row 寫的欄位集合與值必須完全等同 baseline**。具體鎖定：
  - **`User.create` data** = `{ name: customer.name, email: oauthProfile.email, phone: customer.phone || null, role: "CUSTOMER", status: "ACTIVE", image: oauthProfile.image, customer: { connect: { id: customerId } } }`
    - ⚠ `name` 來源是 **`customer.name`**（baseline 行 624），**不是** `oauthProfile.name`（Codex round 10 P2）。
    - ⚠ `phone` 來源是 `customer.phone || null`（baseline 行 626），易漏；helper 必須在 read Customer 時一起取出。
    - `customer: { connect: ... }` 是 Prisma nested write，把 Customer.userId 設成新 User.id；功能上等同事後 `prisma.customer.update({ data: { userId } })`，但 baseline 用 nested 寫法 — helper 採同寫法可避免額外 Update 操作出現在 golden-output SQL trace。
  - **`Account.create` data** = `{ userId: newUser.id, type: oauthAccount.type, provider: oauthAccount.provider, providerAccountId: oauthAccount.providerAccountId, access_token, refresh_token, expires_at, token_type, scope, id_token }`（**9 欄位，按 baseline 行 634-647 順序**）。
    - ⚠ **不**寫 `session_state`（baseline 完全沒提到此欄位 — Codex round 10 P2）；任何 token 欄位 null/undefined 也必須原值傳遞、key 不可被 helper silently drop。
  - **`Customer.update` data**（在同 tx 內接續執行，**取代** baseline 行 663 的獨立 update）= `{ authSource: "LINE", lineUserId, lineName, lineLinkStatus: "LINKED", lineLinkedAt: <now> }`（baseline 行 650-657）。
    - ⚠ `authSource: "LINE"` 必寫（baseline 行 650 第一個欄位，常被忽略）；`lineName` 仍是 caller 傳入的（fallback chain: caller-provided `lineName` ?? `oauthProfile.name`，與 baseline 行 656 `if (oauthName) updateData.lineName = oauthName` 對齊；若 `lineName` 與 `oauthProfile.name` 都是 null/undefined，此欄位不寫入 — 與 baseline 一致）。
- Helper **不得** silently drop 任何上面列出的 baseline 欄位，**也不得** silently 增加未在 baseline 出現的欄位（如 `session_state`）。
- 若未來真有業務需求要改動 OAuth metadata / User 欄位來源（例如：把 `User.name` 改成從 `oauthProfile.name`），**另開 PR train**、明確 PR description 寫「intentional change vs PR-G5.5 byte-equivalent baseline」；**不**在 PR-G5.5 內偷渡。

#### 📋 Pre-write checklist for activation helper（與 existing-user helper 的 step 4 反向）

| # | Check | Where | Failure status | DB writes |
| - | --- | --- | --- | --- |
| **1** | 驗 caller 來源是可信 trust source（Case B 來源 = NextAuth signIn callback 已 resolve 的 `targetStoreId`，本身就是 server-side trusted；**不需要** §5.3.1 cookie integrity 驗證 — Case B 走 NextAuth signed JWT 不走 oauth_line_session cookie） | caller | n/a（trust source 是 NextAuth 機制） | 0 |
| **2** | 用 `customerId` load Customer（read-only）| helper 內部 | n/a | 0 |
| **3** | 驗 `customer.storeId === storeId`（cross-store 防呆） | helper 內部 | `store_mismatch` | 0 |
| **4** | 驗 **`customer.userId === null`**（與 existing-user helper 反向）— 已有 userId → caller wire 錯了 helper | helper 內部 | `customer_already_has_user`（提示 caller 改走 `bindLineToExistingCustomerById`） | 0 |
| **5** | 驗 `customer.lineUserId === null`（防 hijack：Customer 已綁別的 LINE 不可被覆寫） | helper 內部 | `customer_already_linked_to_other_line` | 0 |
| **6** | 在單一 `$transaction` (Serializable) 內 **原子地**（**逐欄位 byte-equivalent vs auth.ts Case B baseline，lines 620-647**；Codex round 9 + round 10 P2）: (a) `prisma.user.create` 建 User，**欄位 = `{ name: customer.name, email: oauthProfile.email, phone: customer.phone || null, role: "CUSTOMER", status: "ACTIVE", image: oauthProfile.image, customer: { connect: { id: customerId } } }`** — ⚠ `User.name` 來源是 `customer.name`（**不是** `oauthProfile.name`，baseline 行 624）；`phone` 必寫 `customer.phone || null`（baseline 行 626，易漏）；`customer: { connect: ... }` 採 baseline nested-write 寫法，避免額外 Update 出現在 golden-output trace；(b) `prisma.account.create` 建 Account，**欄位 = `{ userId: newUser.id, type: oauthAccount.type, provider: oauthAccount.provider, providerAccountId: oauthAccount.providerAccountId, access_token: oauthAccount.access_token, refresh_token: oauthAccount.refresh_token, expires_at: oauthAccount.expires_at, token_type: oauthAccount.token_type, scope: oauthAccount.scope, id_token: oauthAccount.id_token }`** — **共 10 欄位**（含 `userId` + 9 個 OAuth/token 欄位）；⚠ **不**寫 `session_state`（baseline 完全不寫，加上去 = 靜默擴增 row 內容、違反 byte-equivalent，Codex round 10 P2）；任何 token 欄位 null/undefined 也必須原值傳入、key 不可被 helper silently drop；(c) `prisma.customer.update`（同 tx 內接續，取代 baseline 行 663 獨立 update）寫 `{ authSource: "LINE", lineUserId, lineName: lineName ?? oauthProfile.name ?? undefined, lineLinkStatus: "LINKED", lineLinkedAt: now }` — ⚠ `authSource` 必寫（baseline 第一個欄位、常被忽略）；`lineName` fallback 鏈與 baseline 行 656 `if (oauthName) updateData.lineName = oauthName` 一致（若兩者皆 null/undefined 則不寫此欄位）；**不**寫 `userId: newUser.id`（已由 step (a) 的 `customer: { connect }` 設定，避免重複 update）；**(d) 無 AuditLog 寫入**（baseline auth.ts Case B lines 620-647 完全沒有 AuditLog write — 只做 User.create + Account.create + Customer.update 三件）— **PR-G5.5 是 byte-equivalent refactor-only，禁止新增 AuditLog**；若未來要補 Case B activation 的 audit trail，必須另開**標明為 intentional behavior change** 的獨立 PR，不能混在 byte-equivalent refactor-only scope 內（Codex round 11 P2）；任一 throw 整組 rollback（A3 atomicity） | helper 內部 | `unique_conflict`（P2002）/ Prisma throw 重拋 | tx rollback → 0 |

> **Activation helper 與 existing-user helper 的明確分工**：
> | | `bindLineToExistingCustomerById`（§5.3） | `activatePrecreatedCustomerWithLine`（§5.3.3） |
> | --- | --- | --- |
> | 適用情境 | existing-user 顧客（已有 `userId` + 已認證身份）綁 LINE | staff-precreated Customer（`userId === null`）首次 LINE OAuth 啟用 |
> | 對 `customer.userId === null` 的行為 | **拒絕**（`customer_has_no_user`、0 byte） | **唯一接受的入口**（建立 User） |
> | 對 `customer.userId !== null` 的行為 | **正常 path**（update Customer + create Account） | **拒絕**（`customer_already_has_user`、0 byte） |
> | typical caller | webhook bind-code (userId !== null 分支)、`/oauth-confirm/finalize` NEED_LOGIN | NextAuth signIn callback Case B |
> | trust source | webhook resolveStore / signed+verified oauth_line_session cookie / NextAuth signed JWT | NextAuth signIn callback 已 resolve 的 `targetStoreId` |
> | 是否需 §5.3.1 cookie integrity verify | ✅ 是（若 source 是 cookie） | ❌ 否（NextAuth signIn 不經 cookie） |
> | 是否建 User | ❌ 不建（顧客本來就有 User） | ✅ 建（這正是 activation 的核心動作） |
> | 同 $transaction 寫入內容 | Customer.update + Account.create + AuditLog | **User.create + Account.create + Customer.update**（多一個 User.create；**無 AuditLog**：baseline Case B 不寫 AuditLog，PR-G5.5 byte-equivalent refactor-only 不可新增 — Codex round 11 P2） |
>
> **caller 路由規則**（避免誤接）：
> - webhook bind-code:`userId !== null` → existing-user helper；`userId === null` → **不**接任何 helper，沿用 legacy `prisma.customer.update`（§5.3.2）— webhook 路徑下顧客尚未通過 OAuth 認證，**不該**自動建 User。
> - NextAuth Case B（signIn callback）→ activation helper（**唯一** wire 該 helper 的 caller）。
> - NextAuth Case A（已有 userId）→ 不動，PR-F1 已加 best-effort drift repair（§7.3 R5）。
> - `/oauth-confirm/finalize` NEED_LOGIN → existing-user helper。

### 5.4 NextAuth Case A / B 是否也要 wire helper

- **Case A**（customer 存在且 userId 已設）：本質是「補寫 Account[line]」的 drift repair。helper 沒有對應 entry point，且 PR-F1 已加 P2002 guard + best-effort logic。**建議不動**，避免 over-engineering。
- **Case B**（customer 存在但無 userId）：本質是「為 backend-pre-created Customer 啟用 NextAuth User + 綁 LINE」。**必須 wire §5.3.3 的 activation helper `activatePrecreatedCustomerWithLine({ storeId, customerId, lineUserId, lineName, oauthProfile, oauthAccount })`**，其中 `storeId` 從 NextAuth signIn 階段已 resolve 的 `targetStoreId` 傳入（trusted source — 不是來自 user input、不經 cookie）；`oauthProfile` 從 NextAuth signIn callback 的 `user` 參數萃取 `{ email, image, name }`（⚠ `name` 不會被寫進 `User.name`，僅作 Customer.lineName fallback；`User.name` 用 `customer.name`，baseline 行 624 — Codex round 10 P2）；`oauthAccount` 從 signIn callback 的 `account` 參數萃取 **9 個欄位** `{ provider, providerAccountId, type, access_token, refresh_token, id_token, expires_at, scope, token_type }`（⚠ **無 `session_state`**，baseline auth.ts Case B lines 634-647 完全沒寫此欄位 — 加上去 = silently 擴增 Account row、違反 byte-equivalent，Codex round 10 P2；列出的 9 個欄位 null/undefined 也必須原值傳遞，不可 silently drop — Codex round 9 P2）。**禁止** wire 至 existing-user helper `bindLineToExistingCustomerById` — 那條 helper 的 step 4 會在 `customer.userId === null` 立刻 abort，把 Case B 啟用流程整個打斷（Codex round 5 P1 點出的 regression）。activation helper 內部會自驗 `customer.storeId === storeId` + `customer.userId === null` + `customer.lineUserId === null`，Case B caller 不需要在外面重複防衛。

---

## 6. 需要哪些 PR 拆分

| PR | 範圍 | 大小 | 觀察 / 守門 |
| --- | --- | --- | --- |
| **PR-G5.0** | 本文件 merge | docs-only | reviewer 確認 invariants / 收斂方向無爭議 |
| **PR-G5.1** | 加 helper **新入口（兩支獨立函式）**：(a) `bindLineToExistingCustomerById`（§5.3，existing-user 專用，rejects `userId === null`）；(b) `activatePrecreatedCustomerWithLine`（§5.3.3，Case B 啟用專用，**accepts** `userId === null` 並原子建 User + Account + Customer.update）。純擴充,不改既有 `bindLineToCustomerInStore` 介面 + 兩支各自單元測試 | M | 不 wire 任何 caller;build/test 通過即可上 prod 觀察(同 PR-C1 的 dead-code-on-prod 策略) |
| **PR-G5.2** | Webhook 綁定碼路徑收斂:`handleBindingRequest` 改為呼叫 `bindLineToExistingCustomerById`;移除 inline `prisma.customer.update` + 條件 sync | M | Golden-output tests:對比 refactor 前後對相同 input 的 DB 寫入序列完全一致 |
| **PR-G5.3** | Zod / helper 加 A2 invariant 校驗：**任何 Customer.phone 寫入點不得 `startsWith("_oauth_line_")`**（**LINE-only**，**禁止**用 `_oauth_` 廣義 prefix — 會連帶擋 `_oauth_google_*` 而破壞首次 Google OAuth，Codex round 6 P2）；**既有 row 不動**；新增 test，含 `_oauth_google_*` 必須 accept 的 regression case | S | 此 PR 上線後，Case C 仍會試圖建 `_oauth_line_*` → 會 throw → NextAuth signIn fail（Google Case C 不受影響）。**故 PR-G5.3 必須與 PR-G5.4 同 PR train 或前後夾擊**，不可單獨 ship。**Rollback 也耦合**：A2 flag 與 PR-G5.4 Case C flag 屬同一個 paired rollback bundle，**禁止**單獨翻單側（R15、§9.2.6 matrix） |
| **PR-G5.4** | auth.ts Case C 改寫：**移除** inline placeholder create；改為**簽 stage token via `oauth-stage-token.ts` + return Auth.js redirect URL 指向 `/api/oauth-line-stage`**（該 route handler 才呼叫 `setOAuthTempSession`、寫 cookie、redirect `/oauth-confirm`）；復活 `/oauth-confirm` 流程入口；`finalizeLineBind` 走 customerId-driven `bindLineToExistingCustomerById`（**非** phone-driven） | L | 高風險；feature flag 包住；monitor signIn 完成率；同 PR ship PR-G5.3。`/oauth-confirm` 邊路「先不綁」必須有。**Rollback 必走 §9.2.6 paired bundle runbook**：Case C flag 翻回 legacy `_oauth_line_*` placeholder fallback 前**必先**把 PR-G5.3 A2 flag 翻 disabled，否則 A2 會 throw 擋下所有 `_oauth_line_*` 寫入、LINE OAuth 仍掛 — partial rollback 完全沒救到事故（R15）。PR description 必附 rollback runbook 模板 |
| **PR-G5.5** | auth.ts Case B 收斂到 **`activatePrecreatedCustomerWithLine`（§5.3.3 activation helper，唯一 wire 此 helper 的 caller）**；**禁止** wire 至 `bindLineToExistingCustomerById`（會被 step 4 `userId === null` 擋下、首次 LINE 啟用流程整個壞掉，Codex round 5 P1）。Refactor only — 把 Case B 既有的「User.create + Account.create + Customer.update 三件分次 top-level write」整併進 helper 單一 `$transaction`；**OAuth metadata 與 baseline 精準對齊**（Codex round 9 + round 10 P2）：caller 從 NextAuth signIn callback 萃取 `oauthProfile = { email, image, name }`（其中 `name` **不**寫入 `User.name`，僅作 Customer.lineName fallback；`User.name` 從 `customer.name` 取，baseline 行 624）+ `oauthAccount = { provider, providerAccountId, type, access_token, refresh_token, id_token, expires_at, scope, token_type }`（**9 欄位、無 `session_state`**，baseline 行 634-647 完全沒寫此欄位 — 加上去 = 違反 byte-equivalent） | S | Golden-output tests：(a) 既有 Case B input 經 refactor 後 DB 寫入**逐欄位 byte-equal vs `src/lib/auth.ts` lines 620-647 baseline**：`User.{name (← customer.name), email, phone (← customer.phone || null), role: "CUSTOMER", status: "ACTIVE", image}` + `Account.{userId, type, provider, providerAccountId, access_token, refresh_token, expires_at, token_type, scope, id_token}`（**10 欄位，無 session_state**）+ `Customer.{authSource: "LINE", lineUserId, lineName, lineLinkStatus: "LINKED", lineLinkedAt}`（除了 timestamp 與 tx grouping 之外，不應有任何欄位差異 / 不應出現 baseline 沒有的欄位）；(b) regression：spy 確認 Case B 路徑**不**呼叫 `bindLineToExistingCustomerById`；(c) regression：null/undefined OAuth token 欄位必須照寫進 Account row、**不**被 helper silently drop；(d) regression：`customer.name !== oauthProfile.name` 時 `User.name === customer.name`（不是 oauthProfile.name）；(e) regression：Account row 不含 `session_state` column data |
| **PR-G5.6** | CI gate：加 read-only script `scripts/diagnose-new-placeholder-customers.ts`，掃 `Customer.phone LIKE '_oauth\_line\_%' AND createdAt > <feature-flag-ship-date>`（**LINE-only prefix**；`_oauth_google_%` 不在掃描範圍 — Codex round 6 P2），>0 → fail CI | S | 寫入端有 A2 校驗、讀取端有 CI gate，雙保險（兩者都僅針對 LINE） |
| **PR-G5.7** | 把 PR-F1.2 audit 排程進 CI(weekly),mismatch 數提升 → 自動 issue | S | 不直接 fail CI(可能有先存 historical),但提醒 |
| **PR-G5.8** | 1-2 週 prod 觀察期通過後：刪除 auth.ts **LINE** Case C feature flag、刪除 `_oauth_line_*` 寫入字串常數與 dead path；**Google Case C 的 `_oauth_google_*` 寫入路徑保持不動**（PR-G5 train 不替換 Google OAuth fallback，Codex round 6 P2） | S | 在這之前 LINE dead code 留著 = roll-back lever；Google path 始終不在 PR-G5 scope |
| **(獨立)** | 第 3 筆 `needs_manual_business_check` 處理(per-customer SOP,沿用 PR-F2 範本) | — | 由業務拍板後另開,**不在 PR-G5 系列** |
| **(獨立)** | Historical `_oauth_line_*` placeholder Customer backfill / cleanup | — | 寫入端鎖死後,**另開** read-only diagnose + manual review,**不在 PR-G5 系列** |

> 順序原則:helper 擴 → caller 收斂 → 把 placeholder 路徑關掉(同 PR ship 校驗+功能)→ CI gate → 觀察期 → 清理 dead code。每步可獨立 rollback。

---

## 7. 哪些檔案要改 / 不能碰

### 7.1 必改（PR-G5.1 ~ PR-G5.5）

| 檔案 | 變動 | 哪個 PR |
| --- | --- | --- |
| `src/server/services/bind-line-to-customer.ts` | **新增兩支獨立 entry point**：(a) `bindLineToExistingCustomerById({ storeId, customerId, lineUserId, lineName })`（§5.3，existing-user 專用，rejects `userId === null` 回 `customer_has_no_user`、0 byte）；(b) `activatePrecreatedCustomerWithLine({ storeId, customerId, lineUserId, lineName, oauthProfile: { email, image, name }, oauthAccount: { provider, providerAccountId, type, access_token, refresh_token, id_token, expires_at, scope, token_type } })`（§5.3.3，Case B 啟用專用；⚠ `oauthAccount` **9 欄位、無 `session_state`**，baseline auth.ts Case B lines 634-647 沒寫此欄位 — Codex round 10 P2）；**accepts** `userId === null` 並在單一 `$transaction` 原子建 User（**`User.name` ← `customer.name`**，不是 `oauthProfile.name` — baseline 行 624；亦寫 `phone: customer.phone || null`、`image: oauthProfile.image`、`email: oauthProfile.email`）+ Account[line]（含 baseline 列出的 9 個 OAuth/token 欄位、null/undefined 也照寫）+ 更新 Customer（**含 `authSource: "LINE"`** + lineUserId/lineName/lineLinkStatus/lineLinkedAt）；rejects `userId !== null` 回 `customer_already_has_user` 提示 caller 改 wire existing-user helper；**OAuth 欄位逐欄位 byte-equivalent vs 既有 Case B baseline（auth.ts lines 620-647）為 PR-G5.5 refactor-only 合約核心**，Codex round 9 + round 10 P2）。兩支共用 internal mask helpers + `logLineBindEvent` + 同店 storeId 比對 + A3 atomicity，但 **status enum 與 step 4 條件方向相反，且 activation helper 額外帶 oauthProfile/oauthAccount 參數**。**不改**既有 `bindLineToCustomerInStore` | G5.1 |
| `src/server/services/bind-line-to-customer.test.ts` | 新增 entry point 的單元測試（含 `store_mismatch` pre-write semantics、`customer_has_no_user` pre-write semantics、A3 atomicity test） | G5.1 |
| `src/app/api/line/webhook/route.ts` | `handleBindingRequest` refactor：caller-side 先檢查 `customer.userId`：若 `null` → **沿用 legacy** `prisma.customer.update({ lineUserId, lineLinkStatus, lineLinkedAt })`、跳過 Account sync（無 User 可掛，§5.3.2）；若 `!== null` → 呼叫 `bindLineToExistingCustomerById({ storeId: resolvedStoreId, customerId, lineUserId, lineName })`，`storeId` 來自 webhook resolveStore（trusted）。**不**在 caller 端重複寫 cross-store 比對（helper 已 enforce）。**兩條 branch 都要被 PR-G5.2 golden-output 測試覆蓋**，確保 byte-equal vs refactor 前 | G5.2 |
| `src/__tests__/webhook-bind-code.test.ts`（新檔或補既有） | golden-output tests | G5.2 |
| `src/lib/normalize.ts` 或新 `src/lib/customer-phone-validation.ts` | A2 invariant：phone 不得 `startsWith("_oauth_line_")`（**LINE-only**；**禁止** 寫成 `startsWith("_oauth_")` — 會連帶擋 `_oauth_google_*` 而破壞首次 Google OAuth，Codex round 6 P2） | G5.3 |
| `src/lib/auth.ts` Case C | 移除 inline create；改為**簽 stage token via `oauth-stage-token.ts` + return Auth.js redirect URL 指向 `/api/oauth-line-stage?t=...`**（query 參數名稱必為 `t`，對齊既有 `route.ts` 的 `searchParams.get("t")`；若 PR 要改成 `?token=` 必須**同一個 PR 內同步**改 route handler，禁止 auth.ts 發 `?token=` 而 route 仍讀 `t` — Codex round 8 P2）；**禁止** import `src/lib/server/oauth-temp-session`（會把 `next/headers` 拉進 NextAuth bundle） | G5.4 |
| `src/lib/auth.ts` Case B | 改為呼叫 **`activatePrecreatedCustomerWithLine({ storeId: targetStoreId, customerId: customer.id, lineUserId, lineName, oauthProfile: { email: user.email, image: user.image, name: user.name }, oauthAccount: { provider: account.provider, providerAccountId: account.providerAccountId, type: account.type, access_token: account.access_token, refresh_token: account.refresh_token, id_token: account.id_token, expires_at: account.expires_at, scope: account.scope, token_type: account.token_type } })`**（§5.3.3 activation helper，refactor only；`targetStoreId` 已是 signIn callback 內 resolved trusted value，直接傳；`oauthProfile` / `oauthAccount` 從 signIn callback 的 `user` / `account` 參數萃取；**`oauthAccount` 9 個欄位（無 `session_state`）對齊既有 Case B baseline（auth.ts lines 634-647），加上 `session_state` = silently 擴增 Account row 違反 byte-equivalent，Codex round 10 P2**；`oauthProfile.name` 由 helper 用作 Customer.lineName fallback，**不**被寫進 `User.name`（baseline 行 624 用 `customer.name`）；所有欄位 null/undefined 也照傳，不可省略 — 確保 PR-G5.5 byte-equivalent 合約成立，Codex round 9 + round 10 P2）；**禁止** wire 至 `bindLineToExistingCustomerById` — 那條 helper 的 step 4 會在 `userId === null` 立刻 `customer_has_no_user` 把首次 LINE 啟用流程整個打斷（Codex round 5 P1）；**不**在 caller 端重複寫 cross-store guard / userId guard / lineUserId guard / OAuth metadata 處理（activation helper 已 enforce + 統一寫入） | G5.5 |
| `src/app/(auth)/oauth-confirm/page.tsx` | 復活/微調 UI（dead code 已存在） | G5.4 |
| `src/app/(auth)/oauth-confirm/_components/oauth-confirm-form.tsx` | 同上 | G5.4 |
| `src/app/(auth)/oauth-confirm/finalize/page.tsx` | 同上 | G5.4 |
| `src/server/actions/oauth-confirm.ts`（`resolveLineLogin` / `finalizeLineBind`） | 復活；`resolveLineLogin`（NEW_USER + BOUND_EXISTING）wire phone-driven `bindLineToCustomerInStore`（OK，Customer.userId=null）；**`finalizeLineBind`（NEED_LOGIN）必須先驗 `oauth_line_session` cookie 的 signature / nonce（§5.3.1）— 驗失敗 → return auth/session error + 0 byte DB 寫入**；通過後 wire `bindLineToExistingCustomerById({ storeId, customerId, lineUserId, lineName })`（customerId-driven），`storeId` / `lineUserId` / `lineName` 從驗證過的 cookie payload 取（**HttpOnly 不是 integrity** — `/api/oauth-line-stage` 在寫 cookie 時必須以 §5.3.1 的方案 A/B/C 任一形式做完整性保護）、`customerId` 從 resolveLineLogin 階段的 NEED_LOGIN state 取；**禁止用 phone-driven `bindLineToCustomerInStore`** — 密碼確認後的 Customer 已有 `userId`，會被 hijack guard 擋下回 `phone_taken_by_other_user`，那是設計上正確的拒絕；**不**在 caller 端重複寫 cross-store guard 或 no-user guard（helper 已 enforce）；helper 回 `customer_has_no_user`（race / state 異常）→ finalize redirect 回 `/oauth-confirm` 而**不**靜默自動建 User | G5.4 |
| `src/lib/oauth-stage-token.ts` | HMAC sign/verify stage token；TTL；nonce uniqueness；**auth.ts 唯一允許 import 的「往 stage flow 遞交」入口**（不含 `next/headers`，edge-compatible） | G5.4 |
| `src/lib/server/oauth-temp-session.ts` | TTL / nonce 邊界再 review；**legal callers 限 `/api/oauth-line-stage` 與 `/oauth-confirm` server actions；禁止 auth.ts import**；**現行 raw JSON + HttpOnly cookie 缺 integrity 保護必須在 PR-G5.4 修補**（採 §5.3.1 方案 A：HMAC-SHA256 signed cookie / B：JWE encrypted / C：server-side nonce store），未補完成前不得讓 `/oauth-confirm/finalize` 信任 cookie payload 任何欄位（HttpOnly 只擋 JS、**不擋** client-crafted Cookie header） | G5.4 |
| `src/app/api/oauth-line-stage/route.ts` | **現行 route contract**：讀取 `req.nextUrl.searchParams.get("t")` 取 stage token（query 參數名稱**就是 `t`**，不是 `token` — Codex round 8 P2）→ 驗 stage token（`oauth-stage-token.ts`）→ 呼叫 `setOAuthTempSession` 寫 oauth_line_session cookie（**必須帶 §5.3.1 完整性保護**：HMAC-signed payload 或 opaque nonce）→ redirect `/oauth-confirm`；**這是新流程裡唯一寫該 cookie 的點**。若 PR-G5.4 要改用 `?token=` 必須**同一個 PR 內同步**改 `searchParams.get("...")` 鍵名 + 改 auth.ts 發出的 URL + 改 §9.2.1 stage-route test，三者連動；本 audit 的合約是**保留 `?t=`**，PR-G5.4 順著它做即可 | G5.4 |

### 7.2 必加（新檔，PR-G5.6）

| 檔案 | 用途 |
| --- | --- |
| `scripts/diagnose-new-placeholder-customers.ts` | read-only；掃 `Customer.phone LIKE '_oauth\_line\_%' AND createdAt > <date>`（**LINE-only**；`_oauth_google_%` 因屬於另一條未在本 PR train 替換的 fallback 路徑，**故意不掃**，Codex round 6 P2）；同 PR-F1.2 read-only 契約 |
| `src/__tests__/diagnose-new-placeholder-customers.readonly.test.ts` | 同 PR-F1.2 contract test pattern |

### 7.3 不能碰（任何 PR-G5.x 一律不准）

| 檔案 / 區塊 | 理由 |
| --- | --- |
| `prisma/schema.prisma` | §8 結論:不需 migration |
| `src/lib/line-bind-log.ts` 的 mask helper / event interface | PR-F1 contract;新 caller 只能 call,不能改 |
| `scripts/diagnose-line-identity-drift.ts` 及 `scripts/diagnose-line-mismatch-repair-audit.ts` | PR-F1 / F1.2 read-only contract 鎖死,新 PR 只能加新 diagnose,不能改既有 |
| `scripts/diagnose-line-mismatch-repair-audit.readonly.test.ts` | 同上,**契約測試本身不准放寬** |
| `scripts/repair-chenjiajia-line-drift.ts` / `repair-zhouyaqin-line-drift.ts` / `repair-wuxiaojing-line-drift.ts` | 歷史證據,不動 |
| `bindLineToCustomerInStore` 既有 phone-driven entry point 介面或語意 | PR-C2 §6 鎖死 |
| `/api/liff/exchange` 路由 / 回應 schema | PR-C2 §6 鎖死;LIFF entry 已對,不需動 |
| `/liff/onboarding` 頁面 / action 的對外介面 | 同上 |
| LINE OA webhook handler 中**非**綁定碼 path(訊息回覆 / Rich Menu / 群組) | 與身份無關 |
| `Wallet` / `Booking` / `Transaction` / `CashDrawer` / `Reminder` 任何業務模組 | PR-G5 純身份,不碰錢、不碰預約 |
| `HealthFlow` / `referral-points` 既有行為 | 同上 |
| Staff / Permission 流程 | 同上 |

---

## 8. Migration 是否需要

### 8.1 結論

**不需要 migration。** Schema 已完全足以支撐 PR-G5.x 的所有功能變動。

### 8.2 理由

| 想法 | 為何不做 schema/migration |
| --- | --- |
| 加 DB `CHECK (phone NOT LIKE '_oauth\_line\_%')` | Prisma 不原生支援 CHECK constraint；要寫 raw SQL migration，增加 schema drift 風險；且既有 row 違反條件，migration 會失敗。改用應用層 Zod / helper（A2 invariant，**LINE-only** pattern；**禁止**用廣義 `'_oauth_%'` 會連帶擋 `_oauth_google_*` 既有 row + 未來 Google OAuth 路徑） |
| 加 `Customer.lineLinkStatus + lineUserId` 一致性 CHECK | 同上,且邏輯一致由 helper 強制即可 |
| 加 `Customer.authSource` enum 約束 | 已是 `AuthSource` enum,不需加 |
| 加新 table 紀錄 oauth_temp_session(避免 cookie 跨頁) | cookie 模式已存在(`src/lib/server/oauth-temp-session.ts`),且 TTL 5 分鐘的短期憑證不該進 DB |
| 加 `User.lastSignInAt` 之類欄位協助 orphan 偵測 | 用既有 `Session.expires` 即可推估,不需新欄位 |
| 加 index 加速 audit script | PR-F1.2 audit 已 acceptable 速度(zhubei 規模);若未來規模 10x,再評估 |

> **本 PR 系列禁區重申**:`pr-c2-liff-onboarding-plan.md` §6 與 `pr-f2-line-mismatch-repair-plan.md` §7.1 都明寫不動 schema、不寫 migration、不 db push。本 PR-G5 系列繼續沿用。

### 8.3 「未來若真的要加 migration」的觸發條件

| 觸發條件 | 動作 |
| --- | --- |
| prod scale 10x → audit script timeout | 加 `Customer.lineUserId` 單欄 index、`Account.userId` index;**獨立 PR,獨立 review** |
| 業務決策「同一人不允許跨店」(目前接受 cross-store) | 拿掉 store-scoped unique、改全域 unique;**重大 schema change,需重新審視 store-isolation;** 完全跳脫 PR-G5 範圍 |

---

## 9. 風險清單 + 測試策略

### 9.1 風險清單

| ID | 風險 | 嚴重度 | Mitigation |
| --- | --- | --- | --- |
| **R1** | PR-G5.4 後非 LIFF LINE 登入 conversion 下降（PR-2 撤的原因） | 高 | (a) feature flag;(b) `/oauth-confirm` 邊路「先不綁」;(c) ship 後 1-2 週 daily 看 signIn 完成率 |
| **R2** | `/oauth-confirm` 表單顧客中斷 → 留 orphan oauth_line_session cookie(無 DB 副作用) | 低 | TTL 5 分鐘自動失效;不寫 User / Customer,無清理需求 |
| **R3** | A2 invariant 上線時遺漏某條既有寫入路徑 → 即時 throw 阻擋登入 | 高 | PR-G5.3 + PR-G5.4 同 PR train ship;staging 完整 E2E;greplit 全 codebase 找所有 `prisma.customer.create` / `prisma.customer.update` `phone:` 寫入點 |
| **R4** | Webhook 綁定碼 refactor 改變 DB 寫入序列 → 既有 customer 無預警出現新狀態 | 中 | Golden-output tests;refactor 前先 snapshot 三種代表 input 的 DB 寫入；PR-G5.2 不改任何外顯行為 |
| **R5** | NextAuth Case A 的 drift repair（PR-F1 加的 best-effort create Account）被誤改 | 中 | PR-G5.5 只改 Case B,Case A 不動;PR description 明說 |
| **R6** | 非 LIFF 登入經 /oauth-confirm 收 phone 時遭 hijack（A 知道 B 的 phone） | 高 | `resolveLineLogin` 已分 NEW_USER / BOUND_EXISTING / NEED_LOGIN,已啟用顧客必過密碼;此設計 PR-2 已 done,本 PR 沿用 |
| **R7** | 顧客同時打開 LIFF 與非 LIFF tab → oauth_line_session cookie 互覆蓋 | 低 | identity-flow.md §8 已 acknowledge;未來升級用 nonce 綁定;暫接受 |
| **R8** | helper 新 entry point（`bindLineToExistingCustomerById` + `activatePrecreatedCustomerWithLine`，§5.3 / §5.3.3）與既有 `bindLineToCustomerInStore` 三者語意差異被誤合 | 中 | 三者共用 mask helpers + `logLineBindEvent` + storeId 比對 + A3 atomicity (新 entry 兩支)；但**接受 `customer.userId` 的方向不同**：existing-user helper rejects null、activation helper requires null、phone-driven 既有 helper 不檢查此維度（走 phone match）— PR description + 單元測試 + integration tests 三層必須各自明寫該差異，避免 reviewer 誤把 Case B wire 至 existing-user helper（Codex round 5 P1 已發生過此誤接）|
| **R13** | PR-G5.5 把 Case B wire 至 existing-user helper（誤接），首次 LINE OAuth 啟用流程被 step 4 `customer_has_no_user` 擋下 → 顧客無法用 LINE 第一次啟用 staff-precreated 帳號 | **高** | (a) Case B 必 wire 至 `activatePrecreatedCustomerWithLine`（§5.3.3 / §7.1 PR-G5.5 row 已寫死）；(b) §9.2.2 regression test 用 spy 強制 Case B 路徑**不**呼叫 `bindLineToExistingCustomerById`；(c) `bindLineToExistingCustomerById` 的 status enum 沒有 `activated`、activation helper 的 enum 沒有 `bound_existing` — 型別系統再加一層保險 |
| **R14** | PR-G5.3 A2 invariant 被寫成廣義 `_oauth_` ban → 連帶擋下 `_oauth_google_*` 寫入 → 首次 Google OAuth 沒既有 Customer 的顧客在 NextAuth Case C 階段 throw，無法登入 → 與本 PR train「LINE-only」的 scope 不符（Codex round 6 P2） | **高** | (a) A2 validator **只**檢查 `_oauth_line_` prefix，§7.1 normalize / customer-phone-validation 與 §6 PR-G5.3 row 都寫死 LINE-only；(b) §9.2.1 validator 單元測試含 `_oauth_google_*` accept regression — 若有人改成廣義 ban，這個測試會立刻 fail；(c) §7.1 PR-G5.6 CI gate 掃描 pattern 也鎖 `_oauth\_line\_%`，不掃 Google；(d) 若未來真要設計 Google 替代流程，須**另開**獨立 docs / PR train，**不**塞進 PR-G5.x |
| **R15** | PR-G5.4 Case C flag 與 PR-G5.3 A2 guard 被當作獨立 flag 分開回滾 → Case C 退回 legacy `_oauth_line_*` placeholder fallback 但 A2 仍 enabled → A2 validator throw 擋下所有 `_oauth_line_*` 寫入 → LINE OAuth 仍掛、partial rollback 完全沒救到事故、ops 還以為已回滾成功（Codex round 7 P2） | **高** | (a) §9.2.6 rollback plan 顯式宣告 PR-G5.4 / PR-G5.3 為 **paired rollback bundle**，禁止獨立翻單側 flag；(b) §9.2.6 列出 4 種 (Case C path × A2 state) config 組合的 validity matrix，runbook / CI gate 必須拒絕 invalid 組合（Case C legacy fallback + A2 enabled）；(c) §9.2.1 unit test 多一條「rollback config validator」regression：若 feature flag pair 進到 invalid 組合即 fail；(d) PR-G5.4 PR description 必須附 rollback runbook，明列「翻 flag 前先核對另一側狀態」的次序鎖；(e) 預設無條件 rollback 模板：先把 A2 翻 disabled、再把 Case C 翻 legacy fallback；恢復時反序 — 防 ops 在事故壓力下漏步驟 |
| **R9** | 既有 historical `_oauth_line_*` row 在 A2 invariant 上線後被任何 update 操作觸發 | 中 | A2 只校驗 `create` 與「`update` 且包含 phone」;既有 row 純讀取 / 改其他欄位都不受影響 |
| **R10** | PR-G5.4 ship 後 LIFF 內部因為某 edge case fallback 走到 NextAuth Case C(再也不會 create placeholder)→ LIFF 登入失敗 | 中 | LIFF entry 走 `/api/liff/exchange` + `liff-token` provider,不經 LINE OAuth provider 的 signIn callback;但需 E2E 確認;若真有 fallback path,須單獨修而非倒退 placeholder |
| **R11** | `oauth_line_session` cookie 缺 integrity 保護被攻擊者手刻 → 任意 LINE 接管已認證 customer | **高** | PR-G5.4 必同 PR ship §5.3.1 方案 A/B/C 任一；`/oauth-confirm/finalize` 必先驗 signature / nonce 才讀 cookie 任何欄位；HttpOnly **不算** integrity；R7 既有「cookie 互覆蓋」已 acknowledge 是 isolation 議題、不抵此項；防呆透過 finalize 的 cookie integrity 必驗 + unit test (tampered cookie 0 DB 寫入) 一起鎖 |
| **R12** | customerId-driven helper 對 `customer.userId === null` 靜默自動建 User → 違反 PR-G5.2 webhook refactor golden-output 保證 + 破壞「NEED_LOGIN = 已認證為既有顧客」語意 | 中 | helper 改回 `customer_has_no_user` status + 0 byte 寫入；webhook caller 自行決定 legacy update branch vs helper branch（§5.3.2）；finalize 收到此 status 改 redirect 回 `/oauth-confirm`、**不**自動建 User；unit + integration test 都覆蓋 |
| **R11** | Cross-store guard 在新路徑被遺漏 | 中 | 新 caller 也呼叫 `crossStoreLineUserCount` 查詢;helper level 加共用 guard 函式 |
| **R12** | NextAuth Account 全域 unique（S6）使任何 LINE OAuth 第一次寫 Account 時若有歷史 `Account[provider=line, providerAccountId=X]` 存在於別的 User → P2002;新流程須 friendly 處理 | 中 | helper 既有 P2002 guard 回 `unique_conflict`;client UX 顯示「此 LINE 已綁其他帳號,請聯繫店家」 |

### 9.2 測試策略

#### 9.2.1 Unit tests（每個 PR ship 前必過）

| 測試對象 | 內容 |
| --- | --- |
| `bindLineToExistingCustomerById`（existing-user 專用） | 全部 status 分支：`bound_existing` / `already_synced` / `customer_locked`（已綁其他 LINE）/ `store_mismatch` / `customer_has_no_user` / `unique_conflict`（P2002）+ **A3 atomicity test**：mock `prisma.account.create` 拋錯 → 整組 `$transaction` rollback，Customer.lineUserId 不得被寫入（與既有 phone-driven helper 的 post-tx best-effort 行為**刻意不同**）+ **store_mismatch pre-write semantics test**：傳入 `{ storeId: storeA, customerId: <customer-in-storeB> }` → return `store_mismatch`，spy 確認 `prisma.customer.update` / `prisma.account.create` / `prisma.auditLog.create` 通通 **0 次** 呼叫（helper 在任何寫入前就因 storeId 不符 abort，cross-store guard 在 helper 內部一處完成，caller 端無需重複）+ **`customer_has_no_user` pre-write semantics test**：傳入 `{ customerId: <customer-with-userId-null> }` → return `customer_has_no_user`，spy 確認 `prisma.customer.update` / `prisma.account.create` / `prisma.user.create` / `prisma.auditLog.create` 全 **0 次** 呼叫（helper **不**靜默建 User，§5.3.2）+ **storeId required test**：呼叫 site 漏傳 `storeId` → TypeScript 型別錯（compile-time）/ runtime 防呆 throw |
| `activatePrecreatedCustomerWithLine`（§5.3.3，Case B 啟用專用） | 全部 status 分支：`activated` / `store_mismatch` / `customer_already_has_user` / `customer_already_linked_to_other_line` / `unique_conflict`（P2002）+ **`activated` happy path test (baseline-exact，Codex round 10 P2)**：傳入完整 `{ storeId, customerId: <staff-precreated>, lineUserId, lineName, oauthProfile, oauthAccount }` → 在單一 `$transaction` 內 `prisma.user.create` × 1（assert 欄位 = `{ name: customer.name, email: oauthProfile.email, phone: customer.phone || null, role: "CUSTOMER", status: "ACTIVE", image: oauthProfile.image, customer: { connect: { id: customerId } } }`，**對齊 auth.ts Case B baseline 行 622-632**；⚠ `User.name === customer.name`，**不是** `oauthProfile.name`）+ `prisma.account.create` × 1（assert 欄位 = `{ userId: newUser.id, type: oauthAccount.type, provider: oauthAccount.provider, providerAccountId: oauthAccount.providerAccountId, access_token: oauthAccount.access_token, refresh_token: oauthAccount.refresh_token, expires_at: oauthAccount.expires_at, token_type: oauthAccount.token_type, scope: oauthAccount.scope, id_token: oauthAccount.id_token }`，**共 10 個欄位、無 `session_state`，對齊 baseline 行 634-647**；任一 token 欄位 null/undefined 也要被寫入、key 不可被 helper silently drop）+ `prisma.customer.update`（`{ authSource: "LINE", lineUserId, lineName, lineLinkStatus: "LINKED", lineLinkedAt }`，對齊 baseline 行 650-657；⚠ `authSource` 必寫；不寫 `userId`（已由 User.create 的 `customer: { connect }` 設定））；**⚠ 無 `prisma.auditLog.create`**（baseline auth.ts Case B lines 620-647 不寫 AuditLog；PR-G5.5 byte-equivalent refactor-only 禁止新增 — spy assert `prisma.auditLog.create` happy path 0 次呼叫，Codex round 11 P2）；+ **`User.name` baseline regression test (Codex round 10 P2)**：建立 `customer.name = "店長建檔小明"`、`oauthProfile.name = "LINE Display Bob"` → 跑 helper → assert `prisma.user.create` 收到的 data.name === `"店長建檔小明"`（**不是** `"LINE Display Bob"`）；若有人把 helper 改成 `oauthProfile.name` 此測試立刻 fail；+ **Account row no-session_state regression test (Codex round 10 P2)**：傳入 `oauthAccount.session_state = "any-value"` （即使 caller 帶了此 key，helper 也不應寫進 Account row）→ spy 確認 `prisma.account.create` 收到的 data 物件**完全沒有 `session_state` key**（或值為 undefined 而未被寫入）；亦 assert 收到的 keys set 嚴格等於上方列出的 10 個 baseline 欄位；+ **OAuth byte-equivalent regression test**：對同一輸入跑兩次 happy path —（i）refactor 後 helper、（ii）refactor 前 auth.ts Case B inline 寫法（測試輔助用，僅在 test fixture 內 reproduce），對 User / Account 兩個 row 逐欄位 deep-equal（含 token 欄位 + null/undefined，但 **不含 session_state**）；任何欄位有差或多出 baseline 沒有的欄位即 fail；+ **null token preservation test**：傳入 `oauthAccount.{access_token, refresh_token, id_token, scope, token_type}` 全為 `null` → spy 確認 `prisma.account.create` 收到的 data 物件中**這 5 個 key 全部存在且值為 `null`**（而非 key 被省略），同時**完全沒有 `session_state` key**；+ **atomicity test**：mock 第 (b) `prisma.account.create` 拋錯 → 整 `$transaction` rollback，**不殘留** orphan User 行（Customer.userId / lineUserId 都不得寫入）+ **`customer_already_has_user` pre-write semantics test**：傳入 `customerId` 指向已有 `userId` 的 Customer → return `customer_already_has_user`，spy 確認 user.create / account.create / customer.update / auditLog.create 全 **0 次**；錯誤訊息暗示 caller 應改 wire `bindLineToExistingCustomerById`（防止 Case B 被誤接至 existing-user helper 的對稱保險）+ **`store_mismatch` pre-write semantics test**：同 existing-user helper 形式 + **`customer_already_linked_to_other_line` pre-write semantics test**：Customer.lineUserId 已被別的 LINE 占用 → 0 byte 寫入（防 hijack） |
| `bindLineToCustomerInStore`（existing） | 既有 7 status 全部 regression（PR-G5.1 不改行為）+ **明寫的非 atomic 行為**：mock `syncLineAccountForUser` 回 `error` → Customer 仍保留 `lineUserId`、回傳 `lineAccountSync: "error"` — 鎖死 baseline 行為，避免無聲被改 |
| A2 invariant validator | **`_oauth_line_*` reject**（LINE-only）+ **`_oauth_google_*` accept regression**（Codex round 6 P2 — 證明 validator 不會誤殺 Google placeholder）+ 正規化台灣手機 accept + 空 phone reject；若未來改成廣義 `_oauth_*` reject，此 regression test 會 fail，把改動擋下 |
| `resolveLineLogin` | NEW_USER / BOUND_EXISTING / NEED_LOGIN;Step 0 lineUserId 已綁直接 loginAsCustomer |
| `finalizeLineBind` | happy path（NEED_LOGIN，**via `bindLineToExistingCustomerById`**，且 cookie signature / nonce 已通過 §5.3.1 verify）+ **cookie integrity 必測**：(a) cookie 完全缺失 → 0 DB 寫入 + auth/session error；(b) tampered cookie（signature 不符 / nonce server-side store 查無） → 0 DB 寫入 + reject；(c) expired nonce / TTL 過期 → 0 DB 寫入 + reject；(d) 通過 verify 才允許進 helper + nonce reuse → abort + store mismatch → abort + TTL expired → abort + **反例：若誤接 phone-driven `bindLineToCustomerInStore` 應 fail-fast（會回 `phone_taken_by_other_user`）—當作 negative test 鎖死**；+ **`customer_has_no_user` 必測**：helper 回此 status → finalize 必須 redirect 回 `/oauth-confirm` 並**不**靜默自動建 User |
| `oauth-stage-token` + `oauth-line-stage` route contract（Codex round 8 P2）| sign/verify round-trip；HMAC tamper reject；TTL expired reject；nonce reuse reject；**static import-graph assertion：`src/lib/auth.ts` 的 import closure 不含 `src/lib/server/oauth-temp-session` 也不含 `next/headers`**；+ **route query-param contract**：(a) happy path 用 `/api/oauth-line-stage?t=<signed-token>` 必須 accept 並進到 cookie-write path；(b) 同 token 改成 `?token=<signed-token>` 必須 reject（route 走 `searchParams.get("t")` → 拿到 `null` → token verify fail → redirect `/oauth-confirm` with expired/missing session error）；(c) 完全不帶 query 也必須 reject；(d) regression：若有人改 route 改成讀 `token`，本測試會 fail 鎖住「auth.ts URL 與 route param 名字必須一致同 PR 改動」的約束 |
| `oauth-temp-session`（PR-G5.4 必過 4 case，§5.3.1）| **(T1) 偽造 raw JSON cookie**：直接寫 `oauth_line_session={"storeId":"<foreign>","lineUserId":"U_fake","customerId":"<victim>","nonce":"x","displayName":"x"}` 不帶 signature / 不對應任何 server-side nonce row → integrity check 失敗 → finalize return auth/session error；spy 確認 `prisma.customer.update` / `customer.create` / `user.create` / `account.create` / `auditLog.create` 全部 **0 次** 呼叫。**(T2) Tampered signature**（方案 A/B）：cookie 帶合法格式但 signature 末段被改一個字元 → HMAC verify 失敗 → 同上，0 DB 寫入。**(T3) Expired temp session**：cookie 結構/signature 都對但 TTL 已過 或 server-side nonce row 已 used / 已 expire → 拒絕 + 0 DB 寫入。**(T4) Valid signed/nonce-verified session**：通過 signature/decrypt/nonce verify → finalize 路徑得以進入並能將 verified `tempSession.storeId` / `lineUserId` / `lineName` 傳入 helper。**(T5 narrative)** 在測試 file 開頭 comment 寫明「HttpOnly 不等於 integrity；本檔覆蓋 integrity 而非 attribute hardening」，防止未來 reviewer 誤把 cookie attributes 當作 integrity 保護 |
| Rollback config validator（PR-G5.4 / PR-G5.3 paired bundle，§9.2.6 matrix；R15 對應） | **(C1) staged flow + A2 enabled** → validator accept（PR train ship 後的預設正向組合）。**(C2) legacy `_oauth_line_*` placeholder fallback + A2 disabled（含對 legacy path bypass）** → validator accept（受控 rollback bundle）。**(C3) legacy `_oauth_line_*` placeholder fallback + A2 enabled** → validator **reject**，明確錯誤訊息要求 ops 先翻 A2 flag；regression：若有人把 PR-G5.4 Case C flag 與 PR-G5.3 A2 flag 改成可獨立翻動而沒回頭更新此 validator，這條測試會 fail。**(C4) staged flow + A2 disabled** → validator warn but accept，視為「過渡狀態 / 暫時減防」，需 ops 明確 ack；test 鎖死 warn 訊息以防未來被 silently 改成 accept。**(C5 narrative)** 測試 file 開頭 comment 註明本 validator 是 R15「partial rollback 沒救到事故」的最後一道防線、**不**取代 §9.2.6 runbook 與 PR description 的 paired bundle 宣告 |

#### 9.2.2 Integration tests

| 場景 | 涵蓋 PR |
| --- | --- |
| 「店長先建檔 phone Customer」→ LIFF onboarding 命中既有 → bound_existing | G5.1 baseline |
| webhook 綁定碼（兩條 branch 必須各自獨立測試 + golden-output 鎖死，§5.3.2）：**(W1) `customer.userId !== null` branch** → `bindLineToExistingCustomerById({ storeId: <webhook-resolved>, customerId, lineUserId, lineName })` → DB 寫入序列 vs refactor 前 byte-equal（含 AuditLog 觸發欄位 & timestamp 之外的所有 column）；**(W2) `customer.userId === null` legacy branch 必須完整保留**：caller 跳過 helper、直接執行 `prisma.customer.update({ lineUserId, lineLinkStatus: "LINKED", lineLinkedAt: now })`、**不**呼叫 `account.create` / `user.create`（無 User 可掛 Account → 維持 §5.1 矩陣裡 webhook 列「同 tx Account[line] sync? ❌」legacy 語意）→ DB 寫入序列 vs refactor 前 byte-equal；spy assert `prisma.account.create` 與 `prisma.user.create` 在此 branch 都 0 次呼叫；**(W3) cross-store reject case**：同一 lineUserId / 同一 customerId 但 caller 傳錯 storeId → helper 回 `store_mismatch` + 0 byte DB 寫入 + 與 refactor 前同一 cross-store 拒絕語意 byte-equal | G5.2 |
| 非 LIFF LINE OAuth + Case C 替換 → **auth.ts 簽 stage token → `/api/oauth-line-stage` 驗 token 並寫 oauth_line_session cookie → redirect `/oauth-confirm`** → 填 phone(新號) → NEW_USER → `bindLineToCustomerInStore` 走 candidates=0 分支 → 顧客 RELOGIN 後有完整身份鏈 | G5.4 |
| 非 LIFF LINE OAuth + 顧客已有 password Customer → 同上 stage token / route handler / **signed/nonce-verified cookie handoff** → `/oauth-confirm` 填 phone → NEED_LOGIN → 密碼登入 → `finalizeLineBind` **先驗 cookie integrity（§5.3.1）通過**才 wire **`bindLineToExistingCustomerById`（customerId-driven）** 寫 lineUserId + Account | G5.4 |
| **attack scenario**：使用者**完全跳過 LINE OAuth + stage route**、自己手刻 `oauth_line_session={"storeId":"<store>","lineUserId":"<任意 U...>","customerId":"<已用密碼登入的自己>"}` cookie → 直奔 `/oauth-confirm/finalize` → finalize 因 signature / nonce 驗證失敗 → return auth/session error + **0 byte DB 寫入**（含 AuditLog）+ 不會把任意 LINE 接管到該 customerId | G5.4 |
| webhook 綁定碼 **`customer.userId === null`** legacy 路徑（§5.3.2）：staff 後台建檔 + 顧客先用綁定碼接 LINE → caller 跳過 helper、走 legacy `prisma.customer.update`、無 Account row + 不建 User → 顧客之後從 LIFF / `/profile` 啟用流程啟用 User 時，再走 LIFF onboarding canonical helper 補 Account → 與 refactor 前語意完全一致 | G5.2 |
| 非 LIFF + 顧客中斷 `/oauth-confirm` → 5 分鐘後 cookie 失效 → 重來不卡 | G5.4 |
| auth.ts Case A drift repair(PR-F1 既有行為) regression | G5.5 |
| **auth.ts Case B activation via `activatePrecreatedCustomerWithLine`**：staff 後台先建 `Customer { userId: null, lineUserId: null, name: <staff-typed>, phone: <staff-typed> }` → 顧客首次 LINE OAuth 進站 → NextAuth signIn callback 命中該 Customer + 呼叫 activation helper（**含完整 `oauthProfile` + `oauthAccount` 參數**）→ 單一 `$transaction` 內建 User（**`name: customer.name`、`email: oauthProfile.email`、`phone: customer.phone \|\| null`、`role: "CUSTOMER"`、`status: "ACTIVE"`、`image: oauthProfile.image`、`customer: { connect: { id: customerId } }`**）+ Account[line]（**9 個 OAuth/token 欄位 + userId 共 10 欄位、無 `session_state`**：`{ userId, type, provider, providerAccountId, access_token, refresh_token, expires_at, token_type, scope, id_token }`；null/undefined 也要寫入 row，不可被 helper silently drop）+ 更新 Customer (**`authSource: "LINE"`、`lineUserId`、`lineName`、`lineLinkStatus: "LINKED"`、`lineLinkedAt`**) → DB 寫入序列與既有 `src/lib/auth.ts` Case B baseline (lines 620-647) **逐欄位 byte-equal**（含 User 7 欄位 + Account 10 欄位 + Customer 5 欄位；**不含 `User.name = oauthProfile.name` 也不含 `Account.session_state`**；除了改用單一 tx 取代分次 commit、不應有其他差異 — Codex round 9 + round 10 P2 byte-equivalent 合約）+ **regression case**：故意設定 `customer.name = "店長建檔小明"`、`oauthProfile.name = "LINE Display Bob"` → DB 結果 `User.name === "店長建檔小明"`（不是 `"LINE Display Bob"`）；亦 assert `Account` row column set 不含 `session_state` | G5.5 |
| **regression**：Case B 路徑 spy 確認**完全不**呼叫 `bindLineToExistingCustomerById`（防止後續維護把兩條 helper 誤接） | G5.5 |

#### 9.2.3 End-to-end / staging

跑在 `.env.staging.local`（既有 staging DB):

* LIFF 真機(LINE app 開 LIFF)走完 onboarding 三條分支
* 非 LIFF（desktop Chrome）走「LINE 登入」三條分支
* 把 PR-F1.2 audit script 跑在 staging：每個 PR 上線後 mismatch 數必須維持 0
* `scripts/diagnose-new-placeholder-customers.ts`（PR-G5.6 新增）跑在 staging：PR-G5.4 ship 後 `count(Customer.phone LIKE '_oauth\_line\_%' AND createdAt > shipDate) === 0`（**LINE-only**；`_oauth_google_%` 不在掃描範圍，Codex round 6 P2）

#### 9.2.4 Read-only contract tests（沿用 PR-F1.2 pattern）

* `diagnose-new-placeholder-customers.readonly.test.ts`：靜態 source scan，禁 prisma write methods / `$transaction` / `--apply` flag / `email:true`、`name:true`、`${...passwordHash}`、`${...phone}`。
* PR-F1.2 既有 contract test 必須持續通過（reviewer 在每個 PR-G5.x 都要勾選）。

#### 9.2.5 Production observability（PR-G5.4 ship 後 14 天）

| 指標 | 來源 | 目標 |
| --- | --- | --- |
| LINE OAuth signIn 完成率 | 既有 NextAuth log + signOut bounce | 不低於 ship 前 -5% |
| `/oauth-confirm` 表單 submit 成功率 | server action log（masked） | > 60%(若低於則 R1 觸發) |
| `account-mismatch` 新增筆數 | PR-F1.2 audit weekly run | 0 |
| `_oauth_line_*` Customer 新增筆數 | PR-G5.6 diagnose script | 0 |
| `orphan-line` 筆數趨勢 | PR-F1 diagnose script | 不上升 |

#### 9.2.6 Rollback plan（每個 PR 都要有）

* PR-G5.1 / G5.2 / G5.5 純 refactor → git revert
* PR-G5.3 A2 invariant → feature flag 關掉（⚠ 與 PR-G5.4 耦合，見下方 paired bundle）
* PR-G5.4 auth.ts Case C 替換 → feature flag 切回 placeholder fallback（dead code 保留至 PR-G5.8 才刪）
  * ⚠ **與 PR-G5.3 A2 invariant 強耦合**：legacy placeholder fallback 會嘗試寫入 `_oauth_line_*` Customer.phone，但 PR-G5.3 上線後 A2 validator 會把這類寫入 throw 掉。**若 A2 仍 enabled 而 Case C 退回 legacy fallback → LINE OAuth 仍掛**，partial rollback 不會救到事故（R15）。
  * **允許的回滾路徑**只有兩條：
    1. Case C 留在 staged flow（PR-G5.4 主路徑，不發 `_oauth_line_*` row、直接 reject 該次登入並導回 `/oauth-confirm`），同時 A2 維持 enabled — 這條本身就**不需要動 Case C flag**，比較像是「PR-G5.3 不退、PR-G5.4 也不退」。
    2. Case C 翻回 legacy `_oauth_line_*` placeholder fallback **且**同時把 PR-G5.3 A2 flag 翻 disabled（或對 legacy path 顯式 bypass A2）—— 此時兩條 flag 必須**一起翻**，視為 paired rollback bundle。
  * **禁止獨立翻單側 flag**：PR-G5.4 Case C flag 與 PR-G5.3 A2 flag 必須當作一組 paired rollback bundle 處理；任一單獨翻動前 ops 必先核對另一側狀態。
  * **預設 rollback runbook 模板**（PR-G5.4 PR description 必附）：先翻 PR-G5.3 A2 flag 到 disabled、再翻 PR-G5.4 Case C flag 到 legacy fallback；恢復時反序（先翻回 staged flow、再 enable A2）。在事故壓力下 ops 不需要二選一思考，照模板走即安全。
* PR-G5.6 CI gate → 暫停 gate
* PR-G5.7 排程 audit → 暫停排程

**有效 rollback config matrix**（PR-G5.4 PR description / ops runbook / config validator 三處共用，§9.2.1「Rollback config validator」單元測試對應；R15 對應）：

| # | Case C 路徑 | A2 guard | 有效？ | 說明 |
| --- | --- | --- | --- | --- |
| C1 | staged flow（PR-G5.4 主路徑，不發 `_oauth_line_*`） | enabled | ✅ accept | PR train ship 後的預設正向組合；config validator default expected |
| C2 | legacy `_oauth_line_*` placeholder fallback | disabled（含對 legacy path bypass） | ✅ accept | 受控 paired rollback bundle；事故時走此模板 |
| C3 | legacy `_oauth_line_*` placeholder fallback | enabled | ❌ reject | A2 會 throw 擋下所有 `_oauth_line_*` 寫入 → LINE OAuth 全掛；config validator 必須拒絕此組合並要求 ops 先翻 A2 flag |
| C4 | staged flow | disabled | ⚠ warn but accept | 技術上可運作（主路徑不寫 placeholder），但失去 A2 防線；視為過渡狀態，需 ops 明確 ack；不建議長駐 |

> **誰來 enforce 這個 matrix？** 三層共用：(a) §9.2.1 unit-test 「Rollback config validator」確保任何 PR 改 flag 形狀都必通過 C1–C4 regression；(b) PR-G5.4 PR description 內的 rollback runbook 把 C2 / C3 顯式列出；(c) 若 ops 真的踩到 C3，啟動時的 config validator 直接 fail-fast 不讓服務上線。

---

## 10. 給 reviewer 的一句話

> 本文件只是 pre-audit；任何 PR-G5.x 上來,先確認:(a) 寫入點只在 §7.1 列表,（b）禁區符合 §7.3,（c）無 schema/migration（§8）,（d）有對應 §9.2 測試,（e）不違反 `identity-flow.md` §1 與 `pr-c2` §6 任一鎖死條款,（f）PR-F1.2 read-only contract test 持續 PASS。任何越界 → 退件。
