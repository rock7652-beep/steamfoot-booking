# 身份流程設計（identity flow）— PR-2 防分裂

> 適用範圍：LINE OAuth 登入流程 + /oauth-confirm 身份確認 + finalize 綁定
>
> 緣起：prod 觀察到顧客 LINE 登入會「靜默建第二筆 Customer」造成分裂；
> 根因 — `auth.ts` LINE OAuth callback 找不到既有 customer 時直接 create，
> 沒有「使用者主動授權」的閘門。本文件鎖定 PR-2 的修正設計。

---

## 1. 設計原則（鎖死，不可動）

1. **找到 phone ≠ 找到本人** — 已啟用顧客（有 passwordHash 或有 OAuth Account）必須過密碼這道閘，否則任何人知道手機就能 hijack。
2. **手機是錨點** — 禁止建立 placeholder phone（`_oauth_line_xxx`）的 Customer。無手機 = 無聯絡 = 無法人工辨識 = 比分裂更不可救。
3. **server 不做 redirect** — `resolveLineLogin` 回傳 discriminated union，全部 redirect 由 client 處理；避免 redirect 地獄。
4. **NextAuth session 改身分後必須 RELOGIN** — DB 改完 lineUserId 後 JWT cookie 仍是舊的，唯一可靠解是 `window.location.href = "/api/auth/signin?callbackUrl=..."`。禁用 `router.push` / `mutate("/api/session")` / 手動 patch JWT。
5. **OAuth temp session 跨頁傳遞身份** — LINE OAuth callback 完成 → /oauth-confirm 表單 → finalize，這條鏈需要短期 cookie 保存 lineUserId / displayName / storeId。

---

## 2. 完整流程（ASCII）

```
[使用者點 LINE 登入]
        ↓
[NextAuth LINE OAuth callback]
        ↓
[查 Customer by lineUserId（同 store）]
        ↓
   ┌────────┬──────────┐
   │ 找到   │ 找不到   │
   └────────┴──────────┘
        ↓                ↓
  [正常登入]      [setOAuthTempSession()]
                          ↓
                  [redirect /oauth-confirm
                   ?callbackUrl=...]
                          ↓
                 [使用者輸入手機（必填）]
                          ↓
                  [resolveLineLogin(phone)]
                          ↓
       ┌────────────────┬────────────────┬────────────────┐
       │ NEW_USER       │ BOUND_EXISTING │ NEED_LOGIN     │
       └────────────────┴────────────────┴────────────────┘
              ↓                  ↓                  ↓
       create Customer    bind LINE 到既有    redirect /login
       (LINE+phone)       Customer           ?phone=xxx
              ↓                  ↓           &callback=
       clear temp         clear temp         /oauth-confirm/finalize
              ↓                  ↓                  ↓
       RELOGIN            RELOGIN          [手機+密碼登入]
                                                  ↓
                                       [finalizeLineBind(customerId)]
                                                  ↓
                                            寫入 lineUserId
                                                  ↓
                                            clear temp
                                                  ↓
                                            RELOGIN
```

---

## 3. 三狀態判定規則（`resolveLineLogin` 核心邏輯）

### Step 0（防身份轉移）：**lineUserId 第一步必查**

```
查 Customer where lineUserId = session.lineUserId AND storeId = session.storeId
  → 找到 → 直接 loginAsCustomer + clear temp（這是 happy path 的回流）
```

理由：避免「A 已綁 LINE → 又走 oauth-confirm → 輸入 B 的手機 → LINE 從 A 跳到 B」的身份轉移攻擊。**比分裂更慘**。

### Step 1：用 phone + storeId 查 Customer

| Customer 狀態 | 判定條件 | 回傳 status |
|---|---|---|
| **找不到** | 無此 phone | `NEW_USER` |
| **找到 + 未啟用** | `user=null` 或 `user.passwordHash=null AND` 無任何 OAuth Account | `BOUND_EXISTING`（直接綁，安全：占位符等認領） |
| **找到 + 已啟用** | `user.passwordHash != null` 或有任何 OAuth Account（line/google） | `NEED_LOGIN`（必須密碼登入） |

### Step 2：回傳 discriminated union

```ts
type ResolveLineLoginResult =
  | { status: "NEW_USER"; customerId: string }
  | { status: "BOUND_EXISTING"; customerId: string }
  | { status: "NEED_LOGIN"; phone: string; customerId: string };
```

Server 不做 redirect，全部交給 client。

---

## 4. UI 文案（鎖死）

### /oauth-confirm 主頁

| 元素 | 文案 |
|---|---|
| 標題 | 🔒 驗證身份 |
| 說明 | 請輸入手機號碼（用於確認是否已有會員） |
| Input placeholder | 請輸入手機號碼（用於確認會員） |
| 按鈕 | 繼續 → |

