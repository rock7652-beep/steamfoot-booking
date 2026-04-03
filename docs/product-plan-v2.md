# 蒸足預約管理系統 — 產品規劃 v2

> 基於 Demo 測試回饋，重新整理的完整產品規劃與 UI/UX 設計文件
> 日期：2026-04-03

---

## 目錄

1. [資訊架構（IA）](#1-資訊架構ia)
2. [前台 / 後台流程圖](#2-前台--後台流程圖)
3. [UI Wireframe](#3-ui-wireframe)
4. [Google 帳號綁定流程設計](#4-google-帳號綁定流程設計)
5. [顧客共享查看 + 營收歸屬邏輯](#5-顧客共享查看--營收歸屬邏輯)
6. [RBAC 權限設計](#6-rbac-權限設計)
7. [資料表 Schema 調整](#7-資料表-schema-調整)
8. [開發優先順序](#8-開發優先順序)

---

## 1. 資訊架構（IA）

### 1.1 現有問題

- 前台首頁有「線上預約 / 我的課程 / 預約紀錄」三個區塊，但點擊後導向登入頁，未登入顧客無法進入，且沒有註冊流程
- 顧客資料與 User 帳號強耦合（Customer.userId 雖為 nullable，但 Google 登入時直接建 User+Customer，缺乏「先有顧客資料、後綁帳號」的流程）
- 後台 Manager（店長）只能看到自己名下顧客，無法查看全部
- 報表僅支援月份篩選，缺少單日/區間/季度

### 1.2 更新後的 IA

```
蒸足預約管理系統
├── 前台（顧客面）
│   ├── / ........................ 首頁（品牌+快速入口）
│   ├── /login .................. 登入頁（Google / 手機驗證碼）
│   ├── /register ............... 註冊頁（手機號碼 + OTP 驗證）
│   ├── /book ................... 線上預約
│   │   └── 選日期 → 選時段 → 確認
│   ├── /my-plans ............... 我的課程（錢包、剩餘堂數）
│   ├── /my-bookings ............ 預約紀錄
│   │   └── /my-bookings/:id/cancel  取消預約
│   └── /my-profile ............. 個人資料（綁定 Google、更新電話）
│
├── 後台（店長面）
│   ├── /dashboard .............. 總覽（今日預約摘要、快捷操作）
│   ├── /dashboard/bookings ..... 預約管理（TimeTree 月曆）
│   │   ├── ?view=month ......... 月曆概覽
│   │   ├── ?view=day&date=...    單日詳情
│   │   └── /new ................ 新增預約（顧客搜尋 autocomplete）
│   ├── /dashboard/customers .... 顧客管理（表格列表）
│   │   ├── /new ................ 新增顧客（不需立即選店長）
│   │   └── /:id ................ 顧客詳情（方案、消費、預約）
│   ├── /dashboard/plans ........ 課程方案管理
│   ├── /dashboard/reports ...... 報表（多區間：日/週/月/季/自訂）
│   ├── /dashboard/transactions . 交易紀錄
│   ├── /dashboard/cashbook ..... 現金帳
│   └── /dashboard/staff ........ 店長管理
│       ├── /:id/edit ........... 編輯店長（含權限設定）
│       └── /:id/permissions .... 權限配置
│
└── API
    ├── /api/auth/[...nextauth] . 認證（Google + Credentials）
    ├── /api/customers/search ... 顧客搜尋 API（autocomplete 用）
    ├── /api/export/customers ... 顧客 Excel 匯出
    ├── /api/export/store-monthly 全店月報匯出
    └── /api/export/staff-monthly 店長月報匯出
```

### 1.3 導航結構變更

**前台 — 底部導航（登入後）**

| 圖示 | 名稱 | 路徑 |
|------|------|------|
| 📅 | 預約 | /book |
| 💳 | 我的課程 | /my-plans |
| 📋 | 預約紀錄 | /my-bookings |
| 👤 | 我的 | /my-profile |

**後台 — 底部導航（手機）**

| 圖示 | 名稱 | 路徑 | 可見條件 |
|------|------|------|----------|
| 🏠 | 首頁 | /dashboard | 全部 |
| 📆 | 月曆 | /dashboard/bookings | 需有 booking.read 權限 |
| 👥 | 顧客 | /dashboard/customers | 需有 customer.read 權限 |
| 📄 | 紀錄 | /dashboard/transactions | 需有 transaction.read 權限 |
| 📊 | 報表 | /dashboard/reports | 需有 report.read 權限 |

---

## 2. 前台 / 後台流程圖

### 2.1 顧客註冊與登入流程

```
                        ┌──────────────┐
                        │   首頁 (/)   │
                        └──────┬───────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            ┌──────────────┐    ┌──────────────────┐
            │  登入 /login │    │  註冊 /register  │
            └──────┬───────┘    └──────┬───────────┘
                   │                   │
          ┌────────┴────────┐          │
          ▼                 ▼          ▼
   ┌─────────────┐  ┌──────────┐  ┌─────────────────────┐
   │ Google 登入 │  │ 手機+OTP │  │ 填寫手機 → OTP 驗證 │
   └──────┬──────┘  └────┬─────┘  │ → 填姓名 → 完成註冊 │
          │              │        └──────────┬──────────┘
          │              │                   │
          ▼              ▼                   ▼
   ┌─────────────────────────────────────────────────┐
   │              檢查是否有匹配的顧客資料            │
   │  (依 Google email 或 手機號碼 比對 Customer)    │
   └──────────┬────────────────────┬─────────────────┘
              │                    │
     有匹配 Customer       無匹配 Customer
              │                    │
              ▼                    ▼
   ┌──────────────────┐  ┌────────────────────────┐
   │ 自動綁定既有顧客 │  │ 自動建立新 Customer    │
   │ Customer.userId  │  │ (手機登入已有 phone)   │
   │ = 當前 User.id   │  │ (Google 登入 phone='') │
   └──────────┬───────┘  └────────┬───────────────┘
              │                    │
              ▼                    ▼
   ┌─────────────────────────────────────────┐
   │   導向前台首頁，可預約/查看課程/紀錄    │
   └─────────────────────────────────────────┘
```

### 2.2 後台新增預約流程（改進）

```
   ┌────────────────────────┐
   │ 月曆頁 → 點擊「+預約」│
   │ 或點擊某日期的「+」    │
   └───────────┬────────────┘
               ▼
   ┌──────────────────────────────────┐
   │  新增預約表單                    │
   │                                  │
   │  顧客：[ 搜尋框 autocomplete ]  │
   │         可輸入姓名/電話搜尋      │
   │         顯示下拉匹配結果         │
   │         含「快速建立顧客」按鈕   │
   │                                  │
   │  日期：[    日期選擇器    ]      │
   │  時段：[  格狀點選 8 個時段  ]   │
   │  類型：[ 套餐/體驗/單次 ]       │
   │  備註：[ 選填文字框 ]           │
   └───────────┬────────────────────── │
               ▼
   ┌──────────────────────────────────┐
   │  快速建立顧客（彈窗）           │
   │  必填：姓名、電話               │
   │  選填：LINE名稱、備註           │
   │  不需選：直屬店長（後續指派）   │
   │  預設 assignedStaffId = null    │
   │  預設 customerStage = LEAD      │
   └──────────────────────────────────┘
```

### 2.3 後台顧客管理流程

```
   ┌─────────────────────────────────────────┐
   │  顧客列表頁（表格）                     │
   │                                         │
   │  搜尋列：[姓名/電話/email 搜尋框]      │
   │  篩選：狀態 | 直屬店長 | 有無剩餘堂數  │
   │  操作：匯出 Excel | 新增顧客            │
   │                                         │
   │  表格欄位：                             │
   │  姓名 | 電話 | Email | 店長 |          │
   │  狀態 | 剩餘堂數 | 最近消費 | 操作     │
   └───────────┬─────────────────────────────┘
               │ 點擊某顧客
               ▼
   ┌─────────────────────────────────────────┐
   │  顧客詳情頁                             │
   │                                         │
   │  基本資料（可編輯）                     │
   │  ├ 姓名、電話、LINE名稱                │
   │  ├ Google 帳號（若已綁定，顯示 email）  │
   │  ├ 直屬店長（可由任何店長指派/變更）    │
   │  └ 狀態、備註                           │
   │                                         │
   │  課程方案 Tab                            │
   │  ├ 有效方案列表                         │
   │  └ 指派新方案                           │
   │                                         │
   │  預約紀錄 Tab                            │
   │  └ 預約歷史                             │
   │                                         │
   │  消費紀錄 Tab                            │
   │  └ 交易歷史                             │
   └─────────────────────────────────────────┘
```

### 2.4 報表查詢流程

```
   ┌─────────────────────────────────────────────────┐
   │  報表頁                                          │
   │                                                  │
   │  快捷按鈕列：                                    │
   │  [今日] [本週] [本月] [本季] [自訂區間]         │
   │                                                  │
   │  ┌─────────────────────────────────────────┐    │
   │  │ 自訂區間（展開時顯示）                   │    │
   │  │ 起始日：[____] 結束日：[____] [查詢]    │    │
   │  └─────────────────────────────────────────┘    │
   │                                                  │
   │  全店摘要卡片                                    │
   │  ├ 課程總收入 / 退款 / 淨收                     │
   │  ├ 完成服務堂數                                  │
   │  └ 現金帳收支                                    │
   │                                                  │
   │  店長明細表格                                    │
   │  收入類型明細表格                                │
   │  匯出按鈕                                        │
   └─────────────────────────────────────────────────┘
```

---

## 3. UI Wireframe

### 3.1 前台首頁（未登入）— Mobile

```
┌──────────────────────────┐
│                          │
│         ♨ Logo           │
│   蒸足預約管理系統        │
│   輕鬆管理預約與課程      │
│                          │
│  ┌──────────────────────┐│
│  │  使用 Google 帳號登入 ││
│  └──────────────────────┘│
│                          │
│  ┌──────────────────────┐│
│  │  手機號碼登入/註冊    ││
│  └──────────────────────┘│
│                          │
│     ─── 或 ───           │
│                          │
│  ┌──────────────────────┐│
│  │  店長帳號登入         ││
│  └──────────────────────┘│
│                          │
└──────────────────────────┘
```

### 3.2 前台首頁（已登入顧客）— Mobile

```
┌──────────────────────────┐
│  蒸足  👤 林小姐          │  ← 頂部列
├──────────────────────────┤
│                          │
│  午安，林小姐 ☀️          │
│                          │
│  ┌──────────────────────┐│
│  │  📅 立即預約          ││  ← 主要 CTA
│  └──────────────────────┘│
│                          │
│  我的課程                 │
│  ┌───────────┬──────────┐│
│  │ 5堂套餐   │ 剩餘 3堂 ││
│  │ 到期 6/30 │          ││
│  └───────────┴──────────┘│
│                          │
│  近期預約                 │
│  ┌──────────────────────┐│
│  │  4/5（六）14:00      ││
│  │  狀態：已確認         ││
│  └──────────────────────┘│
│                          │
├──────────────────────────┤
│  📅預約  💳課程  📋紀錄  👤我的│  ← 底部導航
└──────────────────────────┘
```

### 3.3 顧客管理頁（後台）— Mobile 表格式

```
┌──────────────────────────┐
│  ← 顧客管理    [匯出][+] │
├──────────────────────────┤
│ [🔍 搜尋姓名/電話/email ]│
│ 篩選：[全部狀態▼] [店長▼]│
│ 共 48 位顧客              │
├──────────────────────────┤
│                          │
│ ┌────────────────────────┐
│ │ 姓名    電話     狀態  │  ← 表頭（手機版精簡）
│ ├────────────────────────┤
│ │ 林小姐  0912... 已購課 │
│ │ 🟣王店長  剩3堂  4/1  │  ← 次行：店長色點+剩餘+最近
│ ├────────────────────────┤
│ │ 張先生  0933... 體驗   │
│ │ 🔵李店長  剩0堂  3/28 │
│ ├────────────────────────┤
│ │ 陳小姐  0955... 名單   │
│ │ ⚪未指派  --    --     │
│ └────────────────────────┘
│                          │
│  < 1  2  3 ... 5  >      │
├──────────────────────────┤
│ 🏠首頁 📆月曆 👥顧客 📄紀錄 📊報表│
└──────────────────────────┘
```

手機版表格策略：每個顧客占兩行。第一行顯示核心資訊（姓名、電話、狀態），第二行顯示輔助資訊（店長色點+名稱、剩餘堂數、最近消費日期）。點擊整行進入詳情。

### 3.4 月曆頁（後台）— TimeTree 風格

```
┌──────────────────────────┐
│  ←  2026 年 4 月  →      │
├──────────────────────────┤
│ 日 一 二 三 四 五 六      │
├──────────────────────────┤
│    1    2    3    4    5  │
│         2人  4人  1人    │
│         🟣🔵  🟣🔵  🟣    │
│                          │
│  6   7    8    9   10 11 │
│      3人  2人       5人  │
│      🟣🔵  🔵       🟣🔵🟢│
│ ...                      │
├──────────────────────────┤
│ 圖例：🟣王店長 🔵李店長 🟢陳店長│
├──────────────────────────┤
│ 🏠首頁 📆月曆 👥顧客 📄紀錄 📊報表│
└──────────────────────────┘
```

### 3.5 日期詳情頁（後台）

```
┌──────────────────────────┐
│  ←  4月3日（四）  →      │
│  今日預約 6 筆            │
├──────────────────────────┤
│                          │
│  10:00 ───── 2/6 ────── │
│  ┌──────────────────────┐│
│  │ 🟣 林小姐  套餐      ││
│  │    已確認             ││
│  ├──────────────────────┤│
│  │ 🔵 張先生  體驗      ││
│  │    待確認             ││
│  └──────────────────────┘│
│                          │
│  11:00 ───── 1/6 ────── │
│  ┌──────────────────────┐│
│  │ 🟣 陳小姐  套餐      ││
│  │    已確認             ││
│  └──────────────────────┘│
│                          │
│  14:00 ───── 0/6 ────── │
│  （無預約）               │
│                          │
│ [+ 新增預約]              │
├──────────────────────────┤
│ 🏠首頁 📆月曆 👥顧客 📄紀錄 📊報表│
└──────────────────────────┘
```

### 3.6 新增預約（搜尋式顧客選擇）

```
┌──────────────────────────┐
│  ← 新增預約               │
├──────────────────────────┤
│                          │
│  顧客 *                   │
│  ┌──────────────────────┐│
│  │ 🔍 搜尋姓名或電話... ││
│  ├──────────────────────┤│
│  │  林小姐 0912-345-678 ││  ← autocomplete
│  │  林先生 0933-456-789 ││     下拉結果
│  ├──────────────────────┤│
│  │  ＋ 快速建立新顧客   ││
│  └──────────────────────┘│
│                          │
│  日期 *                   │
│  ┌──────────────────────┐│
│  │  2026-04-05（六）    ││
│  └──────────────────────┘│
│                          │
│  時段 *                   │
│  ┌────┬────┬────┬────┐  │
│  │10:00│11:00│14:00│15:00│ │
│  ├────┼────┼────┼────┤  │
│  │16:00│17:30│18:30│19:30│ │
│  └────┴────┴────┴────┘  │
│                          │
│  ┌──────────────────────┐│
│  │     確認建立預約      ││
│  └──────────────────────┘│
├──────────────────────────┤
│ 🏠首頁 📆月曆 👥顧客 📄紀錄 📊報表│
└──────────────────────────┘
```

### 3.7 報表頁（多區間快捷按鈕）

```
┌──────────────────────────┐
│  報表                     │
├──────────────────────────┤
│                          │
│  [今日][本週][本月][本季] │
│  [  自訂區間 ▼  ]        │
│                          │
│  ── 2026/4/3 營收摘要 ── │
│  ┌──────┬──────┬────────┐│
│  │總收入│ 退款 │  淨收   ││
│  │$8,200│ $0  │ $8,200  ││
│  └──────┴──────┴────────┘│
│  完成服務 5 堂            │
│                          │
│  ── 店長明細 ──          │
│  ┌──────────────────────┐│
│  │ 🟣王店長              ││
│  │ 顧客8 | 服務3堂      ││
│  │ 收入 $5,400          ││
│  ├──────────────────────┤│
│  │ 🔵李店長              ││
│  │ 顧客5 | 服務2堂      ││
│  │ 收入 $2,800          ││
│  └──────────────────────┘│
│                          │
│  [⬇ 匯出報表 CSV]        │
├──────────────────────────┤
│ 🏠首頁 📆月曆 👥顧客 📄紀錄 📊報表│
└──────────────────────────┘
```

---

## 4. Google 帳號綁定流程設計

### 4.1 核心設計原則

1. **顧客資料獨立於帳號**：Customer 表不需要 User 就能存在（`userId` nullable）
2. **綁定而非建立**：Google 登入時優先比對既有 Customer（以 email），而非自動新建
3. **後台先行**：店長可先在後台建顧客資料（姓名+電話），無需顧客有帳號
4. **不強制 Google**：支援手機 OTP 登入作為替代

### 4.2 綁定流程 — 新 Google 使用者

```
顧客用 Google 登入
        │
        ▼
NextAuth 建立 User + Account 記錄
        │
        ▼
jwt callback 觸發
        │
        ├─── 用 Google email 查 Customer 表
        │
        ├── 找到匹配 ──────────────────────┐
        │   (後台已建、email 欄位匹配)      │
        │                                   ▼
        │                         自動綁定：
        │                         Customer.userId = user.id
        │                         User.role = CUSTOMER
        │                         Token 帶入 customerId
        │
        └── 沒找到 ───────────────────────┐
                                          ▼
                                自動建立新 Customer：
                                name = Google profile name
                                phone = ''（稍後補填）
                                assignedStaffId = null
                                customerStage = LEAD
                                userId = user.id
```

### 4.3 綁定流程 — 手機 OTP 使用者

```
顧客輸入手機號碼
        │
        ▼
發送 OTP 驗證碼（未來可接 SMS / LINE）
        │
        ▼
驗證成功
        │
        ├─── 用手機號碼查 Customer 表
        │
        ├── 找到匹配 ──────────────────────┐
        │   (後台已建、phone 欄位匹配)      │
        │                                   ▼
        │                         自動綁定：
        │                         建立/關聯 User
        │                         Customer.userId = user.id
        │
        └── 沒找到 ───────────────────────┐
                                          ▼
                                建立 User + Customer
                                phone = 輸入的號碼
                                name = 顧客填寫的姓名
```

### 4.4 已有帳號的顧客追加綁定 Google

```
顧客已透過手機 OTP 註冊
        │
        ▼
進入 /my-profile「個人資料」頁
        │
        ▼
點擊「綁定 Google 帳號」
        │
        ▼
OAuth 流程 → Google 授權
        │
        ▼
檢查該 Google 帳號是否已被其他 User 使用
        │
        ├── 已被使用 → 提示「此 Google 帳號已綁定其他用戶」
        │
        └── 未使用 → 在 Account 表新增 Google provider 記錄
                      關聯到當前 User
                      之後可用 Google 直接登入
```

### 4.5 Customer 表新增 email 欄位

為了支援 Google 綁定前的 email 比對，Customer 表需新增 `email` 欄位：

- 後台建立顧客時可選填 email
- Google 登入時以此 email 匹配既有顧客
- 綁定後此欄位與 User.email 同步

---

## 5. 顧客共享查看 + 營收歸屬邏輯

### 5.1 核心設計原則

**「所有店長看全部，營收算直屬」**

| 面向 | 規則 |
|------|------|
| 查看顧客 | 所有店長（含 Manager）都能查看全部顧客列表 |
| 編輯顧客 | 依權限控制（見 RBAC 第 6 節） |
| 營收歸屬 | Booking/Transaction 的 `revenueStaffId` 快照建立時的 `customer.assignedStaffId` |
| 指派店長 | 任何有 `customer.assign` 權限的店長可將顧客的直屬店長改為任意店長 |
| 報表篩選 | Owner 看全店；Manager 看自己名下營收（但可查看其他店長的顧客基本資料） |

### 5.2 現有問題 vs 調整方案

**現有邏輯（需修改）：**

```
// 現在 listCustomers 中：
if (user.role === "MANAGER") {
  filter: { assignedStaffId: user.staffId }  // ← Manager 只看自己的
}
```

**調整後：**

```
// listCustomers：Manager 也能看全部顧客
// 移除 staffFilter 的 MANAGER 限制
// 改為：僅 CUSTOMER 角色限制只看自己

// getCustomerDetail：
// Manager 可看任何顧客基本資料
// 但只有有 customer.update 權限的才能編輯
```

### 5.3 營收歸屬邏輯不變

Booking 建立時的 `revenueStaffId` = 當時 `customer.assignedStaffId` 的快照。即使之後顧客被轉給其他店長，歷史營收歸屬不變。

```
建立預約 →
  revenueStaffId = customer.assignedStaffId（快照，不會因轉移而改）
  serviceStaffId = 當天值班店長（可後補）

報表查詢 →
  以 revenueStaffId 分組計算
  「營收歸屬」是建立時的快照
  「值班服務」是實際服務的店長
```

### 5.4 顧客轉移

| 操作 | 說明 |
|------|------|
| 轉移直屬店長 | 更新 `customer.assignedStaffId` |
| 歷史預約 | `revenueStaffId` 不變（已快照） |
| 新預約 | 新預約的 `revenueStaffId` 用新的 `assignedStaffId` |
| 報表影響 | 轉移前的營收算原店長，轉移後的營收算新店長 |

---

## 6. RBAC 權限設計

### 6.1 角色重新定義

| 角色 | 說明 |
|------|------|
| OWNER | 老闆，最高權限，可管理一切 |
| MANAGER | 店長，權限由 OWNER 逐項配置 |
| CUSTOMER | 顧客，僅能操作自己的資料 |

### 6.2 可配置權限項目（針對 MANAGER）

新增 `StaffPermission` 表，每個 Staff 可獨立設定：

| 權限代碼 | 說明 | 預設值 |
|----------|------|--------|
| `customer.read` | 查看顧客列表與詳情 | true |
| `customer.create` | 新增顧客 | true |
| `customer.update` | 編輯顧客資料 | false |
| `customer.assign` | 指派/變更直屬店長 | false |
| `customer.export` | 匯出顧客資料 | false |
| `booking.read` | 查看預約 | true |
| `booking.create` | 新增預約 | true |
| `booking.update` | 修改/取消預約 | true |
| `transaction.read` | 查看交易紀錄 | true |
| `transaction.create` | 新增交易 | true |
| `wallet.read` | 查看課程方案 | true |
| `wallet.create` | 指派課程方案 | false |
| `report.read` | 查看報表 | false |
| `report.export` | 匯出報表 | false |
| `cashbook.read` | 查看現金帳 | false |
| `cashbook.create` | 新增現金帳 | false |

### 6.3 權限檢查流程

```
API 或 Server Action 接收請求
        │
        ▼
取得當前 Session（userId, role, staffId）
        │
        ├── OWNER → 直接放行
        │
        ├── CUSTOMER → 只能操作自己的資料
        │
        └── MANAGER →
              │
              ▼
        查 StaffPermission 表
        檢查是否有對應的權限代碼
              │
              ├── 有權限 → 放行
              └── 無權限 → 403 Forbidden
```

### 6.4 vs 現有設計差異

| 面向 | 現有 | 調整後 |
|------|------|--------|
| 權限存儲 | 寫死在 permissions.ts 的 PERMISSIONS 物件 | StaffPermission 資料表，可動態配置 |
| Manager 查看範圍 | 只能看自己名下顧客 | 可看全部顧客（查看權限由 customer.read 控制） |
| 權限粒度 | 粗粒度（resource + action） | 細粒度（每個功能項獨立開關） |
| Owner 設定 | 不可調整 | Owner 可在後台逐項配置每位 Manager |

---

## 7. 資料表 Schema 調整

### 7.1 Customer 表調整

```prisma
model Customer {
  id                 String        @id @default(cuid())
  userId             String?       @unique  // nullable: 顧客不一定有帳號
  name               String
  phone              String        // 可為空字串（Google 登入時）
  email              String?       // ★ 新增：用於 Google 綁定比對
  lineName           String?
  notes              String?
  assignedStaffId    String?       // ★ 改為 nullable（建立時可不指派）
  customerStage      CustomerStage @default(LEAD)
  selfBookingEnabled Boolean       @default(false)
  firstVisitAt       DateTime?
  convertedAt        DateTime?
  lastVisitAt        DateTime?     // ★ 新增：最近消費日期（方便列表顯示）
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  user          User?  @relation(...)
  assignedStaff Staff? @relation(...)  // ★ 改為 optional

  // ... 其他 relation 不變

  @@index([email])       // ★ 新增索引
  @@index([assignedStaffId])
  @@index([customerStage])
  @@index([phone])
}
```

**變更摘要：**

| 欄位 | 變更 | 原因 |
|------|------|------|
| `email` | 新增，nullable | Google 綁定比對用 |
| `assignedStaffId` | 改為 nullable | 新建顧客時不需立即選店長 |
| `lastVisitAt` | 新增，nullable | 列表快速顯示最近消費，避免每次 join 查詢 |

### 7.2 新增 StaffPermission 表

```prisma
model StaffPermission {
  id         String  @id @default(cuid())
  staffId    String
  permission String  // e.g. "customer.read", "booking.create"
  granted    Boolean @default(true)

  staff Staff @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([staffId, permission])
  @@index([staffId])
}
```

### 7.3 Staff 表調整

```prisma
model Staff {
  // ... 現有欄位不變

  // ★ 新增
  permissions StaffPermission[]
}
```

### 7.4 Booking 表調整

```prisma
model Booking {
  // ... 現有欄位不變
  revenueStaffId String?  // ★ 改為 nullable（顧客可能尚未指派店長）
  // ...
}
```

### 7.5 完整 Migration 計畫

```sql
-- Step 1: Customer 表
ALTER TABLE "Customer" ADD COLUMN "email" TEXT;
ALTER TABLE "Customer" ADD COLUMN "lastVisitAt" TIMESTAMP;
ALTER TABLE "Customer" ALTER COLUMN "assignedStaffId" DROP NOT NULL;
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- Step 2: StaffPermission 表
CREATE TABLE "StaffPermission" (
  "id" TEXT NOT NULL DEFAULT cuid(),
  "staffId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffPermission_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "StaffPermission_staffId_permission_key"
  ON "StaffPermission"("staffId", "permission");
CREATE INDEX "StaffPermission_staffId_idx" ON "StaffPermission"("staffId");

-- Step 3: 為現有 Manager 建立預設權限
-- (在 seed 或 migration script 中執行)

-- Step 4: Booking.revenueStaffId nullable
ALTER TABLE "Booking" ALTER COLUMN "revenueStaffId" DROP NOT NULL;
```

---

## 8. 開發優先順序

### Phase 1 — 基礎修正（預計 2-3 天）

| 優先 | 項目 | 說明 |
|------|------|------|
| P0 | Schema 調整 | Customer.email、assignedStaffId nullable、lastVisitAt、StaffPermission 表 |
| P0 | 顧客列表改表格 | 卡片 → 表格，手機版兩行式，加上 email 搜尋 |
| P0 | 店長共享查看 | 移除 Manager 的顧客隔離，改為全部可見 |
| P0 | 建立顧客不選店長 | assignedStaffId 改為選填，後台可稍後指派 |

### Phase 2 — 預約體驗改善（預計 2-3 天）

| 優先 | 項目 | 說明 |
|------|------|------|
| P1 | 預約顧客搜尋 | select 改為 autocomplete/searchable dropdown |
| P1 | 快速建立顧客 | 預約時可直接在彈窗快速建立 |
| P1 | 月曆 UI 微調 | 延續 TimeTree 風格，確保手機流暢 |

### Phase 3 — 權限與報表（預計 3-4 天）

| 優先 | 項目 | 說明 |
|------|------|------|
| P1 | StaffPermission 表與 API | 實作動態權限檢查 |
| P1 | 店長權限設定頁 | Owner 可配置每位 Manager 的細項權限 |
| P1 | 報表多區間 | 快捷按鈕：今日/本週/本月/本季/自訂 |
| P2 | 報表支援日期區間查詢 | startDate + endDate 參數 |

### Phase 4 — 顧客登入（預計 3-4 天）

| 優先 | 項目 | 說明 |
|------|------|------|
| P1 | Google 登入 + 綁定邏輯重寫 | 以 email 匹配既有顧客，而非直接建新的 |
| P2 | 手機 OTP 註冊/登入 | 前台完整註冊流程（需 SMS 服務商） |
| P2 | /my-profile 個人資料頁 | 綁定 Google、更新電話 |
| P2 | 前台首頁改版 | 登入後顯示課程摘要和近期預約 |

### Phase 5 — 匯出與細節（預計 1-2 天）

| 優先 | 項目 | 說明 |
|------|------|------|
| P2 | 顧客 Excel 匯出更新 | 加入 email 欄位、lastVisitAt |
| P2 | 報表匯出支援區間 | CSV 檔名含日期區間 |
| P3 | 後台 bottom nav 權限控制 | 依 StaffPermission 動態顯示/隱藏 |

### 整體時程估計

| Phase | 工時 | 累計 |
|-------|------|------|
| Phase 1 基礎修正 | 2-3 天 | 2-3 天 |
| Phase 2 預約改善 | 2-3 天 | 4-6 天 |
| Phase 3 權限與報表 | 3-4 天 | 7-10 天 |
| Phase 4 顧客登入 | 3-4 天 | 10-14 天 |
| Phase 5 匯出細節 | 1-2 天 | 11-16 天 |

> 建議先完成 Phase 1-2，即可交付可用版本供店長日常使用；Phase 3-4 視業務優先級調整。

---

## 附錄：與現有程式碼的差異對照

| 檔案 | 需要修改的內容 |
|------|---------------|
| `prisma/schema.prisma` | Customer 新增 email/lastVisitAt、assignedStaffId nullable、新增 StaffPermission model |
| `src/lib/permissions.ts` | 從靜態 PERMISSIONS 改為查表式動態權限 |
| `src/lib/auth.ts` | Google 登入 jwt callback 重寫綁定邏輯（email 比對優先） |
| `src/server/queries/customer.ts` | listCustomers 移除 Manager 隔離、新增 email 搜尋 |
| `src/app/(dashboard)/dashboard/customers/page.tsx` | 卡片式 → 表格式 |
| `src/app/(dashboard)/dashboard/bookings/new/page.tsx` | select → autocomplete 搜尋 |
| `src/app/(dashboard)/dashboard/reports/page.tsx` | 新增快捷按鈕、日期區間參數 |
| `src/app/(dashboard)/dashboard/staff/[id]/edit/page.tsx` | 新增權限設定區塊 |
| `src/app/(dashboard)/layout.tsx` | bottom nav 依權限控制顯示 |
| `src/app/page.tsx` | 首頁改版（登入/註冊入口） |
| `src/app/(auth)/login/page.tsx` | 加入手機 OTP 區塊 |
| `新增 src/app/(auth)/register/page.tsx` | 前台註冊頁 |
| `新增 src/app/(customer)/my-profile/page.tsx` | 個人資料（綁定 Google） |
| `新增 src/app/api/customers/search/route.ts` | autocomplete 搜尋 API |
| `src/app/api/export/customers/route.ts` | 加入 email、lastVisitAt 欄位 |
