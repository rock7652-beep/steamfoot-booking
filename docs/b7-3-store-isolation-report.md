# B7-3 驗收報告：跨店資料完全隔離驗證

> 日期：2026-04-15
> 狀態：驗證完成

---

## 一、Migration 結果

### 執行的 Migration

`prisma/migrations/20260415_store_scoped_unique/migration.sql`

| 動作 | 說明 |
|------|------|
| 移除 `Customer_email_key` | 全域 email unique → 刪除 |
| 移除 `Customer_googleId_key` | 全域 googleId unique → 刪除 |
| 移除 `Customer_lineUserId_key` | 全域 lineUserId unique → 刪除 |
| 移除 `Customer_lineBindingCode_key` | 全域 lineBindingCode unique → 刪除 |
| 新增 `uq_store_customer_phone` | `(storeId, phone)` compound unique |
| 新增 `uq_store_customer_email` | `(storeId, email)` partial unique (WHERE NOT NULL) |
| 新增 `uq_store_customer_google` | `(storeId, googleId)` partial unique |
| 新增 `uq_store_customer_line` | `(storeId, lineUserId)` partial unique |
| 新增 `uq_store_customer_binding_code` | `(storeId, lineBindingCode)` partial unique |

Migration 包含自動去重（保留最新、舊記錄加 `-dup-` 後綴），部署成功。

### 同步修改的程式碼

| 檔案 | 修改 |
|------|------|
| `src/server/actions/reminder.ts:314` | `findUnique({ lineBindingCode })` → `findFirst` |
| `src/app/api/line/webhook/route.ts:206` | `findUnique({ lineBindingCode })` → `findFirst` |

---

## 二、第二家店建立結果

### Seed 腳本

`prisma/seed-store2.ts` — 執行 `npx tsx prisma/seed-store2.ts`

| 項目 | 內容 |
|------|------|
| Store ID | `taichung-store` |
| Store Name | 蒸足 台中測試店 |
| OWNER | David 台中店長 (0955000001 / 1234) |
| STAFF | Eve 台中員工 (0955000002 / 1234) |
| Customers | 5 位（含 2 位與竹北店重複 phone/email） |
| Bookings | 3 筆 |
| Transactions | 2 筆 |

跨店重複 phone/email 的顧客建立成功，證明 compound unique 正常。

---

## 三、自動化測試結果

### 執行指令

```
npx tsx scripts/test-store-isolation.ts
```

### 測試結果

```
╔══════════════════════════════════════════╗
║  B7-3 跨店資料隔離測試                   ║
╚══════════════════════════════════════════╝

Store A: 暖暖蒸足 (default-store)
Store B: 蒸足 台中測試店 (taichung-store)

  ✅ PASS: 同店 phone 唯一（DB constraint 拒絕）
  ✅ PASS: 跨店 phone 可重複
  ✅ PASS: 同店 email 唯一（DB constraint 拒絕）
  ✅ PASS: 跨店 email 可重複
  ✅ PASS: Customer 列表隔離 (A=113, B=7)
  ✅ PASS: Booking 列表隔離 (A=118, B=3)
  ✅ PASS: assertStoreAccess — 跨店存取應拒絕
  ✅ PASS: Reminder booking 查詢帶 storeId 隔離

  結果: 8 PASS / 0 FAIL / 8 total
```

---

## 四、手動驗證清單

| 項目 | 結果 | 說明 |
|------|------|------|
| DB constraint: 同店同 phone | PASS | Prisma unique constraint error |
| DB constraint: 跨店同 phone | PASS | 建立成功 |
| DB constraint: 同店同 email | PASS | Prisma unique constraint error |
| DB constraint: 跨店同 email | PASS | 建立成功 |
| Customer 列表隔離 | PASS | storeId filter 正確隔離 |
| Booking 列表隔離 | PASS | storeId filter 正確隔離 |
| assertStoreAccess 跨店拒絕 | PASS | OWNER 無法存取他店資料 |
| Reminder engine storeId | PASS | booking 查詢帶 storeId |
| Build 無錯誤 | PASS | TypeScript + Next.js build 通過 |

---

## 五、DEFAULT_STORE_ID 限制明細

### 目前所有使用位置

| 檔案 | 用途 | 嚴重度 | 多店影響 |
|------|------|--------|---------|
| `src/server/actions/customer-auth.ts` | 前台顧客註冊，新 Customer 固定綁 `default-store` | **HIGH** | 多店時，前台註冊的顧客全部歸入 default-store |
| `src/server/actions/account.ts` | 帳號啟用流程，phone/email 查詢限 `DEFAULT_STORE_ID` | **HIGH** | 他店顧客無法透過前台自助啟用帳號 |
| `src/lib/shop-config.ts` | getShopPlan / getShopConfig fallback | MEDIUM | 有 session 時不影響，cron 場景可能取到 default 設定 |
| `src/lib/auth.ts` | staff 建立時 fallback storeId | LOW | 僅 seed/admin 手動場景 |
| `src/server/queries/report-compute.ts` | 報表查詢 fallback | LOW | 有 session 時不影響 |
| `src/app/(dashboard)/dashboard/system-status/page.tsx` | 系統健康頁 | LOW | 僅顯示 default-store 狀態 |

### 結論

**DEFAULT_STORE_ID 是目前多店最大的限制**。前台顧客（customer-auth / account）的所有流程固定使用 `default-store`，無法動態判斷顧客屬於哪家店。

**需要修改才能真正支援多店的項目**：
1. 前台登入/註冊需依 domain 或 slug 判斷 storeId（例如 `taichung.steamfoot.com` → `taichung-store`）
2. 帳號啟用 email 需攜帶 storeId context
3. LINE webhook 綁定需知道是哪家店的顧客

---

## 六、結論判定

### 後台（Dashboard）— 可進入多店開發

| 面向 | 狀態 |
|------|------|
| 資料隔離（DB 層） | ✅ compound unique + storeId FK |
| 查詢隔離（應用層） | ✅ getStoreFilter + assertStoreAccess |
| 寫入隔離 | ✅ currentStoreId 強制注入 |
| 提醒引擎隔離 | ✅ per-store rule + booking 查詢帶 storeId |
| Phone/Email 唯一性 | ✅ per-store compound unique |

### 前台（Customer App）— 僅適合單店正式上線

| 面向 | 狀態 |
|------|------|
| 註冊 | ❌ 固定 DEFAULT_STORE_ID |
| 帳號啟用 | ❌ 固定 DEFAULT_STORE_ID |
| LINE 綁定 | ⚠️ 綁定碼全域查詢（可運作但無 store context） |

### 最終判定

> **後台可進入多店開發；前台目前僅適合單店正式上線。**
>
> 若要前台也支援多店，需完成：
> 1. Store resolver（依 domain/slug 判斷 storeId）
> 2. 前台 session 注入 storeId
> 3. LINE webhook store context
>
> 預估工作量：1-2 輪迭代。
