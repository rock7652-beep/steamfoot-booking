# Steamfoot LINE Mini App / LIFF 架構盤點與 PR 拆分

> 狀態：草稿（read-only 盤點，未動任何 prod / migration / code）
> 日期：2026-05-20
> 範圍：竹北店做第一套可複製的 LIFF template；架構必須能 1:1 複製到未來分店
> 限制：本文件不含實作；只盤點現況、列風險、定 PR 拆法。

---

## 0. 目的

竹北店做出第一套「LINE Mini App / LIFF template」，內含：
1. LIFF shell（在 LINE 內 open 的 webview）
2. LINE session bootstrap（liff idToken → NextAuth session）
3. Customer binding（LINE userId ↔ Customer，含補手機）
4. 體驗預約（FIRST_TRIAL）

**關鍵約束**：架構必須允許未來新店只要在 LINE Developers Console 申請 LIFF + 在後台填一個 LIFF ID，就能複用同一份程式碼，不需要 fork 任何頁面。

---

## 1. 現況盤點（read-only）

### 1.1 多店基礎能力（已具備 ✅）

| 能力 | 現況 | 證據 |
|---|---|---|
| storeSlug 路由 | `/s/[storeSlug]/*` 已在 proxy 全面落實 | `src/proxy.ts:62-170` |
| storeId 隔離 | JWT 帶 `storeId`/`storeSlug`，server query 一律以 `session.storeId` 為準 | `src/lib/auth.ts:113-114, 174-180, 749-793` |
| LINE Login（OAuth）| NextAuth `line` provider 已串接（含 `token_type` conform、scope=profile）| `src/lib/auth.ts:228-294` |
| Customer.lineUserId 同店唯一 | `@@unique([storeId, lineUserId])` | `prisma/schema.prisma:596` |
| OAuth callback 多店感知 | `oauth-store-slug` cookie + `resolveStoreFromOAuthCookie()` | `src/lib/store-resolver.ts:66-86`、`src/app/oauth-buttons.tsx:13` |
| 同店 LINE 比對 + 跨店 log | signIn callback 嚴格 same-store 查找，跨店只 log 不切 store | `src/lib/auth.ts:340-362` |
| Webhook destination → store | `Store.lineDestination` unique；webhook 從 payload.destination 反查 store；找不到就安全中止（不 fallback DEFAULT_STORE）| `src/app/api/line/webhook/route.ts:87-106`、`prisma/schema.prisma:393` |
| LINE 文字綁定碼 | 「綁定 ABC123」流程，6 碼 per-store unique，含 24h 過期 + Account 同步 | `src/app/api/line/webhook/route.ts:245-376`、`prisma/schema.prisma:527-528, 597` |
| Messaging push/reply | `pushMessage` / `replyMessage` / `getUserProfile` 已封裝 | `src/lib/line.ts` |
| /line-entry 推薦中繼頁 | 已支援 `?ref=`，寫 `pending-ref` cookie，signIn 後綁 `sponsorId` | `src/app/line-entry/page.tsx`、`src/app/line-entry/actions.tsx` |
| BookingType.FIRST_TRIAL | 體驗預約 type 已存在 | `prisma/schema.prisma:131` |
| 防禦性身份修補 | `repairCustomerIdentityOnLogin()` 在登入時 best-effort 重綁 | `src/lib/identity-repair.ts` |
| 推薦 +1 | `awardLineJoinReferrerIfEligible()` 在 LINE 綁定首次成功時發點 | `src/server/services/referral-points.ts` |
| 建店流程支援 lineDestination | `/hq/dashboard/stores/new` 可填 `lineDestination` | `src/types/store-onboarding.ts:27`、`src/app/hq/dashboard/stores/new/page.tsx:19` |

**結論**：多店 + LINE 的底層幾乎齊全。**Customer / OAuth / Webhook / 路由四件事都已 per-store 隔離。**

### 1.2 多店尚未具備（缺口 ❌）

