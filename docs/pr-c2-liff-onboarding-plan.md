# PR-C2 LIFF Onboarding 實作計畫（wiring-only 修正版）

> **此版本取代 v1。** v1 誤判 PR-A/B/C1 未完成，要 Code 重做已存在的東西，已作廢。
> 本版只 wire 既有資產，不重建任何 PR-A/B/C1 已交付的元件。
> 對應 UX 稿：「Steamfoot LIFF Onboarding 顧客體驗流程稿」

---

## 🚦 Code 開工通行證（最上面一定要看完）

### 五個已拍板決策（不要再回頭問）

1. **聯繫店家按鈕**：PR-C2 先 hardcode 全店共用 LINE OA 連結，不動 schema。連結存在 `src/lib/liff/messages.ts` 的 `contactStoreUrl` 常數。
2. **storeSlug 來源**：沿用既有 `x-store-slug` header + cookie fallback（與 `(liff)/liff/page.tsx` 完全一致的取法）。
3. **`src/lib/liff/messages.ts`**：要做。所有 LIFF UI 文案集中管理；`src/app/(liff)/**` 一律 `import { liffMessages }`，不寫 inline 中文。
4. **signed_in 畫面**：三顆「即將開放」按鈕用 disabled 顯示（沿用既有 `<DisabledCta>` 樣式）。
5. **成功後過場**：不做 600ms 過場。server action 回 `ok` 後直接 client `signIn("liff-token", { idToken, storeSlug, redirect: false })` → `router.replace("/s/{slug}/liff")` → 由 LiffShell 的 `signed_in` state 渲染「歡迎回來」。

### 絕對禁區（任何一條被踩到 → reviewer 直接退件）

- ❌ 不新增 `@line/liff` 依賴（PR-A 已裝）
- ❌ 不新增 `/api/auth/liff-exchange` 路由（既有路徑是 `/api/liff/exchange`，差一個字也不行）
- ❌ 不新增 `liff-token` provider（PR-B 已寫）
- ❌ 不新增 `customer-line-binding.ts` 或其他「重抽 binding」的 service
- ❌ 不改 `bindLineToCustomerInStore` 介面或內部行為（PR-C1 已驗證並有測試）
- ❌ 不改 `/api/liff/exchange` 回應 schema 或內部行為
- ❌ 不動 LINE OAuth provider
- ❌ 不動 webhook
- ❌ 不動 Prisma schema、不寫 migration
- ❌ 不做預約、my-bookings、剩餘堂數實作（只放 disabled 按鈕）
- ❌ 不做 referral、AI 評估、設密碼

### PR-C2 只做這 5 件事

1. **改寫** `src/app/(liff)/liff/liff-shell.tsx` — 加 exchange 子流程與新狀態 CTA 切換
2. **新增** `src/lib/liff/messages.ts` — 集中文案 + `contactStoreUrl` 常數
3. **新增** `src/app/(liff)/liff/onboarding/page.tsx` — server component 容器
4. **新增** `src/app/(liff)/liff/onboarding/onboarding-form.tsx` — client component 表單
5. **新增** `src/app/(liff)/liff/onboarding/actions.ts` — server action `submitOnboarding`，呼叫既有 `bindLineToCustomerInStore`

---

## 0. 真實現況（PR-A/B/C1 已交付，PR-C2 一律不重做）

### 0.1 ✅ 已存在 — PR-C2 直接使用，不修改其外部介面

| 資產 | 路徑 | 重要事實 |
| --- | --- | --- |
| `@line/liff` SDK 整合 | `src/lib/liff/client.ts`、`src/lib/liff/verify-id-token.ts` | `initLiff(liffId)`、`isInLineClient()`、`LiffInitError` 已導出；後端 verify 在 `verifyLiffIdToken()` |
| LIFF route group | `src/app/(liff)/liff/{layout,page,liff-shell}.tsx` | 故意不沿用 `(customer)` layout（後者會 redirect 未登入者）；URL 從 proxy rewrite 成 `/s/{slug}/liff` |
| LiffShell 狀態機 | `src/app/(liff)/liff/liff-shell.tsx` | 目前只有 `loading / ready / error` 三態；CTA 是兩顆 disabled「即將開放」。**PR-C2 會擴充其狀態與 CTA** |
| `POST /api/liff/exchange` | `src/app/api/liff/exchange/route.ts` | 收 `{ idToken, storeSlug }`，回 `session_created | need_onboarding | error`。已自帶 idToken verify、Customer 查詢、session mint。**不改其行為與回應 schema** |
| `liff-token` NextAuth provider | `src/lib/auth.ts` (lines ~295–400) | Credentials provider，會二次 verify idToken。**PR-C2 不改** |
| `bindLineToCustomerInStore()` | `src/server/services/bind-line-to-customer.ts` | 完整實作 + 已有測試；回傳 `BindLineResult` discriminated union（見 §3.2）。**PR-C2 直接呼叫，不改其介面** |

