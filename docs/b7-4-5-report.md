# B7-4.5 驗收報告：前台多店入口補強

**日期**：2026-04-15
**前置**：B7-4（Store Resolver + 多店入口架構）

---

## 一、變更摘要

只做三件事，沒有擴大範圍。

### 1. Email 連結帶 storeSlug ✅

| 檔案 | 變更 |
|------|------|
| `src/lib/email.ts` | `sendActivationEmail` / `sendPasswordResetEmail` 新增 `storeSlug?` 參數，連結格式 `/s/[slug]/activate/verify?token=...` |
| `src/server/actions/account.ts` | `requestActivation` 呼叫時從 `effectiveStoreId` 反查 `getStoreSlugById(storeId)`，傳入 email function |
| `src/server/actions/account.ts` | `requestPasswordReset` 從 `customer.storeId` 反查 slug，傳入 email function |

**slug 來源**：皆由 storeId 經 `getStoreSlugById()` 從 DB 反查，不手寫 slug、不依賴前端傳值。

### 2. LINE webhook 加 store 判斷 ✅

| 檔案 | 變更 |
|------|------|
| `prisma/schema.prisma` | Store model 新增 `lineDestination String? @unique` |
| `prisma/migrations/20260415_store_line_destination/` | 增量 migration |
| `src/app/api/line/webhook/route.ts` | 全面改寫：新增 `resolveStoreFromDestination()`，所有 handler 加 `storeId` 參數 |

**解析策略**：
- 讀 webhook payload `data.destination`（LINE bot userId，每個 Official Account 唯一）
- 查 DB `Store.lineDestination` 比對
- 找不到 → `console.warn` + 安全中止（return 200），**不 fallback 到 DEFAULT_STORE_ID**

**store-scoped 事件處理**：
- `handleFollow` — 只恢復同店 blocked customer
- `handleUnfollow` — 只更新同店 customer
- `handleBindingRequest` — 只查同店綁定碼 + 同店 LINE 綁定檢查

### 3. 移除正式流程對 SLUG_STORE_MAP 的依賴 ✅

| 檔案 | 變更 |
|------|------|
| `src/lib/auth.ts` | Session / JWT 新增 `storeSlug` 欄位；credentials authorize 查詢 `store.slug`；JWT callback 持久化 `storeSlug` |
| `src/proxy.ts` | 移除 `SLUG_STORE_MAP` / `STORE_ID_SLUG_MAP`；改用 `session.user.storeSlug` 做 redirect；slug 不做靜態驗證，交 page-level DB resolver |
| `src/lib/store-context.ts` | `getStoreContext()` 從 slug cookie 經 DB 解析 storeId，不再讀 `store-id` cookie |
| `src/app/page.tsx` | 從 slug cookie 經 DB 解析 storeId |
| `src/server/actions/customer-auth.ts` | `getStoreIdFromCookie()` 改為從 slug 經 DB 解析 |
| `src/server/actions/account.ts` | 同上 |

**production 不再依賴靜態 map**：
- proxy 接受任何 slug 格式，不驗證是否存在（交 page-level resolver 處理）
- redirect 用 JWT 中的 `session.user.storeSlug`
- 新增店舖只需 DB insert + 設 `lineDestination`，無需改 code 或重新部署

---

## 二、Migration

新增一個增量 migration：

```sql
-- 20260415_store_line_destination
ALTER TABLE "Store" ADD COLUMN "lineDestination" TEXT;
CREATE UNIQUE INDEX "Store_lineDestination_key" ON "Store"("lineDestination");
```

**部署步驟**：
1. `npx prisma migrate deploy`
2. 在 DB 中為每家店填入 `lineDestination`（LINE Official Account bot userId）
3. 部署新程式碼

---

## 三、測試結果

```
Test Files  5 passed (5)
     Tests  72 passed (72)
```

B7-4.5 新增 13 個測試覆蓋：
- ✅ activation email link 包含 `/s/[slug]/`
- ✅ password reset email link 包含 `/s/[slug]/`
- ✅ 無 slug 時 email link fallback 到根路徑
- ✅ `resolveStoreBySlug` 從 DB 查詢（非靜態 map）
- ✅ 新 DB store 不需靜態 map 變更
- ✅ unknown slug 從 DB 回傳 null
- ✅ LINE webhook zhubei destination 正確解析
- ✅ LINE webhook taichung destination 正確解析
- ✅ unknown destination 安全中止（return null）
- ✅ missing destination 安全中止
- ✅ proxy 用 session.storeSlug 做 redirect
- ✅ 非預設店 storeSlug 正確使用
- ✅ missing storeSlug fallback 到 DEFAULT_STORE_SLUG

---

## 四、Build 狀態

```
✓ Compiled successfully
✓ TypeScript check passed
✓ All pages generated
```

---

## 五、驗收判定

### ✅ 判定：**A — 前台已可正式多店營運**

**理由**：

B7-4 三項前台風險全部消除：

| 風險 | B7-4 狀態 | B7-4.5 修復 |
|------|-----------|-------------|
| Email 連結不帶店 | ❌ 指向根路徑 | ✅ `/s/[slug]/activate/verify` |
| LINE webhook 無店判斷 | ❌ 全域 updateMany | ✅ destination-based resolver + store-scoped |
| 靜態 SLUG_STORE_MAP | ❌ 新增店需改 code | ✅ DB-based，新增店只需 DB insert |

**上線 checklist**：
1. ☐ 執行 migration `20260415_store_line_destination`
2. ☐ 為竹北店填入 `lineDestination`（從 LINE Developers Console 取得 bot userId）
3. ☐ 為台中店填入 `lineDestination`（若有獨立 LINE OA）
4. ☐ 確認 JWT 已含 `storeSlug`（現有用戶重新登入即可）
5. ☐ 驗證 `/s/zhubei/` 和 `/s/taichung/` 可正常存取
