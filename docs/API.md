# API / Server Actions 規劃

所有商業邏輯透過 Next.js Server Actions 實作，放在 `src/server/actions/` 下。
唯讀查詢放在 `src/server/queries/` 下。
僅 NextAuth callback 使用 API Routes (`src/app/api/auth/`)。

---

## Auth

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `signIn` | NextAuth built-in | Email/密碼登入 | Public |
| `signOut` | NextAuth built-in | 登出 | Authenticated |
| `getCurrentUser` | `queries/auth.ts` | 取得當前使用者 + role + staff/customer 資料 | Authenticated |

---

## Staff（店長管理）

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `createStaff` | `actions/staff.ts` | 建立新店長帳號 | Owner |
| `updateStaff` | `actions/staff.ts` | 編輯店長資料 | Owner |
| `deactivateStaff` | `actions/staff.ts` | 停用店長 | Owner |
| `listStaff` | `queries/staff.ts` | 列出所有店長 | Owner |
| `getStaffDetail` | `queries/staff.ts` | 店長詳情 | Owner |
| `updateSpaceFee` | `actions/staff.ts` | 設定店長月分租費 | Owner |

---

## Customer（顧客管理）

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `createCustomer` | `actions/customer.ts` | 建立新顧客（綁定直屬店長） | Owner, Manager(自動綁自己) |
| `updateCustomer` | `actions/customer.ts` | 編輯顧客資料 | Owner, Manager(自己名下) |
| `listCustomers` | `queries/customer.ts` | 列出顧客 | Owner(全部), Manager(自己名下) |
| `getCustomerDetail` | `queries/customer.ts` | 顧客詳情（含錢包、預約、交易） | Owner, Manager(自己名下), Customer(自己) |
| `transferCustomer` | `actions/customer.ts` | 轉讓顧客給其他店長 | Owner only |

### transferCustomer 邏輯
1. 更新 `customer.assignedStaffId` 為新店長
2. **不修改**任何歷史 booking/transaction 的 `revenueStaffId`
3. 建立 AuditLog 記錄轉讓前後
4. 之後新建的 booking/transaction 自動使用新的 `assignedStaffId`

---

## ServicePlan（課程方案）

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `createPlan` | `actions/plan.ts` | 新增課程方案 | Owner |
| `updatePlan` | `actions/plan.ts` | 編輯方案（價格、名稱、堂數） | Owner |
| `deactivatePlan` | `actions/plan.ts` | 停用方案（不刪除，歷史資料保留） | Owner |
| `listPlans` | `queries/plan.ts` | 列出方案 | Owner, Manager(唯讀) |

---

## Wallet（課程錢包）

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `assignPlanToCustomer` | `actions/wallet.ts` | 為顧客購課（建立錢包 + 交易紀錄） | Owner, Manager(自己名下) |
| `listCustomerWallets` | `queries/wallet.ts` | 列出顧客的錢包 | Owner, Manager(自己名下), Customer(自己) |
| `adjustRemainingSessions` | `actions/wallet.ts` | 手動調整剩餘堂數（補正用） | Owner |

### assignPlanToCustomer 邏輯
1. 建立 `CustomerPlanWallet`，快照 `purchasedPrice`
2. 計算 `expiryDate`（若方案有 `validityDays`）
3. 建立 `Transaction`（type=PACKAGE_PURCHASE 或 TRIAL_PURCHASE 或 SINGLE_PURCHASE）
4. 更新 `customer.customerStage` 為 ACTIVE
5. 設定 `customer.selfBookingEnabled = true`
6. 若首次購課，記錄 `customer.convertedAt`

---

## Booking（預約）

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `listAvailableSlots` | `queries/booking.ts` | 查詢某日可用時段（含剩餘名額） | All authenticated |
| `createBooking` | `actions/booking.ts` | 建立預約 | Owner, Manager(自己名下), Customer(自助) |
| `updateBooking` | `actions/booking.ts` | 修改預約（日期/時段/備註） | Owner, Manager(自己名下) |
| `cancelBooking` | `actions/booking.ts` | 取消預約 | Owner, Manager(自己名下), Customer(自己的) |
| `markCompleted` | `actions/booking.ts` | 標記完成（到店扣堂） | Owner, Manager(自己名下) |
| `markNoShow` | `actions/booking.ts` | 標記未到 | Owner, Manager(自己名下) |
| `listBookings` | `queries/booking.ts` | 列出預約（支援日期範圍篩選） | Owner(全部), Manager(自己名下), Customer(自己的) |
| `getBookingDetail` | `queries/booking.ts` | 預約詳情 | Owner, Manager(自己名下), Customer(自己的) |