| 缺口 | 影響 | 補法 |
|---|---|---|
| LIFF SDK 整合 | LIFF webview 無法取 idToken / liff.profile | 引入 `@line/liff`；新增 `src/lib/liff/` |
| 每店 LIFF ID 儲存 | 全站僅能 hard-code 一個 LIFF 入口 | 短期：`NEXT_PUBLIC_LIFF_ID_ZHUBEI` env；長期：`Store.liffId` 欄位 |
| 每店 LINE Login channel | `LINE_LOGIN_CHANNEL_ID/SECRET` 是 env 全域單一 | MVP 期：竹北獨用；多店期：channel-per-store + dynamic provider（PR-G）|
| 每店 LINE Messaging channel | `LINE_CHANNEL_ACCESS_TOKEN/SECRET` 是 env 全域單一 | 同上 |
| Rich Menu 程式化 | 完全沒有 | 不在 MVP；LINE OA 後台手動設 |
| LIFF idToken 後端 verify | 無 `/api/liff/exchange` | PR-B 新增 |
| `liff` 路由白名單 | proxy.ts 沒列 | PR-A 補進 storePublicPrefixes |

### 1.3 已落地但需特別注意的歷史包袱

- **`auth.ts` signIn callback 的 PR-2 stage flow 已撤**：原本 LINE 找不到 Customer 會導去 `/oauth-confirm` 要求補手機；現在改為 transaction 內直接建立完整身份鏈（含 placeholder phone `_oauth_line_xxx`，後續顧客在 `/profile` 補真實手機）。`docs/identity-flow.md` 是舊版設計，與現況脫節，本次盤點不修舊文件，但 LIFF 流程要避免再重蹈「placeholder phone」這個坑 — LIFF 必須在預約前強制補手機。
- **proxy.ts URL slug 不做靜默 fallback**：無效 slug 由 customer layout gate 擋下，不會被改寫成 `zhubei`。這對 LIFF 是好事 — LIFF endpoint 對應的 store slug 寫死在 LINE Console，不會被打飛。
- **JWT 寫入時機**：只在登入當下寫，後續請求不查 DB。`useSession().update()` 才會 trigger 重讀。LIFF 綁定完成後若要 NextAuth session 立即生效，必須走「重新發 NextAuth cookie」這條路（用 Credentials provider 內部簽 JWT），不能只更新 DB。

---

## 2. 問題逐條回答

### 2.1 現有 Steamfoot 是否已有足夠的多店 LIFF 基礎？

- **路由 / Customer 模型 / OAuth callback / Webhook destination 反查**：✅ 已具備，不需要動 schema 也能跑通竹北店 MVP。
- **LIFF SDK / `Store.liffId` / per-store channel credentials**：❌ 完全空白。
- **MVP 評估**：以 env 暫存 LIFF ID 與既有 single LINE Login channel 即可跑通竹北。第二家店要上線前再加 `Store.liffId` migration（PR-E）和 channel-per-store 拆分（PR-G）。

### 2.2 竹北店 LIFF endpoint 是否應使用 `/s/zhubei/liff`？

**Yes，強烈建議。** 理由：

1. **與既有 `/s/[storeSlug]/*` 路由命名一致**，proxy.ts 只要把 `/liff` 加進 `storePublicPrefixes` 就能 rewrite，0 改動 storeId resolution。
2. **LIFF endpoint URL 在 LINE Developers Console 是「LIFF ID 對應一個固定 URL」的 1-to-1 關係**。每店一個 LIFF ID → 每店一個 endpoint `/s/{slug}/liff` → 天然多店隔離，後端不需要再從 query string 猜店。
3. **未來新店複製模板**：建店 → 在 Console 申請新 LIFF，endpoint URL 填 `https://app.steamfoot.com/s/{newSlug}/liff` → 把 LIFF ID 寫進 `Store.liffId`（PR-E 後）→ 完成，沒有任何 fork。
4. **子頁面同樣命名**：`/s/{slug}/liff/book`、`/s/{slug}/liff/profile`、`/s/{slug}/liff/my-bookings`。與 web `/book`、`/profile` 區分 — LIFF 內外行為差異大（liff.closeWindow、liff.openWindow、不要瀏覽器 chrome），UI 層分 wrapper 較乾淨。

### 2.3 每間店是否應該有自己的 LINE OA、LIFF ID、Rich Menu？

**OA、LIFF ID：是。Rich Menu：是，但 MVP 用後台手動設不寫 code。**

