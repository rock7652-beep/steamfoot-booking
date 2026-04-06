# Manager 可視範圍權限矩陣

> 最後更新：2026-04-06
> 環境變數：`MANAGER_VISIBILITY_MODE` = `SELF_ONLY`（預設）| `STORE_SHARED`

---

## 模式定義

| 模式 | 說明 | 讀取範圍 | 寫入範圍 |
|------|------|---------|---------|
| `SELF_ONLY` | 預設，向後相容 | 只看自己名下 | 只能操作自己名下 |
| `STORE_SHARED` | 全店可見 | 看到所有人的資料 | **仍然只能操作自己名下** |

---

## 完整權限矩陣

### 讀取型操作（受 MANAGER_VISIBILITY_MODE 控制）

| 功能 | Owner | Manager SELF_ONLY | Manager STORE_SHARED | 篩選欄位 |
|------|-------|------------------|---------------------|---------|
| Dashboard 今日預約 | 全店 | 自己名下顧客 | 全店 | `customer.assignedStaffId` |
| Dashboard 今日人數 | 全店 | 自己名下顧客 | 全店 | `customer.assignedStaffId` |
| Dashboard 名下顧客數 | 全店 | 自己名下 | 全店 | `assignedStaffId` |
| Dashboard 今日/本月營收 | 全店 | 不顯示 | 不顯示 | Owner 限定 |
| 預約列表 | 全店 | 自己名下顧客 | 全店 | `customer.assignedStaffId` |
| 預約詳情 | 全店 | 自己名下顧客 | 全店（唯讀） | `customer.assignedStaffId` |
| 交易列表 | 全店 | 自己的 revenueStaffId | 全店 | `revenueStaffId` |
| 交易詳情 | 全店 | 自己的 revenueStaffId | 全店 | `revenueStaffId` |
| 顧客交易摘要 | 全店 | 自己名下顧客 | 全店 | `assignedStaffId` |
| 現金帳列表 | 全店 | 自己的 staffId | 全店 | `staffId` |
| 現金帳日摘要 | 全店 | 自己的 staffId | 全店 | `staffId` |
| 現金帳月摘要 | 全店 | 自己的 staffId | 全店 | `staffId` |
| 報表-店長營收摘要 | 全店 | 只有自己 | 全店 | `revenueStaffId` |
| 報表-店長淨收摘要 | 全店 | 只有自己 | 全店 | `revenueStaffId` + `staffId` |
| 報表-全店月報 | 全店 | 只有自己 | 全店 | `revenueStaffId` + `staffId` + `assignedStaffId` |
| 報表-收入類型分析 | 全店 | 只有自己 | 全店 | `revenueStaffId` |
| 報表-顧客消費詳情 | 全店 | 自己名下顧客 | 全店 | `assignedStaffId` |
| CSV-店長月報 | 全店 | 只有自己 | 全店 | `revenueStaffId` + `staffId` |
| CSV-全店月報 | 全店 | 只有自己 | 全店 | `revenueStaffId` + `staffId` |
| 顧客列表 | 全店 | 全店（共享設計） | 全店 | 不篩選 |

### 寫入型操作（始終 SELF_ONLY，不受 MANAGER_VISIBILITY_MODE 影響）

| 功能 | Owner | Manager（任何模式） | 檢查欄位 |
|------|-------|-------------------|---------|
| 建立預約 | 任意顧客 | 任意顧客（revenueStaffId = 顧客歸屬） | — |
| 修改預約 | 任意 | 只能改自己名下顧客的 | `customer.assignedStaffId` |
| 取消預約 | 任意 | 只能取消自己名下顧客的 | `customer.assignedStaffId` |
| 報到/完成/未到 | 任意 | 只能操作自己名下顧客的 | `customer.assignedStaffId` |
| 建立現金帳 | 可指定 staffId | 強制 staffId = 自己 | `staffId` |
| 修改現金帳 | 任意 | 只能改自己的 | `staffId` |
| 修改顧客 | 任意 | 只能改自己名下的 | `assignedStaffId` |
| 轉移顧客歸屬 | 任意 | 需 `customer.assign` 權限 | 權限檢查 |

---

## 已改用 helper 的檔案清單

### 核心 helper

- `src/lib/manager-visibility.ts` — `getManagerReadFilter()`, `getManagerCustomerFilter()`, `getManagerCustomerWhere()`, `getVisibilityMode()`

### 查詢層（讀取型 — 受 visibility mode 控制）

