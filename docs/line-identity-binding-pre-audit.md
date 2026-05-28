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
| **A3** | 若 `Customer.lineUserId IS NOT NULL` 且 `Customer.userId IS NOT NULL`，則必存在 `Account[provider=line, providerAccountId=Customer.lineUserId, userId=Customer.userId]` | 是 PR-F1 偵測的 `account-mismatch` / `missing-account` 兩條 drift 的條件;只能靠寫入時同 tx 建 Account 來維持 |
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

**✓ 已對**。

- `/api/liff/exchange` 路徑（PR-B）：(storeId, lineUserId) 查無 Customer → 回 `need_onboarding`，不寫 DB。
- `/liff/onboarding/actions.ts`（PR-C2）：呼叫 `bindLineToCustomerInStore`。
- `bindLineToCustomerInStore` 第 148-298 行：明確處理「candidates 由 (storeId, phone) 命中 1 筆、`!real.lineUserId && !real.userId`」→ create User + bind LINE 到既有 placeholder Customer。
- 全程 in $transaction、Account[line] 同 tx sync、P2002 guard 已加（PR-F1）。

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
| **(P) 必做:auth.ts Case C 斷流** | Case C 不再建 placeholder Customer。改為 `setOAuthTempSession() + return false`，導使用者去 `/oauth-confirm` 表單收 phone（復活 PR-2，但只在此 case 觸發） | 與 PR-2 撤的原因相反,但這次有 LIFF 為主流;非 LIFF 是 fallback,接受較低 conversion |
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
| **F1** | auth.ts Case C **不再 inline create**。改為:`setOAuthTempSession({ lineUserId, displayName, storeId, nonce })` + return false → NextAuth 把使用者導到 `signin?error=...` → middleware / page 偵測 oauth_line_session cookie → redirect `/oauth-confirm` |
| **F2** | `/oauth-confirm` 表單收 phone（lib/server/oauth-temp-session.ts + actions 都已存在）→ `resolveLineLogin(phone, storeId)` 跑 §3 PR-2 三狀態判定 → 對應 `NEW_USER` / `BOUND_EXISTING` / `NEED_LOGIN` 三條 client-side redirect |
| **F3** | `NEED_LOGIN` 流程：redirect `/login?phone=...&callback=/oauth-confirm/finalize` → 顧客密碼登入 → finalize 寫 Customer.lineUserId + Account[line]（一 tx，**走 `bindLineToCustomerInStore`**，不再 inline） |
| **F4** | 為了 mitigate PR-2 conversion drop-off：`/oauth-confirm` 提供「我先不綁、純看內容」邊路 → 此 click 不寫任何 Customer，只發 emit ErrorLog 紀錄「未綁定 LINE 登入嘗試」供店長後台主動聯絡；oauth_line_session 5 分鐘 expire 即清，不留 orphan User |

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
| 同 $transaction 內 User + Customer + Account[line] 三件齊全 | `bindLineToCustomerInStore` 已是；auth.ts Case B 也是；Case C 修法後要走同條 helper |
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
| 同 tx Account[line] sync? | ✓ | ❌（僅 customer.userId 存在時才 sync，否則留 orphan-line） | ✓（best-effort drift repair, PR-F1） | ✓ | ✓ |
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

`bindLineToCustomerInStore` 現有 7 種 status 涵蓋 phone-driven 流程。webhook 綁定碼是 **「customerId-driven」**（綁定碼已決定要綁哪筆 Customer），不需 phone 比對。要 wire webhook 必須**在 helper 加新入口**：

```ts
bindLineToExistingCustomerById({
  customerId,       // 由綁定碼 resolve
  lineUserId,
  lineName,
}): { status: "bound_existing" | "already_synced" | "customer_locked" | "store_mismatch" | "unique_conflict" }
```