| 項目 | 建議 | 原因 |
|---|---|---|
| LINE OA（Messaging channel）| 一店一個 | 顧客加錯店家好友會混淆；webhook destination 已是 per-store key；店家自管粉絲 |
| LINE Login channel | 一店一個（理想）；MVP 暫時竹北獨用全域 env | NextAuth provider 是靜態註冊，dynamic 解需要 PR-G；MVP 先用一個 channel 走 |
| LIFF ID | 一店一個 | LIFF endpoint URL 是固定的 store-scoped path；Console 註冊綁定 |
| Rich Menu | 一店一個 | 內容（地址、體驗 CTA、預約 deep link）皆 store-specific；MVP 由店家在 LINE OA Manager 手動建，PR-F 給模板文件 |

### 2.4 如何避免 duplicate customer？

現有護欄：
- `@@unique([storeId, lineUserId])`：同店重複 LINE 進站不會建第二筆
- `@@unique([storeId, phone])`：補手機時若撞既有 customer，server 端有機會 merge
- `@@unique([storeId, googleId])` 與 `@@unique([storeId, email])`：跨 provider 同店也唯一
- `repairCustomerIdentityOnLogin()` 防禦性重綁

LIFF 新增風險與對策：
1. **不信任 client 傳的 lineUserId**：必須走 `liff.getIDToken()` → 後端 verify with LINE token endpoint → 取得 verified userId/email。任何 LIFF API 都以 verified result 為準。
2. **第一次 LIFF 進站還沒有 Customer**：強制走 `/s/{slug}/liff/onboarding` 補手機；補手機 server action：
   - phone 在 store 內已存在 + 該 customer 無 lineUserId → 直接綁 + repair
   - phone 在 store 內已存在 + 有不同 lineUserId → 拒絕，顯示「請聯繫店家換綁」（沿用 webhook 文案）
   - phone 未存在 → 建新 Customer（authSource=LINE）
3. **既有 web flow 的 placeholder phone**：LIFF 預約前一律 `requirePhone()`，placeholder（`_oauth_line_*`）直接拒絕，導向補手機頁。
4. **共用綁定邏輯**：把「LINE → Customer 綁定」抽成 `bindLineToCustomerInStore()` 共用函式，`auth.ts` signIn callback、webhook 文字綁定、LIFF onboarding 都呼叫它，避免三處邏輯漂移。

### 2.5 如何確保跨店資料不混用？

現有護欄已落地：
- JWT 帶 storeId；所有 server action 寫入用 `currentStoreId(user)`，不可被 cookie/URL slug 改寫
- prisma schema 大量 `@@unique([storeId, ...])` 與 `@@index([storeId])`
- proxy.ts URL slug 不做靜默 fallback；無效 slug 由 layout gate 顯示 fallback UI，不會被改站
- signIn callback 跨店 LINE 命中只 log 不切 store

LIFF 新增補強：
- LIFF page server 端 resolve store：URL slug → `resolveStoreBySlug()`；同時要求 LIFF idToken 的 `aud`（channelId）對應的 store 與 URL slug 一致，否則拒絕。
- LIFF deep link 一律帶 `/s/{slug}/` 前綴（`liff.openWindow({ url: '/s/zhubei/...' })`）。
- `/api/liff/exchange` 接到 idToken 後驗證：(a) issuer = `https://access.line.me` (b) aud = 該 store 的 channelId (c) exp 未過期。任一不符立即拒絕。
- LIFF 內所有 server action 沿用既有 `requirePermission()` / `currentStoreId()` pattern，禁止用 URL slug 直接寫入。

### 2.6 LIFF shell、LINE session、Customer binding、體驗預約如何拆 PR？

見第 3 節。

### 2.7 哪些先做 MVP，哪些延後？

見第 3 節「MVP / 延後總表」。

---

## 3. PR 拆分（竹北店 MVP）

每個 PR 都應該：獨立可 review、merge 後可單獨上 prod 不出事、有 vitest 覆蓋核心邏輯。

### PR-A：LIFF shell + 環境設定（MVP，~1 天）

**目的**：把 `/s/[storeSlug]/liff` 路由開通，內容為 placeholder + `liff.init()`。