| 檔案 | 改動位置 | 使用的 helper |
|------|---------|--------------|
| `src/app/(dashboard)/dashboard/page.tsx` | staffCustomerFilter, staffCustomerWhere | `getManagerCustomerFilter`, `getManagerCustomerWhere` |
| `src/app/(dashboard)/dashboard/bookings/[id]/page.tsx` | Manager isolation redirect | `getVisibilityMode` |
| `src/server/queries/booking.ts` | listBookings, getBookingDetail | `getManagerCustomerFilter`, `getVisibilityMode` |
| `src/server/queries/transaction.ts` | listTransactions, getTransactionDetail, getCustomerTransactionSummary | `getManagerReadFilter`, `getVisibilityMode` |
| `src/server/queries/cashbook.ts` | listCashbookEntries, getDailySummary, getMonthlySummary | `getManagerReadFilter` |
| `src/server/queries/report.ts` | 全部 5 個函式 | `getManagerReadFilter`, `getVisibilityMode` |
| `src/app/api/export/staff-monthly/route.ts` | 全部查詢 | `getManagerReadFilter` |
| `src/app/api/export/store-monthly/route.ts` | 全部查詢 | `getManagerReadFilter` |

### Action 層（寫入型 — 刻意保持 SELF_ONLY）

以下檔案**未改動**，Manager 寫入操作始終檢查 `assignedStaffId === user.staffId`：

| 檔案 | 保護的操作 |
|------|----------|
| `src/server/actions/booking.ts` | updateBooking, cancelBooking, checkInBooking, markCompleted, markNoShow |
| `src/server/actions/cashbook.ts` | createCashbookEntry（強制 staffId=自己）, updateCashbookEntry |
| `src/server/actions/customer.ts` | updateCustomer |

---

## 驗收案例

### 前置條件

- 有 2 位 Manager：A（staffId=a）和 B（staffId=b）
- A 名下有顧客 X、B 名下有顧客 Y
- 各有預約、交易、現金帳紀錄

### Case 1：SELF_ONLY 模式（預設）

驗證 Manager A 登入後：

| 步驟 | 預期結果 |
|------|---------|
| Dashboard 首頁 | 今日預約/人數 = 只有顧客 X 的預約 |
| 預約管理列表 | 只看到顧客 X 的預約 |
| 點顧客 Y 的預約 URL | 被 redirect 到 `/dashboard/bookings` |
| 交易紀錄列表 | 只看到 revenueStaffId=a 的交易 |
| 現金帳列表 | 只看到 staffId=a 的紀錄 |
| 現金帳月摘要 | 收入/支出 = 只有 A 自己的 |
| 報表頁 | 只看到自己的營收明細 |
| CSV-店長月報 | 只有自己的資料 |
| CSV-全店月報 | 只有自己的資料 |
| 顧客消費詳情（顧客 Y） | FORBIDDEN 403 |

### Case 2：STORE_SHARED 模式

設定 `MANAGER_VISIBILITY_MODE=STORE_SHARED` 後，Manager A 登入：

| 步驟 | 預期結果 |
|------|---------|
| Dashboard 首頁 | 今日預約/人數 = 全店所有預約 |
| 預約管理列表 | 看到所有人的預約（X + Y + ...） |
| 點顧客 Y 的預約 URL | 正常顯示（可讀取） |
| 對顧客 Y 的預約按「完成」 | **FORBIDDEN**（寫入仍限自己名下） |
| 對顧客 X 的預約按「完成」 | 正常完成 |
| 交易紀錄列表 | 看到所有店長的交易 |
| 現金帳列表 | 看到所有店長的現金帳 |
| 新增現金帳 | staffId 強制 = 自己 |
| 修改 B 的現金帳紀錄 | **FORBIDDEN** |
| 報表頁 | 看到全店所有店長的明細 |
| CSV-全店月報 | 包含所有店長資料 |
| 顧客消費詳情（顧客 Y） | 正常顯示（可讀取） |

### Case 3：數字一致性驗證

在 STORE_SHARED 模式下，Manager A 看到的數字應 = Owner 看到的：

| 比對項目 | Manager A (STORE_SHARED) | Owner | 應一致 |
|---------|------------------------|-------|--------|
| 報表課程總收入 | $X | $X | Y |
| CSV 全店月報合計列 | $X | $X | Y |
| 交易列表逐頁加總 | $X | $X | Y |
| 現金帳月摘要 | $Y | $Y | Y |
| 完成堂數 | N | N | Y |

> 注意：Dashboard 首頁的「今日營收」和「本月營收」仍為 Owner 限定顯示，Manager 在任何模式下都不會看到營收 KPI 卡片。

### Case 4：模式切換驗證

1. 以 SELF_ONLY 執行一次對帳 → 記錄結果
2. 切換為 STORE_SHARED → 重啟
3. 再執行一次對帳 → 結果應相同（對帳引擎不受 visibility 影響，始終用全店資料）
4. Manager A 的報表數字在切換前後會變化（SELF_ONLY=個人，STORE_SHARED=全店）
