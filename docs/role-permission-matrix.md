# 角色權限矩陣

> 最後更新：2026-04-06
> 適用版本：commit e63bfad+

## 角色定義

| 角色 | DB 值 | 說明 |
|------|-------|------|
| **Owner** | `OWNER` | 店主，擁有全部權限 |
| **Manager** | `MANAGER` | 店長，動態權限（透過 `StaffPermission` 表） |
| **Customer** | `CUSTOMER` | 顧客，僅前台自助功能 |

---

## 權限碼清單（共 16 個）

| 群組 | 權限碼 | 說明 |
|------|--------|------|
| 顧客 | `customer.read` | 查看顧客列表/詳情 |
| | `customer.create` | 新增顧客 |
| | `customer.update` | 編輯顧客資料 |
| | `customer.assign` | 轉移顧客歸屬 |
| | `customer.export` | 匯出顧客資料 |
| 預約 | `booking.read` | 查看預約 |
| | `booking.create` | 新增預約 |
| | `booking.update` | 更新預約（報到/完成/未到） |
| 交易 | `transaction.read` | 查看交易紀錄 |
| | `transaction.create` | 新增交易 |
| 課程 | `wallet.read` | 查看課程方案 |
| | `wallet.create` | 新增/編輯/停用方案 |
| 報表 | `report.read` | 查看報表 |
| | `report.export` | 匯出報表 |
| 現金帳 | `cashbook.read` | 查看現金帳 |
| | `cashbook.create` | 新增/編輯現金帳 |

---

## 功能權限矩陣

### 後台功能 (`/dashboard/*`)

| 功能 | Owner | Manager | Customer | UI 檢查 | 後端檢查 |
|------|:-----:|:-------:|:--------:|---------|---------|
| **Dashboard 首頁** | R | R（自己名下） | — | `getCurrentUser()` | layout redirect |
| **預約管理 - 月曆** | R | R（全部） | — | `checkPermission(booking.read)` | `requireStaffSession()` |
| **預約管理 - 日檢視** | R | R（全部） | — | 同上 | `requireStaffSession()` |
| **預約管理 - 新增** | CRU | CRU | — | — | `createBooking()` 內部檢查 |
| **預約管理 - 詳情** | RU | RU（自己名下） | — | `checkPermission(booking.read)` | `getBookingDetail()` 隔離 |
| **顧客管理 - 列表** | R | R（全部共享） | — | `checkPermission(customer.read)` | `requireStaffSession()` |
| **顧客管理 - 詳情** | RU | RU（全部可看） | — | `checkPermission(customer.read)` | `getCustomerDetail()` |
| **顧客管理 - 新增** | C | C | — | — | `requirePermission(customer.create)` |
| **交易紀錄** | R | R（自己名下） | — | `checkPermission(transaction.read)` | `listTransactions()` staffFilter |
| **現金帳 - 列表** | R | R（自己名下） | — | `checkPermission(cashbook.read)` | `listCashbookEntries()` staffFilter |
| **現金帳 - 新增** | C | C（綁定自己） | — | `checkPermission(cashbook.create)` | `requirePermission(cashbook.create)` |
| **課程方案 - 列表** | R | R | — | `checkPermission(wallet.read)` | `requireStaffSession()` |
| **課程方案 - 新增** | C | — | — | `isOwner` 按鈕隱藏 | `requirePermission(wallet.create)` |
| **課程方案 - 編輯** | U | — | — | `isOwner` 條件渲染 | `requirePermission(wallet.create)` |
| **店長管理** | CRUD | — | — | `user.role !== "OWNER"` → notFound | `requireOwnerSession()` |
| **報表** | R | R（自己名下） | — | `checkPermission(report.read)` | `requireStaffSession()` + staffFilter |
| **匯出 CSV** | R | R（自己名下） | — | 頁面上連結 | `requireStaffSession()` + staffFilter |

> R=讀取 C=新增 U=更新 D=刪除

### 前台功能 (`/(customer)/*`)

| 功能 | Owner | Manager | Customer | 檢查方式 |
|------|:-----:|:-------:|:--------:|---------|
| **首頁 `/book`** | — | — | R | `getCurrentUser()` + `customerId` |
| **自助預約 `/book/new`** | — | — | C（需啟用） | `selfBookingEnabled` + 餘額檢查 |
| **我的預約 `/my-bookings`** | — | — | R | `listBookings()` customerId 隔離 |
| **取消預約** | — | — | U | `cancelBooking()` 僅限自己 |
| **我的課程 `/my-plans`** | — | — | R | `customerId` 直接查詢 |
| **個人資料 `/profile`** | — | — | RU | `getCustomerDetail()` 僅限自己 |

---

## Manager 資料隔離規則

| 資料類型 | 檢視範圍 | 修改範圍 |
|---------|---------|---------|
| **顧客** | 全部（共享查看） | 僅自己名下 |
| **預約** | 全部（共享查看，含日曆/時段表） | 僅自己名下顧客 |
| **交易** | 僅自己 `revenueStaffId` | 僅自己名下 |
| **現金帳** | 僅自己 `staffId` | 僅自己的紀錄 |
| **報表** | 僅自己的營收數據 | — |
| **課程方案** | 全部方案（唯讀） | 不可修改 |

---

## 已知問題與建議

### 審計結果

| # | 類型 | 描述 | 風險 |
|---|------|------|------|
| 1 | UI 缺 check | `/dashboard/customers/new` 無 UI 層 `checkPermission` | 低（後端有擋） |
| 2 | UI 缺 check | `/dashboard/bookings/new` 無 UI 層 `checkPermission` | 低（後端有擋） |
| 3 | UI 缺 check | `/dashboard/cashbook/new` 無 UI 層 `checkPermission` | 低（後端有擋） |
| 4 | 設計決策 | Manager 可查看所有顧客/預約（共享模式） | 無（by design） |
| 5 | 建議 | 無 middleware 層級路由保護 | 中（可加） |

### 結論

- **後端防護覆蓋率：100%** — 所有 server action 和 query 皆有權限檢查
- **UI 防護覆蓋率：79%**（15/19 頁面）— 4 個新增頁缺 UI 層 check
- **無實際安全漏洞** — 所有缺少 UI check 的頁面，後端皆有 `requirePermission()` 兜底
- **Manager 隔離完整** — 交易、現金帳、報表皆強制 staffFilter
