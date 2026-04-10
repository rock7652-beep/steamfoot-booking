# 值班人員安排 + 服務參與紀錄 — 功能設計文件

> 版本：v1.0（2026-04-09）
> 狀態：設計階段，待開發

---

## 一、功能定位

### 這個功能「是什麼」

營業時間內的「值班人員安排」與「服務參與紀錄」。核心目的是記錄每個營業時段有哪些人在場、各自扮演什麼角色、以什麼方式參與服務。這是一個「營運流程紀錄」工具，不是排班系統。

### 這個功能「不是什麼」

- 不是完整排班系統（不處理休假、調班、班表循環）
- 不是人資模組（不處理薪資、出勤、打卡）
- 不是人力容量計算引擎（不自動判斷人手夠不夠）
- 不是人力容量計算引擎的進階版（v1 不根據人數動態調整容量，只判斷有無值班）

### 業務情境

以 4/10 14:00–16:00 為例，現場實際可能同時有：

| 人員 | 身份 | 參與方式 |
|------|------|---------|
| 店長 A | STORE_MANAGER | 主服務 |
| 分店長 B | BRANCH_MANAGER | 協助服務 |
| 實習教練 C | INTERN_MANAGER | 學習跟班 |

所以系統必須支援：同一時段多人安排，每人有獨立的角色與參與方式。

### 與現有系統的關係

目前 Booking model 已有三個 staff 欄位：`revenueStaffId`（營收歸屬）、`serviceStaffId`（實際服務）、`bookedByStaffId`（代約者）。這些是「單一預約對應的 staff 快照」，只記錄一位服務人員。

新的值班安排是「時段層級」的人員配置，記錄該時段所有在場人員，與個別預約無關。兩者互補，不互斥：

- **Booking.serviceStaffId**：這筆預約是誰服務的（1 對 1）
- **DutyAssignment**：這個時段有誰在場、做什麼（1 對多）

---

## 二、資料結構設計

### 新增 Enum

```prisma
enum DutyRole {
  STORE_MANAGER    // 店長
  BRANCH_MANAGER   // 分店長
  INTERN_COACH     // 實習教練
  HOURLY_STAFF     // 計時人員
}

enum ParticipationType {
  PRIMARY          // 主服務
  ASSIST           // 協助服務
  SHADOW           // 學習跟班
  SUPPORT          // 現場支援
}
```

### Enum UI 顯示文字對照表

以下為後台 UI 必須使用的中文標籤，定義在 `src/lib/duty-constants.ts`：

**DutyRole（值班身份）**

| Enum 值 | 中文標籤 | 週檢視簡稱 | 說明 |
|---------|---------|-----------|------|
| `STORE_MANAGER` | 店長 | 店長 | 主要經營者 |
| `BRANCH_MANAGER` | 分店長 | 分店長 | 合作協助經營者 |
| `INTERN_COACH` | 實習教練 | 實習 | 學習階段人員 |
| `HOURLY_STAFF` | 計時人員 | 計時 | 按時計薪的支援人員 |

**ParticipationType（參與方式）**

| Enum 值 | 中文標籤 | 週檢視簡稱 | 說明 |
|---------|---------|-----------|------|
| `PRIMARY` | 主服務 | 主 | 該時段的主要服務人員 |
| `ASSIST` | 協助服務 | 協助 | 輔助主服務人員 |
| `SHADOW` | 學習跟班 | 跟班 | 在旁觀摩學習，不獨立服務 |
| `SUPPORT` | 現場支援 | 支援 | 臨時支援、不固定職責 |

**常數檔案範例**（`src/lib/duty-constants.ts`）：

```typescript
export const DUTY_ROLE_LABELS: Record<DutyRole, string> = {
  STORE_MANAGER: "店長",
  BRANCH_MANAGER: "分店長",
  INTERN_COACH: "實習教練",
  HOURLY_STAFF: "計時人員",
};

export const DUTY_ROLE_SHORT: Record<DutyRole, string> = {
  STORE_MANAGER: "店長",
  BRANCH_MANAGER: "分店長",
  INTERN_COACH: "實習",
  HOURLY_STAFF: "計時",
};

export const PARTICIPATION_TYPE_LABELS: Record<ParticipationType, string> = {
  PRIMARY: "主服務",
  ASSIST: "協助服務",
  SHADOW: "學習跟班",
  SUPPORT: "現場支援",
};

export const PARTICIPATION_TYPE_SHORT: Record<ParticipationType, string> = {
  PRIMARY: "主",
  ASSIST: "協助",
  SHADOW: "跟班",
  SUPPORT: "支援",
};
```

