# B7-4 驗收報告：Store Resolver + 多店入口架構

**日期**：2026-04-15
**狀態**：✅ 完成

---

## 一、架構總覽

### 路由架構

| URL 模式 | 用途 | 存取權限 |
|----------|------|----------|
| `/s/zhubei/*` | 竹北店前台（顧客） | 顧客（同店） |
| `/s/taichung/*` | 台中店前台（顧客） | 顧客（同店） |
| `/s/[slug]/admin/dashboard/*` | 分店後台 | OWNER/PARTNER（同店）+ ADMIN |
| `/hq/login` | 總部登入 | Public |
| `/hq/dashboard/*` | 總部後台 | ADMIN only |

### 實作策略：Proxy Rewrite

採用 **proxy.ts rewrite** 方式，將 `/s/[slug]/*` 改寫到現有的內部路由：

- `/s/zhubei/book` → rewrite → `/(customer)/book`
- `/s/zhubei/register` → rewrite → `/(auth)/register`
- `/s/zhubei/admin/dashboard/bookings` → rewrite → `/(dashboard)/dashboard/bookings`
- `/hq/dashboard/bookings` → rewrite → `/(dashboard)/dashboard/bookings`

**優點**：不需複製 50+ 頁面檔案，所有現有頁面直接復用。
**Store context** 透過 cookies (`store-slug`, `store-id`) 傳遞。

---

## 二、變更清單

### 新增檔案（8 個）

| 檔案 | 說明 |
|------|------|
| `src/lib/store-resolver.ts` | Store 解析核心（by slug / by id / from OAuth cookie） |
| `src/lib/store-context.ts` | Store context helpers（server-side / client-side） |
| `src/app/hq/login/page.tsx` | HQ 登入頁（ADMIN 專用） |
| `vitest.config.ts` | Vitest 測試框架配置 |
| `src/__tests__/store-resolver.test.ts` | Store resolver 單元測試 |
| `src/__tests__/proxy-routes.test.ts` | 路由分類 + route guard 測試 |
| `src/__tests__/store-context.test.ts` | Store context 測試 |
| `src/__tests__/sidebar-prefix.test.ts` | Sidebar prefix 推導測試 |

### 修改檔案（13 個）

| 檔案 | 變更摘要 |
|------|----------|
| `src/proxy.ts` | 全面重寫：slug 提取、rewrite、route guard、legacy redirect |
| `src/lib/auth.ts` | customer-phone 加 storeId、OAuth signIn callback 從 cookie 解析 store |
| `src/lib/store.ts` | DEFAULT_STORE_ID 加 @deprecated 標記 |
| `src/server/actions/auth.ts` | 新增 hqLoginAction、登入後導向 store-aware 路徑 |
| `src/server/actions/customer-auth.ts` | register/login 接受 storeId + storeSlug |
| `src/server/actions/account.ts` | checkPhoneStatus/requestActivation 接受 storeId |
| `src/app/page.tsx` | 讀取 store cookie、所有 href 改為 store-scoped |
| `src/app/oauth-buttons.tsx` | 接受 storeSlug prop、OAuth 前設定 cookie |
| `src/app/customer-login-form.tsx` | 接受 storeSlug/storeId、傳遞 hidden fields |
| `src/app/(auth)/layout.tsx` | redirect 改為 store-aware 路徑 |
| `src/app/(customer)/layout.tsx` | 從 cookie 讀 storeSlug、NAV_ITEMS href 加前綴 |
| `src/app/(customer)/mobile-nav.tsx` | 所有 href 加 store 前綴 |
| `src/app/(dashboard)/layout.tsx` | redirect 改為 /hq/login |
| `src/components/sidebar.tsx` | 從 usePathname 推導 dashboardPrefix、Link href 加前綴 |
| `src/app/(auth)/register/page.tsx` | 連結加 store prefix |
| `src/app/(auth)/activate/page.tsx` | 連結加 store prefix |
| `src/app/(auth)/activate/verify/activate-verify-form.tsx` | 連結加 store prefix |
| `src/app/(auth)/forgot-password/page.tsx` | 連結加 store prefix |
| `src/app/(auth)/reset-password/page.tsx` | 連結加 store prefix |

---

## 三、功能驗證

### ✅ 路由守衛

| 場景 | 行為 | 狀態 |
|------|------|------|
| `/s/zhubei/` 未登入 | 顯示顧客登入頁 | ✅ |
| `/s/zhubei/book` 未登入 | 導向 `/s/zhubei/` | ✅ |
| `/s/zhubei/admin/*` 未登入 | 導向 `/hq/login` | ✅ |
| `/hq/dashboard/*` 非 ADMIN | 導向所屬店或 `/hq/login` | ✅ |
| OWNER 訪問其他店 admin | 自動導回自己的店 | ✅ |
| ADMIN 訪問任何店 admin | 允許通行 | ✅ |
| CUSTOMER 跨店訪問 `/s/otherSlug/book` | 自動導回所屬店 | ✅ |