### 0.2 ❌ PR-C2 絕對不做（v1 計畫誤觸的禁區）

- 不新增 `@line/liff` 依賴
- 不新增 `/api/auth/liff-exchange` 路由（既有路徑是 `/api/liff/exchange`，不是 `/api/auth/...`）
- 不新增 `liff-token` provider
- 不新增 `customer-line-binding.ts`（既有 `bindLineToCustomerInStore` 已是 canonical helper）
- 不動 schema、不寫 migration
- 不抽 `oauth-confirm` 共用函式（既有 `bindLineToCustomerInStore` 就是共用 helper，PR-C3 才會把 OAuth 改 wire 過來）
- 不動 LINE OAuth provider
- 不動 webhook
- 不動 `/oauth-confirm` 流程

---

## 1. PR-C2 範圍（只 wire 既有東西）

### 1.1 核心流程

```
LINE App 開啟 /s/{slug}/liff
        │
        ▼
   liff.init() (PR-A，不改)
        │
        ▼
 取 liff.getIDToken() → POST /api/liff/exchange (PR-B，不改)
        │
        ├── status="session_created" ──► 顯示「歡迎回來」+ 三顆即將開放按鈕
        │
        ├── status="need_onboarding" ──► 顯示「開始使用」CTA
        │                               └► 點擊 → /s/{slug}/liff/onboarding
        │
        └── status="error" ───────────► 依 code 顯示對應顧客文案

/s/{slug}/liff/onboarding (新增)
        │
        ▼
   liff.init() + liff.getIDToken()（同 shell 流程）
        │
        ▼
   <OnboardingForm /> 顯示姓名+手機表單
   姓名預填：再次 call /api/liff/exchange 取得 displayName，或從 navigate state 帶
        │
        ▼ submit
   server action submitOnboarding({ idToken, storeSlug, name, phone })
        │
        ├── 1. 後端 verifyLiffIdToken（同 liff-token provider 做法）
        ├── 2. resolveStoreBySlug → storeId
        ├── 3. 呼叫 bindLineToCustomerInStore({ storeId, lineUserId, lineName, phone, name })
        └── 4. 依 BindLineResult.status 回傳 onboarding 結果
        │
        ▼ 成功（created_new / bound_existing / already_synced）
   client signIn("liff-token", { idToken, storeSlug, redirect: false })
        │
        ▼
   router.replace(`/s/{slug}/liff`)
        │
        ▼
   LiffShell 重跑 → exchange 回 session_created → 顯示「歡迎回來」
```

### 1.2 任務清單（4 件 wiring 工作）

| # | 工作 | 檔案 | 動作 |
| --- | --- | --- | --- |
| 1 | 擴充 LiffShell 狀態機 | `src/app/(liff)/liff/liff-shell.tsx` | **改寫**：加 `ready` 後的 `exchange` 子流程；按 exchange 結果切換 UI |
| 2 | 新增 onboarding page | `src/app/(liff)/liff/onboarding/page.tsx` | **新增**：server component 取 store slug + 包 `<OnboardingForm />` |
| 3 | 新增 onboarding form | `src/app/(liff)/liff/onboarding/onboarding-form.tsx` | **新增**：client component；liff init → 取 idToken → 姓名/手機表單 → 呼 server action → 處理 status → 成功時 signIn + redirect |
| 4 | 新增 server action | `src/app/(liff)/liff/onboarding/actions.ts` | **新增**：`submitOnboarding(formData)`；verify idToken + 呼 `bindLineToCustomerInStore` |
| 5 | 新增 messages 集中檔 | `src/lib/liff/messages.ts` | **新增**：顧客語言文案 dict + `contactStoreUrl` 常數；`src/app/(liff)/**` 一律 import |