**UI 顯示規則**：

- **週檢視格子**：`{Staff.displayName}({PARTICIPATION_TYPE_SHORT})`，例如「小明(主)」「小華(協助)」
- **日編輯卡片**：完整標籤，例如「身份：店長　參與：主服務」
- **下拉選單**：完整標籤，例如「店長」「協助服務」

**DutyRole 自動帶入規則**（新增值班時根據 Staff.user.role 預設）：

| Staff 的 UserRole | 預設 DutyRole |
|-------------------|--------------|
| `OWNER` | `STORE_MANAGER` |
| `STORE_MANAGER` | `STORE_MANAGER` |
| `BRANCH_MANAGER` | `BRANCH_MANAGER` |
| `INTERN_MANAGER` | `INTERN_COACH` |
| `MANAGER`（legacy） | `STORE_MANAGER` |

### 新增 Model：DutyAssignment

```prisma
model DutyAssignment {
  id                String            @id @default(cuid())
  date              DateTime          @db.Date        // 值班日期（與 Booking.bookingDate 同格式）
  slotTime          String            // "HH:mm"，對齊現有 slot 時間格式
  staffId           String            // 值班人員
  dutyRole          DutyRole          // 該人員在此時段的身份
  participationType ParticipationType // 參與方式
  notes             String?           // 備註（例如：帶新人觀摩第三堂）
  createdByStaffId  String?           // 誰安排的（審計用）
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  staff        Staff  @relation("DutyStaff", fields: [staffId], references: [id])
  createdBy    Staff? @relation("DutyCreatedBy", fields: [createdByStaffId], references: [id])

  @@unique([date, slotTime, staffId])  // 同一時段同一人只能有一筆
  @@index([date])                      // 查某天所有值班
  @@index([date, slotTime])            // 查某天某時段的值班人員
  @@index([staffId])                   // 查某人的值班紀錄
  @@index([staffId, date])             // 查某人某天的值班
}
```

### Staff Model 新增 relation

```prisma
model Staff {
  // ... 現有欄位 ...

  // 值班安排
  dutyAssignments    DutyAssignment[] @relation("DutyStaff")
  dutyCreatedBy      DutyAssignment[] @relation("DutyCreatedBy")
}
```

### 設計決策說明

**為什麼用 `slotTime`（單一時段）而不是 `startTime` + `endTime`（時間區間）？**

現有系統的時段機制是 BusinessHours + slotInterval 動態生成固定間隔的 slot（例如每 60 分鐘一個 slot）。Booking 也用 `slotTime` 記錄。DutyAssignment 對齊這個設計，每個 slot 獨立安排值班人員。如果一個人值班 14:00–16:00（兩個 60 分鐘 slot），就會有兩筆 DutyAssignment（14:00 和 15:00）。這樣做的好處是查詢簡單、與 Booking 的 slot 結構一致，而且可以精確到每個時段調整人員配置。

**為什麼 `DutyRole` 不直接用 `UserRole`？**

UserRole 是系統權限角色（OWNER / STORE_MANAGER / BRANCH_MANAGER / INTERN_MANAGER），DutyRole 是值班場景的身份標籤。兩者語意不同：一個 BRANCH_MANAGER 在某些時段可能擔任主服務角色，但他的系統權限不會因此改變。此外 DutyRole 包含 HOURLY_STAFF（計時人員），這在 UserRole 裡沒有對應。不過 v1 新增值班時，可以根據 Staff 的 UserRole 自動帶入預設的 DutyRole，減少手動選擇。

**為什麼不做成 JSON 欄位？**

雖然用 JSON 欄位（例如在 SlotOverride 裡加一個 `dutyStaff: Json`）看起來更簡單，但：查詢「某人本月值班了幾次」需要 JSON 解析、無法建 index、無法做 relation 查詢。獨立 model 更適合未來擴展（排班報表、人員統計、值班歷史）。

---

## 三、權限設計

### 新增權限碼