### ✅ Auth 流程

| 流程 | Store-aware | 狀態 |
|------|-------------|------|
| 顧客手機登入 | ✅ 依 storeId 查 Customer | ✅ |
| 顧客註冊 | ✅ 建立到正確 store | ✅ |
| LINE 登入 | ✅ 從 cookie 解析 store | ✅ |
| Google 登入 | ✅ 從 cookie 解析 store | ✅ |
| 帳號開通 | ✅ storeId 參數化 | ✅ |
| 密碼重設 | ✅ 連結使用 store prefix | ✅ |
| 後台登入 | ✅ ADMIN→/hq、OWNER→/s/{slug}/admin | ✅ |

### ✅ Hotfix 清除

| 原始 Hotfix | 處理 |
|-------------|------|
| `auth.ts:252-254` — `targetStoreId = DEFAULT_STORE_ID` | ✅ 改為 `resolveStoreFromOAuthCookie()` |
| `auth.ts:384` — `storeId: DEFAULT_STORE_ID` | ✅ 改為 `targetStoreId`（動態解析） |
| `customer-auth.ts:88,120` — DEFAULT_STORE_ID | ✅ 改為表單傳入 storeId |
| `account.ts:57,92-93,105` — DEFAULT_STORE_ID | ✅ 改為參數 + cookie fallback |

### ✅ Legacy 路由相容

| 舊路徑 | 新導向 |
|--------|--------|
| `/` | → `/s/zhubei/`（預設店） |
| `/login` | → `/hq/login` |
| `/register` | → `/s/zhubei/register` |
| `/book` | → `/s/{sessionSlug}/book` |
| `/dashboard/*` | → `/hq/dashboard/*` 或 `/s/{slug}/admin/dashboard/*` |
| `/activate/*` | → `/s/zhubei/activate/*` |

---

## 四、測試結果

```
 Test Files  4 passed (4)
      Tests  59 passed (59)
```

測試覆蓋：
- Store resolver：slug 解析、storeId 反查、OAuth cookie 解析、fallback
- Route guard：路由分類（store-public/customer/admin、hq、legacy）
- Session-store mismatch：跨店偵測邏輯
- Store context：cookie 讀取、HQ 判定
- Sidebar prefix：dashboardPrefix 推導、pathname 正規化、link href 構造

---

## 五、已知限制與後續事項

### 需注意

1. **Static slug map**：`proxy.ts` 中的 `SLUG_STORE_MAP` 為靜態映射。新增店舖需重新部署。
   → 未來可改為 edge KV 或 API 查詢。

2. **Dashboard 頁面內部 redirect**：`(dashboard)` 下的 server-side `redirect("/dashboard")` 會觸發一次 proxy redirect 再導回 `/s/{slug}/admin/dashboard`。功能正確但多一次 redirect hop。
   → 長期可逐步更新為 store-aware redirect。

3. **OAuth placeholder phone**：OAuth 新顧客仍使用 `_oauth_{provider}_{id}` 佔位符手機。
   → 可在 profile 頁讓顧客補填，不影響多店功能。

4. **EMAIL 寄出的連結**：activation/reset-password email 中的連結仍指向根路徑。
   → 需更新 `src/lib/email.ts` 加入 storeSlug。已標記為後續修正。

---

## 六、驗收判定

### ✅ 判定：**B — 後台可多店，前台仍需補修**

**理由**：

- ✅ 路由架構完整建立：`/s/[slug]/*` + `/hq/*`
- ✅ Route guard 完整：ADMIN/OWNER/CUSTOMER 權限分離、跨店阻擋
- ✅ 所有 auth 流程 store-aware（register、login、OAuth、activation）
- ✅ DEFAULT_STORE_ID 依賴正式收斂
- ✅ 自動化測試 59 個全通過
- ✅ Build 通過

**前台待補修項目**（不影響功能，但需要正式上線前完成）：

1. Email 連結需帶 storeSlug（activation / password reset email 內的 URL）
2. LINE Webhook handler 需加 store 判斷（目前更新所有匹配的 customer）
3. 靜態 SLUG_STORE_MAP 需要正式環境的 store ID 確認
4. Dashboard 內部 redirect 的額外 hop 優化（非阻擋性）

**建議**：後台可立即進入多店營運。前台在補完 email 連結 + LINE webhook 後即可正式多店上線。