範圍：
- `src/proxy.ts`：把 `/liff` 加進 `storePublicPrefixes`（與 `/line-entry` 同類）
- 新增 `src/app/(customer)/liff/layout.tsx`（route group，方便共用 server resolve）
- 新增 `src/app/(customer)/liff/page.tsx`：執行 `liff.init()`，顯示 store name + 兩顆按鈕（去預約、去個人資料）
- 新增 `src/lib/liff/client.ts`：封裝 `init / login / getIDToken / openWindow / closeWindow / isInClient`
- 引入 `@line/liff` 依賴
- 環境變數：`NEXT_PUBLIC_LIFF_ID_ZHUBEI`（MVP 暫存；多店期改 `Store.liffId`）
- 新增 `docs/liff-setup.md`：LINE Developers Console 設定步驟（建 channel → 建 LIFF → endpoint URL → scope）

不在範圍：真正登入綁定（PR-C）、預約（PR-D）。

風險：低；單純多一個 page。

### PR-B：LINE session bootstrap（MVP，~1.5 天）

**目的**：LIFF 內透過 idToken 建立 NextAuth session，與 web `signIn("line")` 匯流到同一個 Customer。

範圍：
- 新增 `src/app/api/liff/exchange/route.ts`：收 `{ idToken, storeSlug }` → 用 LINE `https://api.line.me/oauth2/v2.1/verify` verify → 取得 verified `sub`(lineUserId) / `aud`(channelId) → 查 `(storeId, lineUserId)` 有無 Customer
  - 有 customer：發 NextAuth session cookie（Credentials provider 內部簽）
  - 無 customer：回 `{ status: "need_onboarding" }`
- 擴充 `src/lib/auth.ts`：新增 `liff-token` Credentials provider，accept verified payload；不動既有 `line` OAuth provider
- 安全：idToken aud 必須等於該 store 對應的 LIFF channelId（PR-A 寫死竹北一個；PR-E 之後改查 DB）
- vitest：mock LINE verify 端點，覆蓋成功 / aud 不符 / 過期 / 無 customer 四條路徑

風險：中；要動 NextAuth provider 列表。對策：只新增 provider，不改 line OAuth 行為，web flow 完全不受影響。

### PR-C：Customer binding flow（MVP，~1 天）

**目的**：LIFF 第一次進站 + 無 Customer → 強制補手機 → 綁定或建立 Customer。

範圍：
- 新增 `src/app/(customer)/liff/onboarding/page.tsx`：手機 + 姓名表單（client component，submit 後呼 server action）
- 新增 server action `bindLineToCustomerInStore({ storeId, lineUserId, lineName, phone, name })`：
  1. phone normalize（沿用 `normalizePhone`）
  2. 查 `Customer findFirst({ storeId, phone })`
     - 找到、無 lineUserId → 更新 lineUserId + lineLinkStatus=LINKED
     - 找到、已綁不同 lineUserId → 回傳 `{ status: "already_bound_to_other_line" }`
     - 找不到 → 建新 Customer（authSource=LINE, storeId, lineUserId, phone, name）
  3. 呼叫 `repairCustomerIdentityOnLogin()`
  4. 呼叫 `awardLineJoinReferrerIfEligible()`（pending-ref cookie 仍適用）
- `auth.ts` signIn callback 的「找不到既有 Customer → transaction 建身份鏈」那段改為呼叫同一個 `bindLineToCustomerInStore()`，避免邏輯漂移（這部分要審慎，是現有 prod 路徑）
- vitest：覆蓋三條路徑 + repair + referral

風險：中-高；signIn callback 是 prod 熱路徑，建議「先抽 helper、不改既有呼叫，等驗收完整後再切換」。

### PR-D：LIFF 體驗預約 MVP（MVP，~2 天）

**目的**：竹北 LIFF 內可完成 FIRST_TRIAL 預約。

範圍：
- 新增 `src/app/(customer)/liff/book/page.tsx`：UI 單欄、LIFF 優化；slot 選擇沿用 `/book/new` 的 server query
- server action `createTrialBooking()`：限定 `bookingType=FIRST_TRIAL`；強制檢查 `phone` 非 placeholder；checkPermission；寫入用 `currentStoreId(user)`
- 預約成功後：用 `liff.closeWindow()` 關掉 webview；同時 `pushMessage()` 發確認訊息（若 `sendBookingConfirmation` 已存在則重用，否則本 PR 不擴）
- vitest：placeholder phone reject、slot 衝突、bookingType 鎖定 FIRST_TRIAL