| 權限碼 | 說明 |
|--------|------|
| `duty.read` | 查看值班安排 |
| `duty.manage` | 新增 / 編輯 / 刪除值班安排 |

### 角色預設

| 角色 | duty.read | duty.manage |
|------|:---------:|:-----------:|
| OWNER | Yes | Yes |
| STORE_MANAGER | Yes | Yes |
| BRANCH_MANAGER | Yes | No |
| INTERN_MANAGER | Yes | No |

BRANCH_MANAGER 和 INTERN_MANAGER 可以看到值班表（知道今天誰在），但不能自行修改安排。

### Server Action 檢查

```typescript
// 讀取
export async function getDutyAssignments(date: string) {
  await requirePermission("duty.read");
  // ...
}

// 寫入
export async function upsertDutyAssignment(data: DutyAssignmentInput) {
  await requirePermission("duty.manage");
  // ...
}

export async function deleteDutyAssignment(id: string) {
  await requirePermission("duty.manage");
  // ...
}
```

---

## 四、後台畫面設計

### 頁面路由

```
/dashboard/duty              → 值班總覽（週檢視）
/dashboard/duty/[date]       → 單日值班詳情 + 編輯
```

### 4-1. 值班總覽（週檢視）

**路由**：`/dashboard/duty`

**佈局**：

頂部是週選擇器（`< 上一週 | 2026/04/07 ~ 04/13 | 下一週 >`），下方是一個橫向表格，列（row）是營業時段，欄（column）是星期一到星期日。

```
         週一(4/7)      週二(4/8)      週三(4/9)      ...
10:00    店長A(主)      店長A(主)      [公休]
         分店B(協助)
11:00    店長A(主)      店長A(主)      [公休]
12:00    [午休]         [午休]         [公休]
...
14:00    店長A(主)      店長A(主)      [公休]
         實習C(跟班)    分店B(協助)
```

每個格子用色彩標記值班人員（Staff.colorCode），點擊格子可快速進入該日編輯。

格子內人員顯示格式：`顯示名稱(參與方式簡稱)`，例如「小明(主)」「小華(協助)」。

公休日（SpecialBusinessDay type=closed/training）和非營業時段（BusinessHours.isOpen=false）顯示灰底「公休」或「非營業」。

### 4-2. 單日值班編輯

**路由**：`/dashboard/duty/[date]`

**佈局**：

頂部顯示日期與星期，下方是該日所有營業時段的列表。每個時段是一個可展開的卡片：

```
┌─ 10:00 ──────────────────────────────────┐
│  [店長 A 頭像]  店長 A                      │
│  身份：店長    參與：主服務                   │
│                                            │
│  [分店長 B 頭像]  分店長 B                   │
│  身份：分店長   參與：協助服務                 │
│                                            │
│  [+ 新增人員]                               │
└────────────────────────────────────────────┘
```

**新增人員流程**：

1. 點擊「+ 新增人員」
2. 選擇人員（下拉：顯示所有 ACTIVE 的 Staff）
3. 選擇身份（DutyRole 下拉，根據 Staff 的 UserRole 自動帶入預設值）
4. 選擇參與方式（ParticipationType 下拉）
5. 選填備註
6. 儲存

**快速操作**（位於單日編輯頁的頂部工具列）：

**操作一：複製到整天**

- 按鈕位置：每個時段卡片右上角
- 觸發方式：點擊某一時段卡片的「複製到整天」按鈕
- 行為：將**該時段**的所有值班人員安排（含每人的 DutyRole、ParticipationType），複製到**該日其他所有營業時段**
- 範例：10:00 有店長 A（主服務）+ 分店長 B（協助），點擊後 → 11:00、14:00、15:00... 全部填入相同的兩人安排
- 衝突處理：目標時段若已有安排，**不覆蓋**，僅補入不存在的人員（以 staffId 判斷）
- 確認流程：顯示「將 10:00 的值班安排複製到該日其他 N 個時段，已有安排的時段不會被覆蓋。確定？」

**操作二：從前一天複製**