---

## 2. LiffShell 狀態機改寫細節

### 2.1 新增的 state

```ts
type ShellState =
  | { status: "initializing" }              // liff.init 進行中
  | { status: "not_in_line_app" }           // !isInLineClient()
  | { status: "exchanging" }                // 正在 call /api/liff/exchange
  | { status: "need_onboarding"; displayName: string | null }
  | { status: "signed_in"; displayName: string | null }
  | { status: "expired" }                   // exchange 回 ID_TOKEN_EXPIRED / INVALID
  | { status: "service_unavailable"; detail?: string }  // 其他 error code
```

### 2.2 改寫流程

```ts
// 在現有 LiffShell useEffect 內：
// 1. 既有 await initLiff(liffId) 保留
// 2. 既有 isInLineClient() 檢查保留 → 不在 LINE 內 → not_in_line_app
// 3. 新增：const idToken = liff.getIDToken()
//    若為 null → expired (再要求顧客重開)
// 4. 新增：fetch("/api/liff/exchange", { POST, body: { idToken, storeSlug } })
//    依回應 status 設 state:
//    - session_created → signed_in
//    - need_onboarding → need_onboarding（保留 displayName）
//    - error.code:
//        ID_TOKEN_EXPIRED / ID_TOKEN_INVALID → expired
//        其他 (CONFIG / STORE_NOT_FOUND / VERIFY_NETWORK / SESSION_MINT_FAILED / INTERNAL)
//                                              → service_unavailable
```

### 2.3 UI 切換

```ts
{state.status === "initializing" && <Loading />}
{state.status === "not_in_line_app" && <NotInLineApp />}
{state.status === "exchanging" && <Loading />}
{state.status === "need_onboarding" && <WelcomeCta storeSlug={storeSlug} />}
{state.status === "signed_in" && <WelcomeBack displayName={state.displayName} />}
{state.status === "expired" && <ExpiredError />}
{state.status === "service_unavailable" && <ServiceUnavailable />}
```

`<WelcomeCta>`：UX 稿 §二「歡迎使用暖暖蒸足 LINE 會員服務」+「開始使用」按鈕 → `router.push(`/s/${storeSlug}/liff/onboarding`)`。

`<WelcomeBack>`：UX 稿 §六「歡迎回來」+ 三顆 disabled 「即將開放」按鈕（保留既有 `<DisabledCta>` 元件即可，把標籤改成 UX 稿三個項目）。

> 既有 `<ReadyBlock>` / `<DisabledCta>` / `<ErrorBlock>` / `<LoadingBlock>` 可重用或拆組，避免重複實作 UI 樣式。

---

## 3. Onboarding page / form / action

### 3.1 路由與檔案

```
src/app/(liff)/liff/onboarding/
├── page.tsx                # server component
├── onboarding-form.tsx     # client component
└── actions.ts              # server action: submitOnboarding
```

`page.tsx` 跟 `(liff)/liff/page.tsx` 一樣，透過 `headers().get('x-store-slug')` 取 slug，`resolveStoreBySlug` → 取 `storeName`、`liffId`，傳給 `<OnboardingForm />`。**不查 Customer、不寫 DB。**

### 3.2 `bindLineToCustomerInStore` 回傳值 → UX 文案對應表

| `BindLineResult.status` | UX 處理 | 文案（messages key） | 主按鈕 | 次按鈕 |
| --- | --- | --- | --- | --- |
| `created_new` | 視為成功 → signIn → redirect | `onboarding.successTitle` / `successBody` | `successCta` 「回到會員首頁」 | — |
| `bound_existing` | 同上 | 同上 | 同上 | — |
| `already_synced` | 同上（idempotent） | 同上 | 同上 | — |
| `already_bound_to_other_line` | 失敗，留在 form | `error.boundOther`「這支手機目前需要店家協助確認，請透過 LINE 聯繫我們。」 | 聯繫店家 | — |
| `phone_taken_by_other_user` | 同上（UX 稿 §五-3 顧客語言一致） | 同上 | 聯繫店家 | — |
| `ambiguous_multiple_candidates` | 失敗，留在 form | `error.ambiguous`「我們需要協助您確認會員資料，請透過 LINE 聯繫我們。」 | 聯繫店家 | — |
| `validation_error.invalid_phone` | inline form error | `error.invalidPhone`「手機格式不正確，請輸入 09 開頭共 10 碼的手機號碼。」 | 留在表單 | — |
| `validation_error.missing_input` | inline form error | 普通必填提示（不寫「missing_input」） | 留在表單 | — |

