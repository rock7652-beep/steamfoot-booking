# LIFF Setup（PR-A）

> 範圍：竹北店 MVP。第二家店上線前會以 `Store.liffId` migration 取代環境變數（PR-E）。
> 上層 plan：[docs/line-mini-app-plan.md](./line-mini-app-plan.md)

## 1. LINE Developers Console 設定步驟

> 操作角色：擁有蒸足 LINE Developers 工作區 admin 權限的人。

### 1.1 確認 / 建立 LINE Login channel

1. 進入 [LINE Developers Console](https://developers.line.biz/console/)
2. 選擇蒸足的 Provider（若無 → 先建 Provider「Steamfoot」）
3. 在該 Provider 下確認是否已有 **LINE Login** channel
   - **MVP 階段**：竹北店共用既有 channel（與 NextAuth `LINE_LOGIN_CHANNEL_ID/SECRET` 同一個）
   - 多店期：每店一個 channel，由 PR-G 處理

### 1.2 建立 LIFF App

在剛剛的 LINE Login channel 內：

1. 開「LIFF」分頁 → 點「Add」
2. 填入以下設定：

| 欄位 | 值 | 說明 |
|---|---|---|
| LIFF app name | `Steamfoot 竹北` | 用於辨識，使用者看不到 |
| Size | `Full` | 全螢幕；MVP 需要 |
| Endpoint URL | `https://www.steamfoot.com/s/zhubei/liff` | **務必照這個 path**；proxy 已就緒 |
| Scope | `profile`、`openid` | PR-B 之後會用 idToken 走後端 verify，須含 `openid` |
| Bot link feature | `On (Aggressive)` | 進站時引導加官方帳號好友 |
| Module mode | `Off` | 一般 mode 即可 |

3. 建立後會得到 **LIFF ID**（格式 `1234567890-abcdefgh`）。複製下來。

### 1.3 將 LIFF ID 寫入環境變數

| 環境 | 操作 |
|---|---|
| 本機 dev | 編輯 `.env.local`，加 `NEXT_PUBLIC_LIFF_ID_ZHUBEI="1234567890-abcdefgh"` |
| Vercel preview | Vercel Dashboard → Settings → Environment Variables → 加 `NEXT_PUBLIC_LIFF_ID_ZHUBEI`（scope=Preview）|
| Vercel production | 同上但 scope=Production；**留到 PR-D 上線前才寫入**，PR-A merge 不必動 prod |

> ⚠️ 因為是 `NEXT_PUBLIC_*`，會打包到 client bundle；LIFF ID 本身不算機密，可外露。
> 真正不能外露的是 channel secret（已存在 `LINE_LOGIN_CHANNEL_SECRET`）。

## 2. 本地驗收

```bash
# 1. 寫入 .env.local
echo 'NEXT_PUBLIC_LIFF_ID_ZHUBEI="1234567890-abcdefgh"' >> .env.local

# 2. 啟動 dev server
npm run dev

# 3. 瀏覽器開
open http://localhost:3000/s/zhubei/liff
```

預期：

- ✅ 頁面顯示「LINE Mini App / 竹北店 / /s/zhubei/liff」
- ✅ 短暫顯示「LIFF 初始化中…」後切換到 ready 狀態
- ✅ 出現提示「目前不在 LINE 內，部分功能將無法使用」（因為一般瀏覽器不是 LINE App）
- ✅ 兩顆 disabled 按鈕「預約體驗（即將開放）」「我的資料（即將開放）」
- ✅ 未登入瀏覽不會被 redirect 到 `/s/zhubei/`

若沒填 `NEXT_PUBLIC_LIFF_ID_ZHUBEI`：

- ✅ 頁面顯示「竹北店 尚未開通 LINE Mini App」（明確錯誤頁，不 crash）

## 3. LINE 內驗收（PR-A 階段）

開 LIFF URL：`https://liff.line.me/<LIFF_ID>`

- ✅ 在 LINE 內開啟會 redirect 到 endpoint URL `/s/zhubei/liff`
- ✅ 顯示「已在 LINE App 內開啟」
- ✅ 兩顆 disabled CTA

PR-A 不接登入、不接綁定、不接預約；上述行為足夠驗收。

## 4. PR-B 新增：idToken exchange API

PR-B 加了後端 session bootstrap，UI 流程仍由 PR-C 接管。本節純為 backend integrator 使用。

### 4.1 端點

```
POST /api/liff/exchange
Content-Type: application/json

{ "idToken": "<from liff.getIDToken()>", "storeSlug": "zhubei" }
```

### 4.2 環境變數

| 變數 | 用途 | 來源 |
|---|---|---|
| `LINE_LOGIN_CHANNEL_ID` | 驗 idToken `aud` 必須命中 | 已存在（NextAuth LINE OAuth 用同一個）|
| `LINE_LOGIN_CHANNEL_SECRET` | (PR-B 不需要)| — |
| `NEXT_PUBLIC_LIFF_ID_ZHUBEI` | client-side `liff.init()` 用 | PR-A 已加 |

> ⚠️ Vercel preview / prod 必須有 `LINE_LOGIN_CHANNEL_ID`；缺則 exchange API 一律回 500 `MISSING_CHANNEL_CONFIG`。

### 4.3 回應格式

| HTTP | body.status | body.code | 場景 |
|---|---|---|---|
| 200 | `session_created` | — | Customer 命中、session cookie 已發 |
| 200 | `need_onboarding` | — | Customer 不存在 / 未綁 userId（PR-C 接補手機）|
| 400 | `error` | `INVALID_BODY` | zod 驗 body 失敗 |
| 401 | `error` | `ID_TOKEN_INVALID` | LINE verify 回 400（非過期）|
| 401 | `error` | `ID_TOKEN_EXPIRED` | idToken 過期 |
| 401 | `error` | `ID_TOKEN_AUD_MISMATCH` | aud 不是本店 channel |
| 401 | `error` | `ID_TOKEN_ISS_MISMATCH` | iss 不是 `https://access.line.me` |
| 401 | `error` | `SESSION_MINT_FAILED` | authorize() 失敗（race）|
| 404 | `error` | `STORE_NOT_FOUND` | storeSlug 在 DB 找不到 |
| 500 | `error` | `MISSING_CHANNEL_CONFIG` | env 沒設 |
| 500 | `error` | `INTERNAL` | 預期外錯誤 |
| 502 | `error` | `VERIFY_NETWORK` | LINE verify 端點連線失敗 |

成功時 response 含 `Set-Cookie: authjs.session-token=...; HttpOnly; SameSite=lax`，後續 NextAuth `useSession()` 自動讀取。

### 4.4 安全模型

- **三層 verify 設計**：exchange route 與 authorize() 各做一次 LINE verify（defense in depth）。即使有人略過 exchange 直打 NextAuth callback，authorize() 仍會擋下偽造 idToken。
- **aud 鎖在 `LINE_LOGIN_CHANNEL_ID`**：MVP 期單一 channel；PR-G 多店時 swap 為 `Store.lineLoginChannelId` 動態查詢。
- **Customer 同店唯一**：`@@unique([storeId, lineUserId])`，跨店相同 lineUserId 不會誤命中。
- **員工帳號擋下**：authorize() 內 `role !== "CUSTOMER"` 拒絕（與 LINE OAuth signIn callback 同邏輯）。

### 4.5 本地 / preview curl smoke

```bash
# A. 不該打到 LINE verify 的快速路徑
curl -sS -X POST http://localhost:3001/api/liff/exchange \
  -H "Content-Type: application/json" -d '{}' -w "\nHTTP %{http_code}\n"
# 預期：400 INVALID_BODY

# B. 真實打 LINE verify（fake idToken）
curl -sS -X POST http://localhost:3001/api/liff/exchange \
  -H "Content-Type: application/json" \
  -d '{"idToken":"fake.jwt.string","storeSlug":"zhubei"}' \
  -w "\nHTTP %{http_code}\n"
# 預期（dev 有設 LINE_LOGIN_CHANNEL_ID）：401 ID_TOKEN_INVALID + "JWS format error"
# 若 dev 沒設：500 MISSING_CHANNEL_CONFIG

# C. 真實 idToken（從 LIFF debug=1 拿）
TOKEN="$(從 LIFF 內取得)"
curl -sS -X POST https://www.steamfoot.com/api/liff/exchange \
  -H "Content-Type: application/json" \
  -d "{\"idToken\":\"$TOKEN\",\"storeSlug\":\"zhubei\"}" \
  -i  # -i 看 Set-Cookie header
# 預期：200 session_created + Set-Cookie: authjs.session-token=...
#       或 200 need_onboarding（若 Customer 沒綁 lineUserId）
```

## 5. PR-C1 新增：bindLineToCustomerInStore() canonical helper

PR-C 拆成 C1 / C2 / C3 三包；本節為 C1 — **helper-only / dead code on prod**。
PR-C2 (LIFF onboarding UI) 與 PR-C3 (webhook + signIn callback 切換熱路徑) 後續才 wire。

### 5.1 為什麼分三包

| 子 PR | 內容 | 風險 |
|---|---|---|
| **C1 (本節)** | 純新增 `src/server/services/bind-line-to-customer.ts` + tests；無 caller | 🟢 低 — dead code |
| C2 | LIFF onboarding page + LiffShell wire `/api/liff/exchange` need_onboarding | 🟡 中 — 新增 UI flow |
| C3 | 切換 webhook `handleBindingRequest` + signIn callback Case 3 為呼叫 helper | 🔴 高 — prod 熱路徑，需 C2 prod 穩定 1-2 週後才動 |

### 5.2 Helper interface

```typescript
import type { BindLineInput, BindLineResult } from "@/server/services/bind-line-to-customer";

const result: BindLineResult = await bindLineToCustomerInStore({
  storeId: string;        // 同店 scope（caller 已驗）
  lineUserId: string;     // LINE verify 後的 sub
  lineName: string | null;
  phone: string;          // helper 會 normalizePhone
  name: string;
});
```

### 5.3 8 條 status 分支 + UI 文案 mapping（PR-C2 將實作對應 UX）

| status | 場景 | PR-C2 預期 UX |
|---|---|---|
| `created_new` | 同店無此 phone → 建新 User+Customer+Account；綁 LINE | redirect 到 /book，顯示「歡迎加入」 |
| `bound_existing` (userCreated=true) | staff 建檔的 Customer（userId=null, lineUserId=null）→ 建 User + 補綁 | redirect 到 /book，顯示「資料已連結 ✓」 |
| `already_synced` | Customer 已綁同 lineUserId + 有 userId | redirect 到 /book，顯示「已綁定」 |
| `already_bound_to_other_line` | phone 命中但已綁不同 LINE | 顯示「請聯繫店家換綁」（沿用 webhook 文案）|
| `phone_taken_by_other_user` | phone 命中但已綁登入帳號（無 LINE）—**R1 hijack 防禦** | 顯示「請改用綁定碼流程」，引導到 LINE OA 索取 |
| `ambiguous_multiple_candidates` | 髒資料 — 同店多筆同 phone | 顯示「請聯繫店家協助確認」 |
| `validation_error` (`invalid_phone`) | 手機格式不對（normalizePhone 後仍非 09xxxxxxxx）| 表單 inline 錯誤訊息 |
| `validation_error` (`missing_input`) | storeId/lineUserId/name 缺 | 不該到使用者面前（caller bug）|

### 5.4 安全模型

- **R1 (hijack)**：phone 已綁 userId → reject `phone_taken_by_other_user`，**不允許 LIFF onboarding 自動覆蓋既有登入帳號的 LINE 綁定**。改走 webhook 綁定碼（需 staff 驗證身份）。
- **R5 (LINE 已綁別人)**：phone 已綁不同 lineUserId → reject `already_bound_to_other_line`，明確文案。
- **R8 (Account sync)**：helper 內 `syncLineAccountForUser` 必呼，符合 [project_line_account_sync_rule](../memory/project_line_account_sync_rule.md)；sync 失敗以 status 欄位回報，不 throw。
- **§7.1 (跨店手機)**：helper 只查 `(storeId, phone)`，跨店同手機自然不影響。

### 5.5 Side effects（best-effort post-tx）

| Helper | 何時呼叫 | 失敗處理 |
|---|---|---|
| `syncLineAccountForUser` | 寫 Customer.lineUserId 之後 | status 欄位回報，不影響主結果 |
| `repairCustomerIdentityOnLogin` | tx 完成後 | swallow + console.warn |
| `awardLineJoinReferrerIfEligible` | tx 完成後 | swallow + console.warn |

**不接 referral binding（per §11.3 決策）**；PR-C 不處理 `bindReferralToCustomer` 流程。

### 5.6 dead-code 狀態驗證

PR-C1 merge 後在 prod：
- ✅ helper module 存在 `src/server/services/bind-line-to-customer.ts`
- ✅ vitest 26 + 既有身份測試 75 = 101 全綠
- ✅ `grep -rn "bindLineToCustomerInStore" src/` 應該**只有 helper 自身 + test 兩個檔案**
- ✅ build 不爆（dead export 仍會被 tree-shake；但因有 test 引用所以保留 module）
- ✅ `/api/liff/exchange` 行為**完全不變**：仍回 `need_onboarding` 對未綁 customer，因為 onboarding action 還沒接

## 6. 新增分店時要做的事（多店期）

PR-E 之後，新增分店要 LIFF 入口時：

1. 在 LINE Developers Console 新建一個 LIFF（endpoint URL 改為 `https://www.steamfoot.com/s/{newSlug}/liff`）
2. 拿到 LIFF ID → 寫進 `Store.liffId`（後台 `/hq/dashboard/stores/new` 或 edit）
3. 把 `src/app/(liff)/liff/page.tsx` 裡的 `LIFF_ID_BY_SLUG` dict 整段替換為 DB 查詢
4. 不需要 fork 任何頁面

已完成的事：
- [x] **PR-A**：路由 `/s/[slug]/liff` 已就緒、proxy 公開白名單已加 `/liff`、`@line/liff` SDK 已安裝、LIFF shell + 三態 UI 已就緒
- [x] **PR-B**：`/api/liff/exchange` API + `liff-token` NextAuth Credentials provider + 後端 idToken verify helper
- [x] **PR-C1**：`bindLineToCustomerInStore()` canonical helper（dead code，待 PR-C2/C3 wire）