- 按鈕位置：單日編輯頁頂部工具列
- 觸發方式：點擊「從前一天複製」按鈕
- 行為：讀取**前一個營業日**（跳過公休日）的所有值班安排，複製到**當天的對應時段**
- 範例：今天是週二，前一個營業日是週一。週一 10:00 有店長 A、11:00 有店長 A + 分店長 B → 複製後，週二 10:00 填入店長 A、11:00 填入店長 A + 分店長 B
- 前提條件：當天必須是空的（沒有任何值班安排）。若已有安排，按鈕灰掉不可用，tooltip 顯示「今天已有值班安排，請手動調整」
- 確認流程：顯示「將 4/7（週一）的值班安排複製到今天（4/8 週二），確定？」
- 時段對齊：只複製雙方都存在的營業時段。例如週一營業到 20:00、週二只到 18:00，則 19:00 的安排不會複製

**操作三：複製到本週其他日期**

- 按鈕位置：單日編輯頁頂部工具列
- 觸發方式：點擊「複製到本週其他日期」按鈕 → 彈出多選日期面板
- 行為：將**當天整日**的所有值班安排，複製到**使用者勾選的本週其他日期**
- 日期選擇面板：顯示本週一 ~ 週日，每天一個 checkbox，公休日灰掉不可選。當天也不可選（已是來源）
- 範例：目前在編輯週一。勾選週二、週四、週五 → 將週一的值班安排複製到這三天
- 前提條件：目標日期必須是營業日
- 衝突處理：目標日期若已有安排，彈出二次確認「週二已有 3 筆值班安排，複製後將全部覆蓋。確定？」→ 確認則**清除目標日所有現有安排後再寫入**
- 時段對齊：同「從前一天複製」邏輯，只複製雙方都存在的營業時段

### 4-3. Sidebar 導航

在現有 sidebar 加入值班管理入口，建議放在「預約管理」和「顧客管理」之間：

```
📊 Dashboard
📅 預約管理
👥 值班安排    ← 新增
👤 顧客管理
...
```

---

## 五、前台預約邏輯串接

### v1 策略：值班安排決定可預約時段

v1 即啟用值班與前台預約的聯動。核心規則：

> **可預約時段 = 營業時間內 且 至少有 1 位值班人員**

具體判斷邏輯（依序檢查）：

1. **該日是否營業**：查 SpecialBusinessDay → 若 type=closed/training 則整日不可約（維持現有邏輯）
2. **該時段是否開放**：查 BusinessHours + SlotOverride → 若 disabled 則不可約（維持現有邏輯）
3. **該時段是否有人值班**：查 DutyAssignment → `WHERE date = 目標日 AND slotTime = 目標時段`，若查無任何紀錄，則該時段**不可預約**（新增邏輯）
4. **該時段是否還有名額**：查已預約數量 vs capacity（維持現有邏輯）

**影響範圍**：

- **前台自助預約**（`/(customer)/book/new`）：產生可選時段時，排除沒有值班安排的 slot。顧客只會看到有人值班的時段。
- **後台代約**（`/dashboard/bookings/new`）：同樣排除無值班時段。但 OWNER 可以勾選「略過值班檢查」強制建立（處理臨時加約的情況）。
- **現有預約不受影響**：已建立的 Booking 不會因為事後刪除值班安排而被取消或變更。

**實作位置**：

目前前台時段產生邏輯在 `src/lib/slot-generator.ts` 的 `generateSlots()` + 後端查 SlotOverride。新增的值班檢查應加在「slot 產生之後、回傳前台之前」的查詢層（Server Action / Query），不要改 `generateSlots()` 本身：

```typescript
// src/server/queries/booking.ts（現有的可預約時段查詢）
// 在產生 slots 之後，加入值班篩選：

const dutySlots = await prisma.dutyAssignment.findMany({
  where: { date: targetDate },
  select: { slotTime: true },
  distinct: ["slotTime"],
});
const dutySlotSet = new Set(dutySlots.map(d => d.slotTime));

// 過濾：只保留有值班的 slot
const availableSlots = generatedSlots.filter(
  slot => dutySlotSet.has(slot.startTime)
);
```

**後台預約增強**：

1. **預約日檢視**：在 `/dashboard/bookings` 的日檢視或月曆上，旁邊顯示該時段的值班人員，讓店長排預約時知道誰在。
2. **完成預約時的輔助**：當 `markBookingCompleted` 時，如果 `serviceStaffId` 為空，可以建議從該時段的 DutyAssignment 中選擇（PRIMARY 角色優先）。

**邊界情況處理**：