### createBooking 邏輯
1. 檢查日期在未來 14 天內
2. 查詢該日該時段已預約數 < capacity
3. 若 Customer 自助預約：
   - 確認 `selfBookingEnabled = true`
   - 確認有 ACTIVE 錢包
   - 確認「未來有效預約數 ≤ 剩餘堂數」
4. 快照 `revenueStaffId = customer.assignedStaffId`
5. 記錄 `bookedByType` 和 `bookedByStaffId`
6. **不在此時扣堂**（完成後才扣）

### markCompleted 邏輯
1. 更新 `bookingStatus = COMPLETED`
2. 若為 PACKAGE_SESSION 且有 `customerPlanWalletId`：
   - `wallet.remainingSessions -= 1`
   - 若 `remainingSessions = 0` → `wallet.status = USED_UP`
   - 建立 Transaction（type=SESSION_DEDUCTION, amount=0, quantity=1）
3. 若為 FIRST_TRIAL 或 SINGLE：
   - 不扣錢包堂數（已在購買時處理）
4. 記錄 `serviceStaffId`（值班店長）

---

## Transaction（交易）

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `createTransaction` | `actions/transaction.ts` | 手動新增交易 | Owner, Manager(自己名下) |
| `listTransactions` | `queries/transaction.ts` | 列出交易 | Owner(全部), Manager(自己名下), Customer(自己的) |
| `getMonthlyRevenueSummary` | `queries/report.ts` | 月營收摘要 | Owner(全部), Manager(自己的) |

### createTransaction 邏輯
- 快照 `revenueStaffId = customer.assignedStaffId`
- 驗證 `transactionType` 合理性

---

## Cashbook（現金帳）— Phase 2

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `createCashbookEntry` | `actions/cashbook.ts` | 新增收支記錄 | Owner |
| `listDailyCashbook` | `queries/cashbook.ts` | 某日收支明細 | Owner |
| `getDailySummary` | `queries/cashbook.ts` | 日結摘要 | Owner |
| `getMonthlySummary` | `queries/cashbook.ts` | 月結摘要 | Owner |

---

## Report（報表）

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `getMonthlyStoreRevenue` | `queries/report.ts` | 全店月營收 | Owner |
| `getMonthlyStaffRevenue` | `queries/report.ts` | 各店長月營收 | Owner(全部), Manager(自己) |
| `getMonthlyStaffNet` | `queries/report.ts` | 店長淨收入（營收 - 分租費） | Owner |
| `getCustomerConsumption` | `queries/report.ts` | 顧客消費明細 | Owner, Manager(自己名下), Customer(自己) |

### getMonthlyStaffRevenue 邏輯
- `SUM(transaction.amount) WHERE revenueStaffId = X AND month = Y`
- 注意：用 `revenueStaffId`，不是 `serviceStaffId`
- 歷史資料不受顧客轉讓影響

---

## SpaceFee（空間分租費）— Phase 2

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `generateMonthlySpaceFees` | `actions/space-fee.ts` | 產生當月分租費記錄 | Owner (cron/手動) |
| `markSpaceFeePaid` | `actions/space-fee.ts` | 標記已繳 | Owner |
| `listSpaceFees` | `queries/space-fee.ts` | 列出分租費記錄 | Owner(全部), Manager(自己的) |

---

## Reminder（提醒）— Phase 2

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `generateReminderJobs` | `actions/reminder.ts` | 產生明日預約提醒 | System (cron) |
| `markReminderSent` | `actions/reminder.ts` | 標記已發送 | System |

---

## Settings（系統設定）

| Action | 檔案 | 說明 | 權限 |
|--------|------|------|------|
| `listBookingSlots` | `queries/settings.ts` | 列出所有時段設定 | Owner |
| `updateBookingSlot` | `actions/settings.ts` | 修改時段（啟用/停用/容量） | Owner |
| `createBookingSlot` | `actions/settings.ts` | 新增時段 | Owner |