> 設計約束:這是「**新增 API**」不是「**改既有 API**」,所以不違反 `pr-c2-liff-onboarding-plan.md` §6「不改 `bindLineToCustomerInStore` 介面或行為」— 既有的 phone-driven 入口 0 動。新 entry point 與既有共用內部的 tx + Account[line] sync + log。

### 5.4 NextAuth Case A / B 是否也要 wire helper

- **Case A**（customer 存在且 userId 已設）：本質是「補寫 Account[line]」的 drift repair。helper 沒有對應 entry point，且 PR-F1 已加 P2002 guard + best-effort logic。**建議不動**，避免 over-engineering。
- **Case B**（customer 存在但無 userId）：本質是「為 backend-pre-created Customer 啟用 NextAuth User + 綁 LINE」。helper 已可處理（phone-driven 分支命中既有 placeholder Customer）。但 Case B 沒拿到 phone（只有 customer query 結果）。可以 wire `bindLineToExistingCustomerById`，**建議 wire**。

---

## 6. 需要哪些 PR 拆分

| PR | 範圍 | 大小 | 觀察 / 守門 |
| --- | --- | --- | --- |
| **PR-G5.0** | 本文件 merge | docs-only | reviewer 確認 invariants / 收斂方向無爭議 |
| **PR-G5.1** | 加 helper 新入口 `bindLineToExistingCustomerById`（純擴充,不改既有介面）+ 單元測試 | M | 不 wire 任何 caller;build/test 通過即可上 prod 觀察(同 PR-C1 的 dead-code-on-prod 策略) |
| **PR-G5.2** | Webhook 綁定碼路徑收斂:`handleBindingRequest` 改為呼叫 `bindLineToExistingCustomerById`;移除 inline `prisma.customer.update` + 條件 sync | M | Golden-output tests:對比 refactor 前後對相同 input 的 DB 寫入序列完全一致 |
| **PR-G5.3** | Zod / helper 加 A2 invariant 校驗:**任何 Customer.phone 寫入點不得 `startsWith("_oauth_")`**;**既有 row 不動**;新增 test | S | 此 PR 上線後,Case C 仍會試圖建 `_oauth_line_*` → 會 throw → NextAuth signIn fail。**故 PR-G5.3 必須與 PR-G5.4 同 PR train 或前後夾擊**,不可單獨 ship。 |
| **PR-G5.4** | auth.ts Case C 改寫:**移除** inline placeholder create;改為 `setOAuthTempSession + return false`;復活 `/oauth-confirm` 流程入口 | L | 高風險;feature flag 包住;monitor signIn 完成率;同 PR ship PR-G5.3。`/oauth-confirm` 邊路「先不綁」必須有 |
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
| `src/server/services/bind-line-to-customer.ts` | **新增** entry point `bindLineToExistingCustomerById`;**不改**既有 `bindLineToCustomerInStore` | G5.1 |
| `src/server/services/bind-line-to-customer.test.ts` | 新增 entry point 的單元測試 | G5.1 |
| `src/app/api/line/webhook/route.ts` | `handleBindingRequest` refactor 為呼叫新 helper | G5.2 |
| `src/__tests__/webhook-bind-code.test.ts`（新檔或補既有） | golden-output tests | G5.2 |
| `src/lib/normalize.ts` 或新 `src/lib/customer-phone-validation.ts` | A2 invariant:phone 不得 `startsWith("_oauth_")` | G5.3 |
| `src/lib/auth.ts` Case C | 移除 inline create;改為 `setOAuthTempSession + return false` | G5.4 |
| `src/lib/auth.ts` Case B | 改為呼叫 `bindLineToExistingCustomerById`(refactor only) | G5.5 |
| `src/app/(auth)/oauth-confirm/page.tsx` | 復活/微調 UI（dead code 已存在） | G5.4 |
| `src/app/(auth)/oauth-confirm/_components/oauth-confirm-form.tsx` | 同上 | G5.4 |
| `src/app/(auth)/oauth-confirm/finalize/page.tsx` | 同上 | G5.4 |
| `src/server/actions/oauth-confirm.ts`（`resolveLineLogin` / `finalizeLineBind`） | 復活;`finalizeLineBind` 內部改 wire `bindLineToCustomerInStore`(不要再 inline write) | G5.4 |
| `src/lib/server/oauth-temp-session.ts` | TTL / nonce 邊界再 review | G5.4 |
| `src/app/api/oauth-line-stage/route.ts` | 對應 oauth-temp-session 復活 | G5.4 |

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
| **R8** | helper 新 entry point `bindLineToExistingCustomerById` 與既有 entry point 雙寫導致行為分歧 | 中 | 兩者共用內部 tx + Account[line] sync + log;單元測試覆蓋兩者對相同 customer / lineUserId 的最終 DB 狀態相等 |
| **R9** | 既有 historical `_oauth_line_*` row 在 A2 invariant 上線後被任何 update 操作觸發 | 中 | A2 只校驗 `create` 與「`update` 且包含 phone」;既有 row 純讀取 / 改其他欄位都不受影響 |
| **R10** | PR-G5.4 ship 後 LIFF 內部因為某 edge case fallback 走到 NextAuth Case C(再也不會 create placeholder)→ LIFF 登入失敗 | 中 | LIFF entry 走 `/api/liff/exchange` + `liff-token` provider,不經 LINE OAuth provider 的 signIn callback;但需 E2E 確認;若真有 fallback path,須單獨修而非倒退 placeholder |
| **R11** | Cross-store guard 在新路徑被遺漏 | 中 | 新 caller 也呼叫 `crossStoreLineUserCount` 查詢;helper level 加共用 guard 函式 |
| **R12** | NextAuth Account 全域 unique（S6）使任何 LINE OAuth 第一次寫 Account 時若有歷史 `Account[provider=line, providerAccountId=X]` 存在於別的 User → P2002;新流程須 friendly 處理 | 中 | helper 既有 P2002 guard 回 `unique_conflict`;client UX 顯示「此 LINE 已綁其他帳號,請聯繫店家」 |