- 如果某天所有時段都沒排值班 → 該日所有時段對前台顯示為不可約（但不影響 BusinessHours 的營業狀態）
- 如果值班是在營業時間開始後才安排 → 安排完成後即時生效，前台會立刻看到新開放的時段
- OWNER 後台代約可略過值班檢查 → 不強制每筆預約都要有值班（處理例外）

### v2 策略：進階容量關聯（未來）

v2 可以加入：

- 根據值班人員數量動態調整 slot capacity（例如：每位主服務 / 協助服務人員可服務 N 人）
- 在前台預約頁面顯示「本時段服務人員：XXX」
- 可在 ShopConfig 關閉值班聯動（回退到純 capacity 模式），做為功能開關

---

## 六、Server Actions 設計

### 檔案位置

```
src/server/actions/duty.ts      → 寫入操作
src/server/queries/duty.ts      → 讀取查詢
```

### 主要 Action

```typescript
// ---- 寫入 ----

// 新增或更新單筆值班安排（upsert by date+slotTime+staffId）
upsertDutyAssignment(data: {
  date: string;           // "YYYY-MM-DD"
  slotTime: string;       // "HH:mm"
  staffId: string;
  dutyRole: DutyRole;
  participationType: ParticipationType;
  notes?: string;
})

// 批次安排：將某人安排到某日的多個時段
batchCreateDutyAssignments(data: {
  date: string;
  slotTimes: string[];    // ["10:00", "11:00", "14:00", ...]
  staffId: string;
  dutyRole: DutyRole;
  participationType: ParticipationType;
})

// 複製到整天：將某時段的安排複製到該日所有其他營業時段（不覆蓋已有安排）
copySlotToAllSlots(data: {
  date: string;
  sourceSlotTime: string;  // 來源時段 "HH:mm"
})

// 從前一個營業日複製（當天必須無安排，跳過公休日找前一天）
copyFromPreviousBusinessDay(data: {
  targetDate: string;
})

// 複製到本週其他日期（覆蓋模式：先清除目標日再寫入）
copyToWeekDates(data: {
  sourceDate: string;
  targetDates: string[];   // ["2026-04-08", "2026-04-10", ...]
})

// 刪除單筆
deleteDutyAssignment(id: string)

// 清除某日某時段的所有值班
clearSlotDutyAssignments(date: string, slotTime: string)

// 清除某日所有值班（複製到本週其他日期 的前置操作）
clearDateDutyAssignments(date: string)

// ---- 查詢 ----

// 查某天的所有值班安排（含 Staff 資訊）
getDutyByDate(date: string): DutyAssignment[]

// 查某週的所有值班安排（週檢視用）
getDutyByWeek(weekStart: string): DutyAssignment[]

// 查某人某月的值班紀錄（報表用）
getStaffDutyByMonth(staffId: string, month: string): DutyAssignment[]

// 查某天某時段的值班人員（預約頁面輔助顯示）
getSlotDutyStaff(date: string, slotTime: string): DutyAssignment[]
```

### 日期處理

所有日期操作必須遵守 `docs/date-time-rules.md` 的規範：

- 使用 `src/lib/date-utils.ts` 的 `toLocalDateStr()` 取得台灣日期
- DutyAssignment.date 與 Booking.bookingDate 格式一致（`@db.Date`，UTC midnight）
- slotTime 為台灣時間的 "HH:mm"
- 禁止 `new Date().toISOString().slice(0, 10)` 用於判斷營業日

---

## 七、驗證規則

### 寫入驗證（Zod Schema）

```typescript
// src/lib/validators/duty.ts

const dutyAssignmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  staffId: z.string().min(1),
  dutyRole: z.enum(["STORE_MANAGER", "BRANCH_MANAGER", "INTERN_COACH", "HOURLY_STAFF"]),
  participationType: z.enum(["PRIMARY", "ASSIST", "SHADOW", "SUPPORT"]),
  notes: z.string().max(200).optional(),
});
```

### 業務規則

1. **Staff 必須 ACTIVE**：不能安排 INACTIVE 的 staff 值班
2. **日期必須是營業日**：不能在 SpecialBusinessDay(type=closed) 的日期安排值班
3. **時段必須在營業時間內**：slotTime 必須是該日 BusinessHours 生成的合法 slot
4. **唯一約束**：同一日期 + 時段 + 人員只能有一筆（DB 層 @@unique 保證）
5. **不驗證過去日期**：允許回補歷史值班紀錄（營運紀錄用途）