server action 額外可能回的 status（不來自 bind helper）：

| status | 來源 | UX 文案 | 主按鈕 |
| --- | --- | --- | --- |
| `expired` | verifyLiffIdToken 拋 EXPIRED | `error.expired`「登入已逾時，請重新從 LINE 開啟此頁。」 | 重新整理 |
| `service_unavailable` | verify 拋 NETWORK / 其他內部錯 / store_not_found | `error.serviceUnavailable`「目前服務暫時無法使用，請稍後再試，或透過 LINE 聯繫我們。」 | 重新整理（次按鈕：聯繫店家） |

### 3.3 server action 介面

```ts
// src/app/(liff)/liff/onboarding/actions.ts
"use server";

import { verifyLiffIdToken, LiffIdTokenError } from "@/lib/liff/verify-id-token";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { bindLineToCustomerInStore } from "@/server/services/bind-line-to-customer";

export type OnboardingActionResult =
  | { status: "ok" }                                  // created_new / bound_existing / already_synced
  | { status: "invalid_phone" }
  | { status: "bound_other" }                         // already_bound_to_other_line
  | { status: "phone_taken_by_login_account" }        // phone_taken_by_other_user
  | { status: "ambiguous" }
  | { status: "expired" }
  | { status: "service_unavailable" };

export async function submitOnboarding(input: {
  idToken: string;
  storeSlug: string;
  name: string;
  phone: string;
}): Promise<OnboardingActionResult> {
  // 1. env channel id 檢查 → service_unavailable
  // 2. verifyLiffIdToken (sub = lineUserId, displayName)
  //    LiffIdTokenError.code === "EXPIRED" → expired
  //    其他 → service_unavailable
  // 3. resolveStoreBySlug → store_not_found 視為 service_unavailable
  // 4. result = await bindLineToCustomerInStore({
  //      storeId, lineUserId, lineName, phone, name
  //    })
  // 5. switch result.status → 對應上表
}
```

> 注意：**這支 server action 不 mint session**。session 由 client 拿 result.status === "ok" 後呼叫 `signIn("liff-token", ...)` 取得（與既有 `/api/liff/exchange` 成功路徑的設計一致：authorize() 內會再次 verify，這是 NextAuth 安全邊界）。

### 3.4 client 端成功流程

```ts
// 在 OnboardingForm submit handler 內：
const idToken = liff.getIDToken();
if (!idToken) { setError(messages.error.expired); return; }

const result = await submitOnboarding({ idToken, storeSlug, name, phone });

switch (result.status) {
  case "ok":
    // 顯示 successTitle 短暫過場 (~600ms) 或直接 signIn
    await signIn("liff-token", { idToken, storeSlug, redirect: false });
    router.replace(`/s/${storeSlug}/liff`);
    return;
  case "invalid_phone":
    setFieldError("phone", messages.error.invalidPhone); return;
  case "bound_other":
  case "phone_taken_by_login_account":
    setBlockState({ message: messages.error.boundOther, contactStore: true }); return;
  case "ambiguous":
    setBlockState({ message: messages.error.ambiguous, contactStore: true }); return;
  case "expired":
    setBlockState({ message: messages.error.expired, primaryCta: "reload" }); return;
  case "service_unavailable":
    setBlockState({
      message: messages.error.serviceUnavailable,
      primaryCta: "reload",
      contactStore: true,
    }); return;
}
```

### 3.5 表單欄位（依 UX 稿 §三）

| 欄位 | type | placeholder | 預設 | 驗證（client） |
| --- | --- | --- | --- | --- |
| 姓名 | text | 請輸入姓名 | LIFF displayName（可改） | 非空 |
| 手機 | tel（`inputMode="tel"`） | `0912 345 678` | 空 | `/^09\d{8}$/`（server 端會再做一次） |

主按鈕：「確認會員資料」（disabled 直到兩欄都有值）
小字：「手機號碼僅用於確認會員資料，不會公開顯示。」

---

## 4. messages 文案集中檔（必做）

`src/lib/liff/messages.ts`，逐字使用 UX 稿原文。**新增 `contactStoreUrl` 常數**作為「聯繫店家」按鈕導向（PR-C2 決策 #1）：

