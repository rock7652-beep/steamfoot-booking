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
| **(P) 必做:auth.ts Case C 斷流** | Case C 不再建 placeholder Customer。改為**用 `src/lib/oauth-stage-token.ts` 簽 stage token + return Auth.js redirect URL 指向 `/api/oauth-line-stage?token=...`**;由該 route handler 驗證 token、寫 oauth_line_session cookie、再 redirect 到 `/oauth-confirm` 表單收 phone（復活 PR-2 stage flow，但只在此 case 觸發）。**auth.ts 不可 import `src/lib/server/oauth-temp-session`** — 該檔案 import `next/headers`，會污染 NextAuth 的 edge-compatible bundle。 | 與 PR-2 撤的原因相反,但這次有 LIFF 為主流;非 LIFF 是 fallback,接受較低 conversion |
| **(O) 可選:identity-repair 強化** | login 後 best-effort 用 phone 找同 store Customer。已存在,但若 OAuth 階段沒拿到 phone 就無用 | 不解決 Case C 的根因 |

**建議:採 (P) 兩條同時做**:
- LIFF entry 為主流入口(主推);
- 為 Case C 提供「補 phone」出口(必做,replace Case C placeholder fallback);
- A2 invariant 寫進 Zod / helper:**新 Customer.phone 不得 `startsWith("_oauth_")`**,既有 row 暫留為歷史債,等 ad-hoc backfill 清。

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
| **F1** | auth.ts Case C **不再 inline create**。改為:用 **`src/lib/oauth-stage-token.ts`** HMAC 簽一個短期 stage token（payload: `lineUserId` / `displayName` / `storeId` / `nonce` / `iat` / `exp`）→ 從 signIn callback 回傳 Auth.js redirect URL 指向 `/api/oauth-line-stage?token=...`。**auth.ts 不可 import `src/lib/server/oauth-temp-session`** — 該檔案 import `next/headers`，會污染 NextAuth 的 edge-compatible bundle。寫 cookie 的責任完全交給下一站。 |
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
| `Customer.phone` 不得 `startsWith("_oauth_")` | 新增 Zod refine / 在 `bindLineToCustomerInStore` 與 auth.ts 寫入點檢查（A2 invariant） |
| 同 $transaction 內 User + Customer + Account[line] 三件齊全 | **Current baseline 並未 enforce**：`bindLineToCustomerInStore` User+Customer 同 tx、Account post-tx best-effort（§2.2）；auth.ts Case B 三件分次 top-level write（不在單一 `$transaction`）。**PR-G5 target**：新 entry point `bindLineToExistingCustomerById`（§5.3）從一開始即 atomic；Case B 收斂至該新 entry（PR-G5.5）即同步 enforce；既有 `bindLineToCustomerInStore` 受 PR-C2 §6 鎖，atomicity 升級獨立評估。 |
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
  | "unique_conflict"
}
```

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

**問題（Codex P1）**:既有 `src/lib/server/oauth-temp-session.ts` 把 `{ lineUserId, displayName, storeId, nonce }` 以 raw JSON 直接寫進 HttpOnly cookie。HttpOnly 只擋 JavaScript 讀取，**不**對抗「使用者在 DevTools / curl 用任意 Cookie header 改 payload」。在改造前，`/oauth-confirm/finalize` 若直接讀 cookie 取 `storeId` / `lineUserId` / `customerId`，攻擊者可以：

- 完全跳過 LINE OAuth、自己手刻 `oauth_line_session=...` cookie，
- 把任意 `lineUserId` 綁到一個自己已通過密碼登入的 `customerId` 上，
- 完成 LINE 接管攻擊（account takeover）。

**設計規則（PR-G5 實作前必擇一落地）**:

| 方案 | 描述 | 取捨 |
| --- | --- | --- |
| **A. Signed cookie**（推薦） | cookie payload 後附 HMAC-SHA256（密鑰來自 `NEXTAUTH_SECRET` 或獨立 env），讀取時必驗簽 | 簡單；payload 仍可被 read（HttpOnly 擋 JS、但用戶仍可在 DevTools 看自己的 cookie）— 對本 use case 無 confidentiality 需求所以可接受 |
| **B. Encrypted cookie (JWE)** | A 之上再對 payload 加密 | confidentiality + integrity 都覆蓋；但只有 server 看得到 payload，debug 麻煩 |
| **C. Server-side nonce / session 表** | cookie 只放 opaque `nonce`，真實 payload 存 Redis / DB row；讀取時用 nonce 對 server-side store 取回 | 最強；多一次 DB / cache hit；需新基礎設施 |

**禁止**：把現行「raw JSON + HttpOnly + sameSite=lax + maxAge=300」當成「足以信任 payload」。HttpOnly **不是** integrity 機制，本文件之前任何把 oauth_line_session cookie 直接列為 "trusted source" 的描述都應理解為「**經 A / B / C 任一機制驗證通過之後**才 trusted」。

**`/oauth-confirm/finalize` 必驗順序**:

1. read cookie → 驗 signature / decrypt / 用 nonce 對 server-side store 取回 — 任一步失敗 → return auth/session error，**0 byte DB 寫入**（含 AuditLog）。
2. 驗 nonce 一次性（已用過 → reject）。
3. 驗 TTL 未過期。
4. 通過後才能把 `storeId` / `lineUserId` / `lineName` / `customerId` 傳給 `bindLineToExistingCustomerById`。

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

### 5.4 NextAuth Case A / B 是否也要 wire helper

- **Case A**（customer 存在且 userId 已設）：本質是「補寫 Account[line]」的 drift repair。helper 沒有對應 entry point，且 PR-F1 已加 P2002 guard + best-effort logic。**建議不動**，避免 over-engineering。
- **Case B**（customer 存在但無 userId）：本質是「為 backend-pre-created Customer 啟用 NextAuth User + 綁 LINE」。helper 已可處理（phone-driven 分支命中既有 placeholder Customer）。但 Case B 沒拿到 phone（只有 customer query 結果）。可以 wire `bindLineToExistingCustomerById({ storeId, customerId, lineUserId, lineName })`，其中 `storeId` 從 NextAuth signIn 階段已 resolve 的 `targetStoreId` 傳入（trusted source — 不是來自 user input）— **建議 wire**；helper 內部會自驗 `customer.storeId === storeId`，Case B caller 不需要在外面重複防衛。

---

## 6. 需要哪些 PR 拆分

| PR | 範圍 | 大小 | 觀察 / 守門 |
| --- | --- | --- | --- |
| **PR-G5.0** | 本文件 merge | docs-only | reviewer 確認 invariants / 收斂方向無爭議 |
| **PR-G5.1** | 加 helper 新入口 `bindLineToExistingCustomerById`（純擴充,不改既有介面）+ 單元測試 | M | 不 wire 任何 caller;build/test 通過即可上 prod 觀察(同 PR-C1 的 dead-code-on-prod 策略) |
| **PR-G5.2** | Webhook 綁定碼路徑收斂:`handleBindingRequest` 改為呼叫 `bindLineToExistingCustomerById`;移除 inline `prisma.customer.update` + 條件 sync | M | Golden-output tests:對比 refactor 前後對相同 input 的 DB 寫入序列完全一致 |
| **PR-G5.3** | Zod / helper 加 A2 invariant 校驗:**任何 Customer.phone 寫入點不得 `startsWith("_oauth_")`**;**既有 row 不動**;新增 test | S | 此 PR 上線後,Case C 仍會試圖建 `_oauth_line_*` → 會 throw → NextAuth signIn fail。**故 PR-G5.3 必須與 PR-G5.4 同 PR train 或前後夾擊**,不可單獨 ship。 |
| **PR-G5.4** | auth.ts Case C 改寫:**移除** inline placeholder create;改為**簽 stage token via `oauth-stage-token.ts` + return Auth.js redirect URL 指向 `/api/oauth-line-stage`**(該 route handler 才呼叫 `setOAuthTempSession`、寫 cookie、redirect `/oauth-confirm`);復活 `/oauth-confirm` 流程入口;`finalizeLineBind` 走 customerId-driven `bindLineToExistingCustomerById`（**非** phone-driven） | L | 高風險;feature flag 包住;monitor signIn 完成率;同 PR ship PR-G5.3。`/oauth-confirm` 邊路「先不綁」必須有 |
| **PR-G5.5** | auth.ts Case B 收斂到 `bindLineToExistingCustomerById`(refactor only) | S | Golden-output tests |
| **PR-G5.6** | CI gate:加 read-only script `scripts/diagnose-new-placeholder-customers.ts`,掃 `Customer.phone LIKE '_oauth_%' AND createdAt > <feature-flag-ship-date>`,>0 → fail CI | S | 寫入端有 A2 校驗、讀取端有 CI gate,雙保險 |
| **PR-G5.7** | 把 PR-F1.2 audit 排程進 CI(weekly),mismatch 數提升 → 自動 issue | S | 不直接 fail CI(可能有先存 historical),但提醒 |
| **PR-G5.8** | 1-2 週 prod 觀察期通過後:刪除 auth.ts Case C feature flag、刪除 `_oauth_${provider}_*` 字串常數、刪 dead path | S | 在這之前 dead code 留著 = roll-back lever |
| **(獨立)** | 第 3 筆 `needs_manual_business_check` 處理(per-customer SOP,沿用 PR-F2 範本) | — | 由業務拍板後另開,**不在 PR-G5 系列** |
| **(獨立)** | Historical `_oauth_line_*` placeholder Customer backfill / cleanup | — | 寫入端鎖死後,**另開** read-only diagnose + manual review,**不在 PR-G5 系列** |

> 順序原則:helper 擴 → caller 收斂 → 把 placeholder 路徑關掉(同 PR ship 校驗+功能)→ CI gate → 觀察期 → 清理 dead code。每步可獨立 rollback。

---

## 7. 哪些檔案要改 / 不能碰

### 7.1 必改（PR-G5.1 ~ PR-G5.5）

| 檔案 | 變動 | 哪個 PR |
| --- | --- | --- |
| `src/server/services/bind-line-to-customer.ts` | **新增** entry point `bindLineToExistingCustomerById({ storeId, customerId, lineUserId, lineName })`(`storeId` required)；helper 內部 enforce `customer.storeId === storeId`（不等 → `store_mismatch`、0 byte 寫入）+ enforce `customer.userId !== null`（null → `customer_has_no_user`、0 byte 寫入，**不**靜默自動建 User，§5.3.2）+ Customer.update + Account.create 同 `$transaction`（A3 atomicity）；**不改**既有 `bindLineToCustomerInStore` | G5.1 |
| `src/server/services/bind-line-to-customer.test.ts` | 新增 entry point 的單元測試（含 `store_mismatch` pre-write semantics、`customer_has_no_user` pre-write semantics、A3 atomicity test） | G5.1 |
| `src/app/api/line/webhook/route.ts` | `handleBindingRequest` refactor：caller-side 先檢查 `customer.userId`：若 `null` → **沿用 legacy** `prisma.customer.update({ lineUserId, lineLinkStatus, lineLinkedAt })`、跳過 Account sync（無 User 可掛，§5.3.2）；若 `!== null` → 呼叫 `bindLineToExistingCustomerById({ storeId: resolvedStoreId, customerId, lineUserId, lineName })`，`storeId` 來自 webhook resolveStore（trusted）。**不**在 caller 端重複寫 cross-store 比對（helper 已 enforce）。**兩條 branch 都要被 PR-G5.2 golden-output 測試覆蓋**，確保 byte-equal vs refactor 前 | G5.2 |
| `src/__tests__/webhook-bind-code.test.ts`（新檔或補既有） | golden-output tests | G5.2 |
| `src/lib/normalize.ts` 或新 `src/lib/customer-phone-validation.ts` | A2 invariant:phone 不得 `startsWith("_oauth_")` | G5.3 |
| `src/lib/auth.ts` Case C | 移除 inline create;改為**簽 stage token via `oauth-stage-token.ts` + return Auth.js redirect URL 指向 `/api/oauth-line-stage?token=...`**;**禁止** import `src/lib/server/oauth-temp-session`（會把 `next/headers` 拉進 NextAuth bundle） | G5.4 |
| `src/lib/auth.ts` Case B | 改為呼叫 `bindLineToExistingCustomerById({ storeId: targetStoreId, customerId: customer.id, lineUserId, lineName })`（refactor only；`targetStoreId` 已是 signIn callback 內 resolved trusted value，直接傳）；**不**在 caller 端重複寫 cross-store guard | G5.5 |
| `src/app/(auth)/oauth-confirm/page.tsx` | 復活/微調 UI（dead code 已存在） | G5.4 |
| `src/app/(auth)/oauth-confirm/_components/oauth-confirm-form.tsx` | 同上 | G5.4 |
| `src/app/(auth)/oauth-confirm/finalize/page.tsx` | 同上 | G5.4 |
| `src/server/actions/oauth-confirm.ts`（`resolveLineLogin` / `finalizeLineBind`） | 復活；`resolveLineLogin`（NEW_USER + BOUND_EXISTING）wire phone-driven `bindLineToCustomerInStore`（OK，Customer.userId=null）；**`finalizeLineBind`（NEED_LOGIN）必須先驗 `oauth_line_session` cookie 的 signature / nonce（§5.3.1）— 驗失敗 → return auth/session error + 0 byte DB 寫入**；通過後 wire `bindLineToExistingCustomerById({ storeId, customerId, lineUserId, lineName })`（customerId-driven），`storeId` / `lineUserId` / `lineName` 從驗證過的 cookie payload 取（**HttpOnly 不是 integrity** — `/api/oauth-line-stage` 在寫 cookie 時必須以 §5.3.1 的方案 A/B/C 任一形式做完整性保護）、`customerId` 從 resolveLineLogin 階段的 NEED_LOGIN state 取；**禁止用 phone-driven `bindLineToCustomerInStore`** — 密碼確認後的 Customer 已有 `userId`，會被 hijack guard 擋下回 `phone_taken_by_other_user`，那是設計上正確的拒絕；**不**在 caller 端重複寫 cross-store guard 或 no-user guard（helper 已 enforce）；helper 回 `customer_has_no_user`（race / state 異常）→ finalize redirect 回 `/oauth-confirm` 而**不**靜默自動建 User | G5.4 |
| `src/lib/oauth-stage-token.ts` | HMAC sign/verify stage token；TTL；nonce uniqueness；**auth.ts 唯一允許 import 的「往 stage flow 遞交」入口**（不含 `next/headers`，edge-compatible） | G5.4 |
| `src/lib/server/oauth-temp-session.ts` | TTL / nonce 邊界再 review；**legal callers 限 `/api/oauth-line-stage` 與 `/oauth-confirm` server actions；禁止 auth.ts import**；**現行 raw JSON + HttpOnly cookie 缺 integrity 保護必須在 PR-G5.4 修補**（採 §5.3.1 方案 A：HMAC-SHA256 signed cookie / B：JWE encrypted / C：server-side nonce store），未補完成前不得讓 `/oauth-confirm/finalize` 信任 cookie payload 任何欄位（HttpOnly 只擋 JS、**不擋** client-crafted Cookie header） | G5.4 |
| `src/app/api/oauth-line-stage/route.ts` | 驗 stage token（`oauth-stage-token.ts`）→ 呼叫 `setOAuthTempSession` 寫 oauth_line_session cookie（**必須帶 §5.3.1 完整性保護**：HMAC-signed payload 或 opaque nonce）→ redirect `/oauth-confirm`；**這是新流程裡唯一寫該 cookie 的點** | G5.4 |

### 7.2 必加（新檔，PR-G5.6）

| 檔案 | 用途 |
| --- | --- |
| `scripts/diagnose-new-placeholder-customers.ts` | read-only;掃 `Customer.phone LIKE '_oauth_%' AND createdAt > <date>`;同 PR-F1.2 read-only 契約 |
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
| 加 DB `CHECK (phone NOT LIKE '_oauth_%')` | Prisma 不原生支援 CHECK constraint;要寫 raw SQL migration,增加 schema drift 風險;且既有 row 違反條件,migration 會失敗。改用應用層 Zod / helper(A2 invariant) |
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
| **R8** | helper 新 entry point `bindLineToExistingCustomerById` 與既有 entry point 雙寫導致行為分歧 | 中 | 共用 mask helpers + `logLineBindEvent`；但 atomicity 行為**刻意不同**（新 entry = Customer+Account 同 tx atomic；既有 = Account post-tx best-effort，受 PR-C2 §6 鎖）— PR description 與單元測試必須明寫此差異，避免 reviewer 誤以為「新舊一致」。 |
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
| `bindLineToExistingCustomerById` | 全部 status 分支：`bound_existing` / `already_synced` / `customer_locked`（已綁其他 LINE）/ `store_mismatch` / `customer_has_no_user` / `unique_conflict`（P2002）+ **A3 atomicity test**：mock `prisma.account.create` 拋錯 → 整組 `$transaction` rollback，Customer.lineUserId 不得被寫入（與既有 phone-driven helper 的 post-tx best-effort 行為**刻意不同**）+ **store_mismatch pre-write semantics test**：傳入 `{ storeId: storeA, customerId: <customer-in-storeB> }` → return `store_mismatch`，spy 確認 `prisma.customer.update` / `prisma.account.create` / `prisma.auditLog.create` 通通 **0 次** 呼叫（helper 在任何寫入前就因 storeId 不符 abort，cross-store guard 在 helper 內部一處完成，caller 端無需重複）+ **`customer_has_no_user` pre-write semantics test**：傳入 `{ customerId: <customer-with-userId-null> }` → return `customer_has_no_user`，spy 確認 `prisma.customer.update` / `prisma.account.create` / `prisma.user.create` / `prisma.auditLog.create` 全 **0 次** 呼叫（helper **不**靜默建 User，§5.3.2）+ **storeId required test**：呼叫 site 漏傳 `storeId` → TypeScript 型別錯（compile-time）/ runtime 防呆 throw |
| `bindLineToCustomerInStore`（existing） | 既有 7 status 全部 regression（PR-G5.1 不改行為）+ **明寫的非 atomic 行為**：mock `syncLineAccountForUser` 回 `error` → Customer 仍保留 `lineUserId`、回傳 `lineAccountSync: "error"` — 鎖死 baseline 行為，避免無聲被改 |
| A2 invariant validator | `_oauth_*` reject;正規化台灣手機 accept;空 phone reject |
| `resolveLineLogin` | NEW_USER / BOUND_EXISTING / NEED_LOGIN;Step 0 lineUserId 已綁直接 loginAsCustomer |
| `finalizeLineBind` | happy path（NEED_LOGIN，**via `bindLineToExistingCustomerById`**，且 cookie signature / nonce 已通過 §5.3.1 verify）+ **cookie integrity 必測**：(a) cookie 完全缺失 → 0 DB 寫入 + auth/session error；(b) tampered cookie（signature 不符 / nonce server-side store 查無） → 0 DB 寫入 + reject；(c) expired nonce / TTL 過期 → 0 DB 寫入 + reject；(d) 通過 verify 才允許進 helper + nonce reuse → abort + store mismatch → abort + TTL expired → abort + **反例：若誤接 phone-driven `bindLineToCustomerInStore` 應 fail-fast（會回 `phone_taken_by_other_user`）—當作 negative test 鎖死**；+ **`customer_has_no_user` 必測**：helper 回此 status → finalize 必須 redirect 回 `/oauth-confirm` 並**不**靜默自動建 User |
| `oauth-stage-token` | sign/verify round-trip；HMAC tamper reject；TTL expired reject；nonce reuse reject；**static import-graph assertion：`src/lib/auth.ts` 的 import closure 不含 `src/lib/server/oauth-temp-session` 也不含 `next/headers`** |
| `oauth-temp-session` | set/get/clear；TTL；nonce uniqueness；cookie attributes（httpOnly/secure/sameSite=lax/maxAge=300）+ **integrity 必測（§5.3.1）**：(a) 完全沒帶 cookie → `getOAuthTempSession()` 回 null + finalize 拒絕；(b) **tampered cookie**（手刻 `oauth_line_session={"storeId":"foreign","lineUserId":"Uxxxx",...}` 不帶合法 signature / nonce）→ 整 helper 拒絕，spy 確認 0 DB 寫入；(c) **expired session**（cookie 還在但 nonce / TTL 過期）→ 拒絕 + 0 DB 寫入；(d) **valid signed/nonce-verified session** → finalize 路徑得以正常進入並進到 helper；(e) **HttpOnly 不是 integrity**：在測試 narrative comment 寫明，避免未來 reviewer 誤把 HttpOnly 當保護 |

#### 9.2.2 Integration tests

| 場景 | 涵蓋 PR |
| --- | --- |
| 「店長先建檔 phone Customer」→ LIFF onboarding 命中既有 → bound_existing | G5.1 baseline |
| webhook 綁定碼（兩條 branch 都要覆蓋）：(A) `customer.userId !== null` → `bindLineToExistingCustomerById({ storeId: <webhook-resolved>, customerId, lineUserId, lineName })` → DB 寫入序列 vs refactor 前 byte-equal；(B) **`customer.userId === null` 的 legacy branch 必須保留**（§5.3.2）：caller 跳過 helper、直接 `prisma.customer.update({ lineUserId, lineLinkStatus, lineLinkedAt })`、不 sync Account（無 User 可掛）→ 兩種 input 的 DB 寫入序列都與 refactor 前 byte-equal；+ **cross-store reject case**:同一 lineUserId / 同一 customerId 但 caller 傳錯 store → `store_mismatch` + 0 byte DB 寫入 + 與 refactor 前同一 cross-store 拒絕語意保持一致 | G5.2 |
| 非 LIFF LINE OAuth + Case C 替換 → **auth.ts 簽 stage token → `/api/oauth-line-stage` 驗 token 並寫 oauth_line_session cookie → redirect `/oauth-confirm`** → 填 phone(新號) → NEW_USER → `bindLineToCustomerInStore` 走 candidates=0 分支 → 顧客 RELOGIN 後有完整身份鏈 | G5.4 |
| 非 LIFF LINE OAuth + 顧客已有 password Customer → 同上 stage token / route handler / **signed/nonce-verified cookie handoff** → `/oauth-confirm` 填 phone → NEED_LOGIN → 密碼登入 → `finalizeLineBind` **先驗 cookie integrity（§5.3.1）通過**才 wire **`bindLineToExistingCustomerById`（customerId-driven）** 寫 lineUserId + Account | G5.4 |
| **attack scenario**：使用者**完全跳過 LINE OAuth + stage route**、自己手刻 `oauth_line_session={"storeId":"<store>","lineUserId":"<任意 U...>","customerId":"<已用密碼登入的自己>"}` cookie → 直奔 `/oauth-confirm/finalize` → finalize 因 signature / nonce 驗證失敗 → return auth/session error + **0 byte DB 寫入**（含 AuditLog）+ 不會把任意 LINE 接管到該 customerId | G5.4 |
| webhook 綁定碼 **`customer.userId === null`** legacy 路徑（§5.3.2）：staff 後台建檔 + 顧客先用綁定碼接 LINE → caller 跳過 helper、走 legacy `prisma.customer.update`、無 Account row + 不建 User → 顧客之後從 LIFF / `/profile` 啟用流程啟用 User 時，再走 LIFF onboarding canonical helper 補 Account → 與 refactor 前語意完全一致 | G5.2 |
| 非 LIFF + 顧客中斷 `/oauth-confirm` → 5 分鐘後 cookie 失效 → 重來不卡 | G5.4 |
| auth.ts Case A drift repair(PR-F1 既有行為) regression | G5.5 |

#### 9.2.3 End-to-end / staging

跑在 `.env.staging.local`（既有 staging DB):

* LIFF 真機(LINE app 開 LIFF)走完 onboarding 三條分支
* 非 LIFF（desktop Chrome）走「LINE 登入」三條分支
* 把 PR-F1.2 audit script 跑在 staging：每個 PR 上線後 mismatch 數必須維持 0
* `scripts/diagnose-new-placeholder-customers.ts`（PR-G5.6 新增）跑在 staging：PR-G5.4 ship 後 `count(Customer.phone LIKE '_oauth_%' AND createdAt > shipDate) === 0`

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
* PR-G5.3 A2 invariant → feature flag 關掉
* PR-G5.4 auth.ts Case C 替換 → feature flag 切回 placeholder fallback(dead code 保留至 PR-G5.8 才刪)
* PR-G5.6 CI gate → 暫停 gate
* PR-G5.7 排程 audit → 暫停排程

---

## 10. 給 reviewer 的一句話

> 本文件只是 pre-audit；任何 PR-G5.x 上來,先確認:(a) 寫入點只在 §7.1 列表,（b）禁區符合 §7.3,（c）無 schema/migration（§8）,（d）有對應 §9.2 測試,（e）不違反 `identity-flow.md` §1 與 `pr-c2` §6 任一鎖死條款,（f）PR-F1.2 read-only contract test 持續 PASS。任何越界 → 退件。