風險：中-高；真實寫入 transaction，必須測過再上 prod。

### PR-E：建店流程加入 LIFF 欄位（延後，~0.5 天）

- prisma migration：`Store.liffId String?`、`Store.lineLoginChannelId String?`、`Store.lineLoginChannelSecret String?`（後者 encrypted 儲存）
- `/hq/dashboard/stores/new` 加欄位
- `src/lib/liff/client.ts` 改成從 `Store.liffId` 讀（PR-A 的 env 改為 fallback）
- **不在 MVP 第一輪做**；竹北上線穩定後、第二家店要上前 1 週合
- 上 migration 走 deploy 視窗，明確 review

### PR-F：Rich Menu 模板文件（延後，~1 天）

- 新增 `docs/line-rich-menu-template.md`：尺寸（2500×1686 / 2500×843）、區塊 deep link 模板：
  ```
  https://liff.line.me/{LIFF_ID}?path=/s/{slug}/liff/book
  https://liff.line.me/{LIFF_ID}?path=/s/{slug}/liff/my-bookings
  ```
- 給店家用 LINE OA Manager 後台手動設
- 不寫 code；MVP 之後再做

### PR-G：每店一個 LINE Login channel（延後，估時待 ADR）

- NextAuth `line` provider 改 dynamic / multi-instance；或維持「web 用全域 channel，LIFF 全走 idToken exchange」的混合策略
- 真正多店落地前必須先寫 ADR，列三條路徑（多 provider 各別 id / 動態 provider config / 全 LIFF token）並比較
- 第二、第三家店要上時才動

### MVP / 延後總表

| PR | 範圍 | 階段 | 估時 |
|---|---|---|---|
| A | LIFF shell + env | MVP | 1d |
| B | idToken exchange + Credentials provider | MVP | 1.5d |
| C | Binding flow（含 helper 抽離）| MVP | 1d |
| D | FIRST_TRIAL 預約 | MVP | 2d |
| E | `Store.liffId` migration | 第二家店上線前 | 0.5d |
| F | Rich Menu template doc | MVP+1 | 1d |
| G | per-store LINE Login channel | 多店真實複製時 | TBD |

合計 MVP ≈ **5.5 天工時**（PR-A → PR-D）。

---

## 4. 不在這次處理的事

- ❌ 不跑任何 prisma migration（PR-E 才會動）
- ❌ 不改 production env / LINE Developers Console（除竹北 LIFF ID 由人工申請）
- ❌ 不改既有 `/s/[slug]/book` web flow（避免回歸風險）
- ❌ 不重做 `/line-entry`（保留為 LINE OA 連結點開的 web fallback）
- ❌ 不引入 Rich Menu Messaging API（對 MVP 不划算）
- ❌ 不動 Customer prisma schema（schema 對 LIFF MVP 已夠用）
- ❌ 本盤點不修 `docs/identity-flow.md`（舊版設計脫節，留待之後一併重寫）

---

## 5. 主要風險與緩解

| 風險 | 嚴重度 | 緩解 |
|---|---|---|
| signIn callback 重構造成 web LINE 登入回歸 | 高 | PR-C 「先抽 helper、不改呼叫」，灰度切換；vitest 覆蓋 |
| LIFF idToken 偽造 | 高 | 一律後端 verify；驗 aud；不信任 client 傳的 userId |
| placeholder phone 流到 LIFF 預約 | 中 | PR-D 強制 `requirePhone()`；UI 不顯示「預約」直到補完 |
| 跨店 LINE userId（同人加多店 OA）| 中 | 採每店一 channel；現有 `(storeId, lineUserId)` 唯一性原樣 OK |
| NextAuth provider 只能單一 channel | 中 | MVP 接受；PR-G 之前不上第二店 |
| LIFF in-app browser 與 web cookie domain 不一致 | 中 | 全部 cookie 用 `sameSite=lax`；LIFF endpoint 與 web 同 origin |
| LIFF endpoint 上線後 LINE Console 反查 URL 與 proxy.ts 路由偏差 | 低 | proxy.ts 改動納入 PR-A；docs/liff-setup.md 寫死 URL 樣板 |
| 多店期 `Store.liffId` 沒填 | 低 | resolveStoreBySlug 後若 `liffId` 為 null → 顯示「該店尚未開通 LINE Mini App」明確錯誤頁 |