```ts
/**
 * PR-C2 階段：全店共用一個 LINE OA 連結；多店分流交給 PR-E
 * (Store.lineDestination 已存在，但 PR-C2 不動 schema/DB，待 PR-E 再 wire)
 */
export const contactStoreUrl = "https://line.me/R/ti/p/@steamfoot";

export const liffMessages = {
  shell: {
    welcomeTitle: "歡迎使用暖暖蒸足 LINE 會員服務",
    welcomeBody: "為了讓您查詢預約、剩餘堂數與接收服務提醒，請先確認您的會員資料。",
    welcomeCta: "開始使用",
    welcomeFootnote: "只需一次，完成後下次從 LINE 進入即可直接使用。",
    signedInTitle: "歡迎回來",
    signedInBody: "您已啟用暖暖蒸足 LINE 會員服務。",
    comingSoon: {
      booking: "體驗預約（即將開放）",
      myBookings: "我的預約（即將開放）",
      remainingSessions: "剩餘堂數（即將開放）",
    },
    notInLineApp: {
      title: "請從 LINE 開啟此頁",
      body: "為了確認您的會員資料，請從 LINE 圖文選單或好友訊息開啟此頁。",
    },
  },
  onboarding: {
    title: "確認您的會員資料",
    body: "請輸入您在店內留下的姓名與手機號碼，我們會用手機確認您的會員資料。",
    nameLabel: "姓名",
    namePlaceholder: "請輸入姓名",
    phoneLabel: "手機號碼",
    phonePlaceholder: "0912 345 678",
    phoneHelp: "請輸入您在店內留下的手機號碼",
    submit: "確認會員資料",
    privacyNote: "手機號碼僅用於確認會員資料，不會公開顯示。",
    successTitle: "歡迎回來",
    successBody: "您的 LINE 會員服務已啟用。之後可以從 LINE 查詢預約、剩餘堂數與接收服務提醒。",
    successCta: "回到會員首頁",
  },
  error: {
    invalidPhone: "手機格式不正確，請輸入 09 開頭共 10 碼的手機號碼。",
    boundOther: "這支手機目前需要店家協助確認，請透過 LINE 聯繫我們。",
    ambiguous: "我們需要協助您確認會員資料，請透過 LINE 聯繫我們。",
    expired: "登入已逾時，請重新從 LINE 開啟此頁。",
    serviceUnavailable: "目前服務暫時無法使用，請稍後再試，或透過 LINE 聯繫我們。",
    contactStoreCta: "聯繫店家",
    retryCta: "重新整理",
  },
} as const;
```

> 規則：所有 `src/app/(liff)/**` 與 `src/components/liff/**` 一律 `import { liffMessages }` 取值；不寫 inline 中文字串。
> Reviewer 看到 `(liff)` 路徑下的 JSX 出現「綁定」「驗證」「session」「身份」等技術詞 → 退件。

---

## 5. 測試範圍（PR-C2）

### 5.1 單元測試

- `src/app/(liff)/liff/onboarding/actions.test.ts`
  - 8 種 `bindLineToCustomerInStore` 回傳 status × server action 對應的 mapping case
  - mock `verifyLiffIdToken` 拋 `EXPIRED` → action 回 `expired`
  - mock 拋 `NETWORK` → action 回 `service_unavailable`
  - mock `resolveStoreBySlug` 回 null → `service_unavailable`

### 5.2 整合 / 元件測試

- LiffShell：mock `/api/liff/exchange` 回三種主要 status → 確認 UI 切換
- OnboardingForm：mock server action → 確認 8 種 status 文案顯示與按鈕

### 5.3 手動 QA（PR-C2 ship 前）

| 場景 | 期望 |
| --- | --- |
| 第一次從 LINE App 開 `/s/zhubei/liff` | 看到「開始使用」CTA |
| 點 「開始使用」→ 填入新手機 + 姓名 | 成功 → 看到「歡迎回來」三顆即將開放按鈕 |
| 關掉 mini app 再次開啟 | 直接「歡迎回來」（不再要求 onboarding） |
| 故意填入已綁別人 LINE 的手機 | 看到「這支手機目前需要店家協助確認…」+ 聯繫店家 |
| 故意填入已有登入帳號的手機 | 同上文案 |
| 故意填 `091234` | inline 顯示「手機格式不正確…」 |
| 桌面 Chrome 開同 URL | 看到「請從 LINE 開啟此頁」 |
| idToken 過期狀況（手動讓 LIFF SDK 回 null） | 看到「登入已逾時，請重新從 LINE 開啟此頁」 |