### 9.2 測試策略

#### 9.2.1 Unit tests（每個 PR ship 前必過）

| 測試對象 | 內容 |
| --- | --- |
| `bindLineToExistingCustomerById` | 全部 status 分支：`bound_existing` / `already_synced` / `customer_locked`（已綁其他 LINE）/ `store_mismatch` / `unique_conflict`（P2002） |
| `bindLineToCustomerInStore`（existing） | 既有 7 status 全部 regression（PR-G5.1 不改行為） |
| A2 invariant validator | `_oauth_*` reject;正規化台灣手機 accept;空 phone reject |
| `resolveLineLogin` | NEW_USER / BOUND_EXISTING / NEED_LOGIN;Step 0 lineUserId 已綁直接 loginAsCustomer |
| `finalizeLineBind` | happy path + nonce reuse → abort + store mismatch → abort + TTL expired → abort |
| `oauth-temp-session` | set/get/clear;TTL;nonce uniqueness;cookie attributes(httpOnly/secure/sameSite=lax/maxAge=300) |

#### 9.2.2 Integration tests

| 場景 | 涵蓋 PR |
| --- | --- |
| 「店長先建檔 phone Customer」→ LIFF onboarding 命中既有 → bound_existing | G5.1 baseline |
| webhook 綁定碼 → `bindLineToExistingCustomerById` → DB 寫入序列 vs refactor 前 byte-equal | G5.2 |
| 非 LIFF LINE OAuth + Case C 替換 → 導 `/oauth-confirm` → 填 phone(新號) → NEW_USER → bindLineToCustomerInStore 走 candidates=0 分支 → 顧客 RELOGIN 後有完整身份鏈 | G5.4 |
| 非 LIFF LINE OAuth + 顧客已有 password Customer → `/oauth-confirm` 填 phone → NEED_LOGIN → 密碼登入 → finalize 寫 lineUserId + Account | G5.4 |
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