---

## 6. 驗收項（竹北店 MVP）

- [ ] `/s/zhubei/liff` 在 LINE 內可開、`liff.init()` 成功
- [ ] LIFF 內可走「LINE 授權 → 補手機 → 預約 FIRST_TRIAL → 收到 push 確認訊息」
- [ ] 同 LINE userId 第二次進 LIFF 直接 land 在「已綁定」狀態，不重複建 Customer
- [ ] 同一 phone 在另一店已有 Customer → LIFF 內不會把該 Customer「搶」到竹北；顯示「該手機已在他店」或建第二筆（依商業決策，PR-C 之前需與產品確認）
- [ ] `/s/zhubei/book` web flow 完全不受影響（regression test）
- [ ] 文件 `docs/line-mini-app-plan.md`（本文件）、`docs/liff-setup.md`（PR-A）完備

---

## 7. 產品 / 商業決策（已定案）

> 已於 2026-05-20 定案，PR-A 起的所有實作以此為準。

1. **同手機跨店命中** — **決策：採 `(storeId, phone)` 為唯一鍵；同一手機可在不同店各自建立 Customer，不跨店搬資料**。
   - 與 schema 既有 `@@unique([storeId, phone])` 一致，不需改 prisma。
   - PR-C 的 `bindLineToCustomerInStore()` 只在「同 storeId 內」查 phone，找不到就建新 Customer；他店有同手機 Customer 不影響本店。
2. **web FIRST_TRIAL 入口** — **決策：先不關，LIFF 初期只是新增入口**。
   - `/s/zhubei/book` web flow 完全保留，PR-D 不做 feature gate。
3. **PR-G 多 LINE Login channel** — **決策：延後，先讓竹北跑通**。
   - 多店共用單一 LINE Login channel 為 MVP fallback；第二家店要上線前再評估 PR-G 與 ADR。
4. **LIFF endpoint domain** — **決策：`https://www.steamfoot.com/s/zhubei/liff`**。
   - PR-A 的 `docs/liff-setup.md` 寫死此 URL 樣板；LINE Developers Console 也以此申請 LIFF。

---

## 8. 開始實作前必須先到位的事

- [x] 產品決策 7.1 / 7.2 / 7.3 / 7.4 已定案（見上方）
- [ ] 申請竹北專屬 LINE Login channel（如果還沒）→ 拿到 LIFF channel id/secret
- [ ] 在 LINE Developers Console 建立 LIFF App → endpoint URL = `https://www.steamfoot.com/s/zhubei/liff` → scope = `profile openid`
- [ ] 拿到 LIFF ID，準備寫進 `NEXT_PUBLIC_LIFF_ID_ZHUBEI` env（PR-A merge 時一起設）
- [ ] PR-A 之前不要動 prod

### PR-A 啟動指令（給 Claude Code 用）

```
請依照 docs/line-mini-app-plan.md，開始 PR-A：LIFF shell + 環境設定。

本 PR 只做：
1. 開通 /s/[storeSlug]/liff
2. 補 proxy.ts 的 /liff public prefix
3. 建立 LIFF 基礎 layout / page
4. 顯示分店名稱、載入狀態、錯誤狀態
5. 封裝基本 liff.init client helper
6. 加 docs/liff-setup.md
7. 加必要測試

限制：
- 不做登入
- 不做 Customer binding
- 不做預約
- 不做 AI
- 不做 migration
- 不碰 production
- 不改既有 /s/[slug]/book 流程
- 不改 LINE OAuth 既有登入流程

請先回報實作計畫與預計改動檔案，不要直接做大包。
```

### PR-A 驗收清單

- [ ] `/s/zhubei/liff` 可開
- [ ] 顯示竹北店資訊
- [ ] 沒有登入也不 crash
- [ ] 不影響 `/dashboard`
- [ ] 不影響 `/s/zhubei/book`
- [ ] 沒有 migration
- [ ] 沒有 production DB 操作