### NEED_LOGIN 過場提示

```
此手機已有會員資料，請先登入以完成 LINE 綁定
```

**禁忌**：不要提「安全」「驗證」「保護」這類字眼 — 改用「幫你完成綁定」。
**禁忌**：不要提供「跳過」「之後再綁」選項 — 否則使用者會建第二帳號又分裂。

### finalize 過場（RELOGIN 前）

```
正在完成 LINE 綁定…
```

避免 reload 跳頁感。

---

## 5. OAuth Temp Session 規格

### Cookie 設定

| Field | Value |
|---|---|
| 名稱 | `oauth_line_session` |
| httpOnly | `true` |
| secure | `true` |
| sameSite | `lax` |
| path | `/` |
| maxAge | `5 * 60`（5 分鐘） |

### 內容

```ts
type OAuthTempSession = {
  lineUserId: string;
  displayName: string;
  storeId: string;
  nonce: string;        // crypto.randomUUID()
  createdAt: number;    // Date.now()
};
```

### 4 道安全閘

1. **TTL**：`Date.now() - createdAt > 5 * 60 * 1000` → throw expired
2. **nonce**：每次建立用 `crypto.randomUUID()`；finalize 用完強制 `clearOAuthTempSession()`，禁止 reuse
3. **storeId 綁定**：`session.storeId !== currentStoreId` → throw store mismatch
4. **LINE-already-bound**：見 §3 Step 0

### Helper 三件套

放在 `src/lib/oauth-temp-session.ts`：
- `setOAuthTempSession(data)` — set cookie
- `getOAuthTempSession()` — read + parse + TTL 檢查
- `clearOAuthTempSession()` — delete cookie

---

## 6. 開發順序（鎖死，最小爆炸半徑）

1. ✅ `docs/identity-flow.md`（本文件）— 流程文件先行
2. `/oauth-confirm` UI（純頁面，不接 auth、不寫 DB）
3. `src/lib/oauth-temp-session.ts` + `resolveLineLogin` server action
4. `finalizeLineBind` server action（含 RELOGIN return）
5. **最後**才改 `src/lib/auth.ts` LINE OAuth callback：找不到 → `setOAuthTempSession` + redirect `/oauth-confirm`

**原則**：「先把出口做好（確認頁 + actions），再把入口導進來（auth.ts）」。每一步獨立 commit，方便逐步 review。

---

## 7. 防呆清單（驗收必過）

- [ ] LINE 登入找不到 lineUserId 時，**一定**進 `/oauth-confirm`，**不可**靜默 create
- [ ] `resolveLineLogin` 第一步必查 lineUserId（防身份轉移）
- [ ] 已啟用顧客（有 password 或 OAuth）**必經密碼登入**，不可 silent bind
- [ ] 不允許建立 placeholder phone（`_oauth_line_xxx`）的 Customer
- [ ] phone normalize 後存入（`0912-345-678` / `+886912345678` → `0912345678`）
- [ ] 同 store 同 phone 必須只有一筆 Customer（依賴 schema 的 `@@unique([storeId, phone])`）
- [ ] finalize 寫完 DB **強制** `clearOAuthTempSession()`，禁止 nonce reuse
- [ ] callbackUrl 一路保留（auth → /oauth-confirm → /login → finalize → 回原頁）
- [ ] DB 寫完 lineUserId 後**必須** RELOGIN（`window.location.href = "/api/auth/signin?callbackUrl=..."`），不可 `router.push`

---

## 8. 已知接受風險（不在 PR-2 處理）

- **多 tab 並發 LINE 登入會覆蓋 cookie**：A tab 走到 /oauth-confirm 時 B tab 又走 LINE 登入會覆蓋 oauth_line_session。風險低（兩 tab 都是同一人），未來升級用 nonce + state 綁定。
- **歷史殘留資料**（如張舒閔 / 黃芊文 authSource=EMAIL 但有 lineUserId）：另開 backfill 腳本處理，不混進 PR-2。

---

## 9. 後續 PR

- **PR-3（LIFF 註冊帶 lineUserId）**：`/register` 偵測 LIFF 環境帶 LINE userId；`customer-auth.ts` 接收後寫進 Customer + `authSource=LINE`，避免「在 LINE 內走 /register 卻被標 EMAIL」。
- **PR-4（LineBindingSection wiring + 顧客端綁定入口）**：補救既有 17 位無 LINE 顧客；接 [LineBindingSection](src/app/(dashboard)/dashboard/customers/[id]/line-binding-section.tsx) 到顧客詳情頁。