---

## 6. 不做清單（再次明列，避免任何誤會）

- ❌ 不裝 `@line/liff`（PR-A 已裝）
- ❌ 不新增 `/api/auth/liff-exchange` 路由（PR-B 既有路徑是 `/api/liff/exchange`）
- ❌ 不寫 `liff-token` provider（PR-B 已寫）
- ❌ 不寫 `customer-line-binding.ts`（PR-C1 既有 `bindLineToCustomerInStore` 就是 canonical）
- ❌ 不改 `bindLineToCustomerInStore` 介面或行為
- ❌ 不改 `/api/liff/exchange` 行為或回應 schema
- ❌ 不改 `liff-token` provider
- ❌ 不動 Prisma schema、不寫 migration
- ❌ 不重抽 `oauth-confirm`（OAuth 路徑由後續 PR-C3 改 wire 過 `bindLineToCustomerInStore`，不在 PR-C2 範圍）
- ❌ 不動 LINE OAuth provider
- ❌ 不動 webhook
- ❌ 不做預約、my-bookings、剩餘堂數（只放 disabled 按鈕）
- ❌ 不做 referral、AI、設密碼

---

## 7. 已拍板決策（不要再回頭問）

| # | 決策 | 落實位置 |
| --- | --- | --- |
| 1 | **聯繫店家按鈕**：PR-C2 先 hardcode 全店共用 LINE OA 連結，不動 schema。 | `src/lib/liff/messages.ts` 的 `contactStoreUrl` 常數（見 §4）；多店分流留給 PR-E |
| 2 | **storeSlug 來源**：沿用既有 `x-store-slug` header + cookie fallback。 | `src/app/(liff)/liff/onboarding/page.tsx` 完全 copy `(liff)/liff/page.tsx` 的取法（`headers().get('x-store-slug') ?? cookies().get('store-slug')?.value ?? 'zhubei'`） |
| 3 | **`messages.ts`：要做**。所有 LIFF UI 文案集中。 | `src/lib/liff/messages.ts`（見 §4）；`(liff)/**` 一律 import，不寫 inline 中文 |
| 4 | **signed_in 畫面**：三顆「即將開放」按鈕用 disabled 顯示。 | LiffShell 的 `<WelcomeBack>`，沿用既有 `<DisabledCta>` 樣式；標籤從 `liffMessages.shell.comingSoon.{booking,myBookings,remainingSessions}` 取 |
| 5 | **成功後不做 600ms 過場**：server action 回 `ok` → 直接 `signIn("liff-token", ...)` → `router.replace("/s/{slug}/liff")`。 | OnboardingForm submit handler（見 §3.4）；「歡迎回來」由回流後的 LiffShell `signed_in` state 渲染 |

---

## 8. 開發順序建議

1. 加 `src/lib/liff/messages.ts`（純常數，無 side effect）
2. 寫 `src/app/(liff)/liff/onboarding/actions.ts` + 單元測試
3. 寫 `src/app/(liff)/liff/onboarding/onboarding-form.tsx`（先以 router-only 連線，不接 LIFF）
4. 寫 `src/app/(liff)/liff/onboarding/page.tsx`（server component 包裝）
5. 串 LIFF idToken 進 form
6. 改寫 `liff-shell.tsx`：加 exchange + 狀態切換 + CTA
7. 串 `signIn("liff-token", ...)` 成功回流
8. 手動 QA + 補測試
9. PR 描述複述「做 / 不做」邊界，標註「本 PR 不重做 PR-A/B/C1 任何資產」

---

## 9. 給 reviewer 的一句話

> 這個 PR 只 wire 既有 PR-A/B/C1 的成品，不重建任何已存在的元件。
> 若 review 時看到新增 `@line/liff`、新增 `/api/auth/liff-exchange`、新增 `liff-token` provider、新增 `customer-line-binding.ts`、改 `bindLineToCustomerInStore` 介面、或改 schema → 直接退件。
> UI 文案出現「綁定」「驗證身份」「session」等技術詞 → 退件。