---

## 八、版本規劃

### v1（本次開發）

| 項目 | 說明 |
|------|------|
| Prisma schema | 新增 DutyRole、ParticipationType enum 和 DutyAssignment model |
| Migration | 建表 + index，為現有 Staff 新增 duty.read / duty.manage 預設權限 |
| 常數檔 | `src/lib/duty-constants.ts`：Enum 中英對照、簡稱、DutyRole 自動帶入映射 |
| Zod 驗證 | `src/lib/validators/duty.ts` |
| Server Actions | upsert / batch / copySlotToAllSlots / copyFromPreviousBusinessDay / copyToWeekDates / delete / clear |
| Server Queries | getDutyByDate / getDutyByWeek / getStaffDutyByMonth / getSlotDutyStaff |
| 權限 | duty.read + duty.manage，寫入 `src/lib/permissions.ts` 的 ALL_PERMISSIONS 和角色預設 |
| 前台預約聯動 | 可預約時段 = 營業時間內 且 至少有 1 位值班人員（修改現有 slot 查詢邏輯） |
| 後台代約 | OWNER 可勾選「略過值班檢查」強制建立 |
| 週檢視頁面 | `/dashboard/duty` 週表格，格式：`顯示名稱(參與簡稱)` |
| 日編輯頁面 | `/dashboard/duty/[date]` 時段卡片 + 人員管理 + 三個快速複製操作 |
| Sidebar | 加入「值班安排」入口，用 `duty.read` 控制顯示 |
| 後台預約增強 | 預約日檢視旁顯示該時段值班人員 |

### v2（未來）

| 項目 | 說明 |
|------|------|
| 動態容量 | 根據值班人員數量調整 slot capacity（例如每位主服務可服務 N 人） |
| 值班範本 | 每週固定模板，一鍵套用（取代手動複製） |
| 報表 | 人員值班時數統計、參與類型分佈 |
| 前台顯示 | 預約頁面顯示「本時段服務人員：XXX」 |
| 自動帶入 serviceStaff | 完成預約時根據值班安排自動填入 serviceStaffId |
| 衝突提示 | 同一人同時段被安排在不同地點時提醒 |
| 功能開關 | ShopConfig 加入值班聯動開關，可關閉回退到純 capacity 模式 |

---

## 九、實作注意事項

### 與現有系統的整合點

1. **BusinessHours / SpecialBusinessDay / SlotOverride**：值班安排的可用時段必須參照這三個 model。產生可選時段時，重用 `src/lib/slot-generator.ts` 的 `generateSlots()`，再疊加 SpecialBusinessDay 和 SlotOverride 的覆寫。

2. **Staff model**：新增兩個 relation（DutyStaff、DutyCreatedBy），不影響現有欄位。

3. **權限系統**：在 `src/lib/permissions.ts` 的 `ALL_PERMISSIONS` 和各角色預設中加入 `duty.read` 和 `duty.manage`。Migration 時需要為現有 Staff 新增這兩個 permission 的預設值（參考現有 `createDefaultPermissions` 的邏輯）。

4. **Dashboard Layout**：值班安排頁面需在頂部做 `checkPermission("duty.read")` UI 檢查，寫入操作需檢查 `duty.manage`。

5. **Sidebar**：在 `src/components/sidebar.tsx` 新增「值班安排」項目，用 `duty.read` 控制顯示。

### 日期處理提醒

- DutyAssignment.date 用 `@db.Date`（與 Booking.bookingDate 一致）
- 讀出後 `.toISOString().slice(0, 10)` 是安全的（因為是 DB Date 欄位）
- 建立時用 `new Date(dateStr + "T00:00:00.000Z")`（與 `bookingDateToday()` 同邏輯）
- 週檢視的「本週」判斷必須用 `toLocalDateStr()` 取台灣時間

### 效能考量

- 週檢視查詢：`WHERE date >= weekStart AND date <= weekEnd`，配合 `@@index([date])` 應該夠快
- 日檢視查詢：`WHERE date = targetDate`，配合同 index 沒問題
- 如果未來資料量大（例如半年以上），可考慮加上 `@@index([date, dutyRole])` 做篩選查詢
