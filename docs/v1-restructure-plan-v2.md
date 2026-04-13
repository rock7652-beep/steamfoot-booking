# 蒸足系統 v1 重整計畫（v2 — 最終執行版）

> 產出日期：2026-04-13
> 核心定位：**人才培育與開店複製系統**
> 核心問題：「誰是下一個會開店的人？」

---

## 〇、主體模型確認（回應第 1 點）

### 現狀分析

目前系統有三層身分模型：

```
User（認證帳號）
  ├── Staff（營運角色：STORE_MANAGER / COACH）
  └── Customer（人才管道主體：顧客 → 常客 → ... → 店長）
```

關鍵事實：

- `User.id` 是認證主體，`Staff` 和 `Customer` 都透過 `userId` 指向同一個 User
- `Customer.userId` 是 **nullable**：有些顧客是店長手動建立的、尚未註冊
- `Staff` 和 `Customer` **可以同時存在**（同一個 User 可以既是 Staff 又是 Customer）
- 人才管道的所有欄位（`sponsorId`、`talentStage`、`stageChangedAt`）都掛在 `Customer` 上

### 設計決策：Customer 作為「人的主檔」

```
Customer = 人才管道的主體（所有人都有 Customer 紀錄）
Staff    = 營運權限的疊加層（PARTNER / OWNER 額外擁有）
```

當一個人從 CUSTOMER 升級到 PARTNER 時：
1. 他的 `Customer` 紀錄保留，`talentStage` 更新為 `PARTNER`
2. 系統額外建立一筆 `Staff` 紀錄，賦予營運權限
3. `sponsorId`、`totalPoints`、`Referral` 全部掛在 `Customer` 上，不受 Staff 影響

這個設計的好處：
- 人才管道的連貫性：從顧客到店長，同一筆 Customer 紀錄一路追蹤
- Sponsor 關係不分角色：顧客可以推薦顧客，合作店長也可以推薦顧客
- 不需要建新 model：現有 Customer 已經承擔「人的主檔」角色

需要確保的規則（程式碼層）：
- `updateTalentStage` 升到 PARTNER 時，自動檢查並建立 Staff 紀錄
- `Referral.referrerId` 指向 `Customer.id`（不是 Staff.id 也不是 User.id）
- `PointRecord.userId` 欄位名雖叫 userId，實際指向 `Customer.id`（schema 中改名為 `customerId` 更清晰）

---

## 一、Schema 變更（含本次微調）

### 1.1 Referral Model（不變）

```prisma
enum ReferralStatus {
  PENDING      // 已登記，尚未到店
  VISITED      // 已到店
  CONVERTED    // 已成為顧客
  CANCELLED    // 取消/無效
}

model Referral {
  id                  String         @id @default(cuid())
  storeId             String
  referrerId          String         // 誰介紹的（Customer.id）
  referredName        String         // 被介紹人姓名
  referredPhone       String?        // 被介紹人電話
  status              ReferralStatus @default(PENDING)
  convertedCustomerId String?        // 轉為顧客後連接
  note                String?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  store              Store     @relation(fields: [storeId], references: [id])
  referrer           Customer  @relation("ReferralsMade", fields: [referrerId], references: [id])
  convertedCustomer  Customer? @relation("ReferralConverted", fields: [convertedCustomerId], references: [id])

  @@index([storeId])
  @@index([referrerId])
  @@index([status])
}
```

### 1.2 Points Model（MVP 精簡版 — 回應第 2 點）

```prisma
enum PointType {
  // ── MVP 第一版（僅 5 種）──
  REFERRAL_CREATED     // 轉介紹登記 → +10
  REFERRAL_VISITED     // 被介紹人到店 → +20
  REFERRAL_CONVERTED   // 被介紹人成為顧客 → +30
  ATTENDANCE           // 出席（Booking COMPLETED）→ +5
  BECAME_PARTNER       // 升為合作店長 → +100

  // ── 第二階段預留（先宣告 enum，但 v1 不觸發）──
  // REFERRAL_PARTNER   // 被介紹人成為合作店長 → +100
  // SERVICE            // 服務 → +5
  // SERVICE_NOTE       // 填寫服務紀錄 → +3
  // BECAME_FUTURE_OWNER // 成為準店長 → +200
  // MANUAL_ADJUSTMENT  // 管理員手動調整
}

model PointRecord {
  id         String    @id @default(cuid())
  customerId String    // 積分對象（Customer.id）
  storeId    String
  type       PointType
  points     Int       // 正數=加分
  note       String?
  createdAt  DateTime  @default(now())

  customer  Customer  @relation(fields: [customerId], references: [id])
  store     Store     @relation(fields: [storeId], references: [id])

  @@index([customerId])
  @@index([storeId])
  @@index([createdAt])
}
```

MVP 給分配置：

| Type | 分數 | 觸發時機 |
|------|------|---------|
| `REFERRAL_CREATED` | +10 | 建立 Referral 時 |
| `REFERRAL_VISITED` | +20 | Referral status → VISITED |
| `REFERRAL_CONVERTED` | +30 | Referral status → CONVERTED |
| `ATTENDANCE` | +5 | Booking status → COMPLETED |
| `BECAME_PARTNER` | +100 | TalentStage → PARTNER |

### 1.3 Customer 新增欄位

```prisma
model Customer {
  // ... 現有欄位 ...

  totalPoints         Int        @default(0)  // 積分快取

  // 新 Relations
  referralsMade       Referral[]     @relation("ReferralsMade")
  referralsConverted  Referral[]     @relation("ReferralConverted")
  pointRecords        PointRecord[]
}
```

### 1.4 Readiness 計算公式（保守版 — 回應第 3 點）

```typescript
// 維持現有四維度，Points 只作為「參考值 / 額外顯示」
interface ReadinessMetrics {
  referralCount: number;       // 推薦人數（sponsor tree）
  referralScore: number;       // 0-25：min(referralCount * 5, 25)
  attendanceCount: number;     // 出席次數（COMPLETED bookings）
  attendanceScore: number;     // 0-25：min(floor(attendanceCount / 2), 25)
  attendanceRate: number;      // 出席率 0.0-1.0
  attendanceRateScore: number; // 0-25：round(attendanceRate * 25)
  daysInStage: number;         // 在現階段天數
  timeScore: number;           // 0-25：min(floor(daysInStage / 12), 25)
  // ↓ 新增：僅顯示，不納入分數計算
  totalPoints: number;         // 行動積分（參考用）
}

// Readiness 分數 = referralScore + attendanceScore + attendanceRateScore + timeScore
// 與現有公式完全相同，不動
// Points 只在 UI 上額外顯示，方便店長綜合判斷
```

第二階段再考慮是否將 Points 納入 Readiness 權重。

---

## 二、執行計畫 — 雙版本拆分（回應第 4 點）

---

### 🅰️ 最小可上線版（MVP — 目標 10 天）

> 目標：Referral 功能可用 + 人才 Dashboard 有核心卡片 + 顧客詳情頁看得到人才資訊
> 不動角色名稱、不動權限架構、不移除任何現有功能

#### Phase A1：Schema 新增（2 天）

| # | 任務 | 檔案 | 說明 |
|---|------|------|------|
| A1.1 | 新增 `ReferralStatus` enum | `schema.prisma` | 4 個狀態 |
| A1.2 | 新增 `PointType` enum | `schema.prisma` | MVP 僅 5 種 |
| A1.3 | 新增 `Referral` model | `schema.prisma` | 含 index |
| A1.4 | 新增 `PointRecord` model | `schema.prisma` | `customerId` 指向 Customer |
| A1.5 | Customer 加 `totalPoints` 欄位 | `schema.prisma` | `@default(0)` |
| A1.6 | Customer 加 Referral relations | `schema.prisma` | `ReferralsMade` + `ReferralConverted` |
| A1.7 | Store 加 `referrals` + `pointRecords` relations | `schema.prisma` | — |
| A1.8 | 執行 `prisma migrate dev` | — | 驗證無錯誤 |
| A1.9 | 更新 seed 加入示範 Referral 資料 | `seed.ts` | 方便開發測試 |

#### Phase A2：Referral 後端（2 天）

| # | 任務 | 檔案 | 說明 |
|---|------|------|------|
| A2.1 | Referral Zod validator | `src/lib/validators/referral.ts` | create / updateStatus |
| A2.2 | Referral types | `src/types/referral.ts` | DTO + 常數 |
| A2.3 | `createReferral` action | `src/server/actions/referral.ts` | 建立轉介紹 + 自動 +10 積分 |
| A2.4 | `updateReferralStatus` action | `src/server/actions/referral.ts` | VISITED(+20) / CONVERTED(+30) / CANCELLED |
| A2.5 | `convertReferral` action | `src/server/actions/referral.ts` | 連接 convertedCustomerId + 自動設 sponsorId |
| A2.6 | `getReferralsByStore` query | `src/server/queries/referral.ts` | 全店轉介紹列表 |
| A2.7 | `getReferralsByReferrer` query | `src/server/queries/referral.ts` | 特定人的轉介紹 |
| A2.8 | `getReferralStats` query | `src/server/queries/referral.ts` | 本月轉介紹統計（Dashboard 用） |

#### Phase A3：Points 後端 MVP（1 天）

| # | 任務 | 檔案 | 說明 |
|---|------|------|------|
| A3.1 | Points 配分常數 | `src/lib/points-config.ts` | 5 種 type → 分數 mapping |
| A3.2 | `awardPoints` 內部函式 | `src/server/actions/points.ts` | 建 PointRecord + 更新 totalPoints |
| A3.3 | 整合至 Referral actions | `src/server/actions/referral.ts` | createReferral / updateStatus 觸發給分 |
| A3.4 | 整合至 Booking action | `src/server/actions/booking.ts` | COMPLETED 時觸發 +5 |
| A3.5 | 整合至 Talent action | `src/server/actions/talent.ts` | stage → PARTNER 時觸發 +100 |
| A3.6 | `getPointHistory` query | `src/server/queries/points.ts` | 某人的積分紀錄 |

#### Phase A4：Readiness 微調（0.5 天）

| # | 任務 | 檔案 | 說明 |
|---|------|------|------|
| A4.1 | `ReadinessMetrics` 加 `totalPoints` 欄位 | `src/types/talent.ts` | 僅顯示用 |
| A4.2 | `computeReadinessScores` 查詢加入 totalPoints | `src/server/queries/talent.ts` | 公式不動，多回傳 points |
| A4.3 | Readiness 計算加入 referral count 來源擴充 | `src/server/queries/talent.ts` | 除了 sponsor tree，也計入 Referral 表的已轉介數 |

#### Phase A5：顧客詳情頁 — 人才資訊區塊（2 天）

| # | 任務 | 檔案 | 說明 |
|---|------|------|------|
| A5.1 | 轉介紹區塊 component | `src/app/(dashboard)/dashboard/customers/[id]/referral-section.tsx` | 列出此人的轉介紹紀錄 |
| A5.2 | 積分摘要區塊 component | `src/app/(dashboard)/dashboard/customers/[id]/points-section.tsx` | totalPoints + 最近紀錄 |
| A5.3 | 新增轉介紹 dialog（表單） | `src/components/referral-form.tsx` | 在顧客詳情頁內新增 |
| A5.4 | 狀態更新按鈕（VISITED / CONVERTED） | `src/components/referral-status-actions.tsx` | 快速操作 |
| A5.5 | 整合至顧客詳情頁 | `src/app/(dashboard)/dashboard/customers/[id]/page.tsx` | 載入 + 排版 |

#### Phase A6：Dashboard 人才核心卡片（1.5 天）

| # | 任務 | 檔案 | 說明 |
|---|------|------|------|
| A6.1 | Dashboard query 增加 referral 統計 | `src/app/(dashboard)/dashboard/page.tsx` | 本月轉介紹數 |
| A6.2 | 人才核心指標卡片區塊 | `src/app/(dashboard)/dashboard/talent-kpi-section.tsx` | 合作店長數 · 準店長數 · HIGH+ 人員 · 本月轉介 |
| A6.3 | 接近開店人員提示 | `src/app/(dashboard)/dashboard/talent-kpi-section.tsx` | 名字 + readiness level + 分數 + 積分 |
| A6.4 | 整合至 Dashboard 首頁（OWNER 視角） | `src/app/(dashboard)/dashboard/page.tsx` | 放在 KPI 區上方 |
| A6.5 | 更新人才管道頁顯示 points | `src/app/(dashboard)/dashboard/talent/page.tsx` | readiness 表格加一欄 |

#### Phase A7：驗證（1 天）

| # | 任務 | 說明 |
|---|------|------|
| A7.1 | `next build` 全量編譯 | 無 TS error |
| A7.2 | `prisma migrate deploy` 乾淨 | 無 drift |
| A7.3 | 手動測試：建立轉介紹 → 狀態更新 → 自動積分 | 完整流程 |
| A7.4 | 手動測試：Booking COMPLETED → 自動 +5 | 積分正確 |
| A7.5 | 手動測試：Dashboard 人才卡片顯示 | 數字正確 |
| A7.6 | 手動測試：顧客詳情頁轉介紹 + 積分區塊 | UI 正常 |

#### 🅰️ 小計

| Phase | 說明 | 預估 |
|-------|------|------|
| A1 | Schema 新增 | 2 天 |
| A2 | Referral 後端 | 2 天 |
| A3 | Points MVP | 1 天 |
| A4 | Readiness 微調 | 0.5 天 |
| A5 | 顧客詳情頁 | 2 天 |
| A6 | Dashboard 卡片 | 1.5 天 |
| A7 | 驗證 | 1 天 |
| **合計** | | **~10 天** |

---

### 🅱️ 第二階段（完整版 — MVP 上線驗證後）

> 前提：MVP 已上線運行，收到使用回饋
> 目標：角色正名、完整報表、排行榜、權限細化

#### Phase B1：角色重命名（3 天）

| # | 任務 | 說明 |
|---|------|------|
| B1.1 | UserRole enum 重命名 migration SQL | `STORE_MANAGER → OWNER`，`COACH → PARTNER` |
| B1.2 | 全域搜尋替換 `STORE_MANAGER` → `OWNER` | ~120 處 |
| B1.3 | 全域搜尋替換 `COACH` → `PARTNER` | ~80 處 |
| B1.4 | 更新 `permissions.ts` 角色常數 + labels | — |
| B1.5 | 更新 `role-permission-matrix.md` | — |
| B1.6 | DutyRole enum 簡化 | OWNER / PARTNER |
| B1.7 | `next build` 驗證 | — |

#### Phase B2：Points 完整版（2 天）

| # | 任務 | 說明 |
|---|------|------|
| B2.1 | 新增 PointType：`REFERRAL_PARTNER`、`SERVICE`、`SERVICE_NOTE`、`BECAME_FUTURE_OWNER`、`MANUAL_ADJUSTMENT` | — |
| B2.2 | SERVICE / SERVICE_NOTE 自動觸發 hook | — |
| B2.3 | BECAME_FUTURE_OWNER 自動觸發 hook | — |
| B2.4 | 手動調整積分 dialog（OWNER only） | — |
| B2.5 | REFERRAL_PARTNER 觸發（被介紹人升為 PARTNER 時，回溯給介紹人） | — |

#### Phase B3：三軌報表（3 天）

| # | 任務 | 說明 |
|---|------|------|
| B3.1 | 報表頁 Tab 架構改為三軌 | 服務業績 / 店業績 / 🔥人才業績 |
| B3.2 | 服務業績 tab（服務次數、金額） | — |
| B3.3 | 店業績 tab（總營收、來客數） | — |
| B3.4 | 人才業績 tab | 推薦數 · 轉介紹數 · 合作店長數 · 準店長數 |
| B3.5 | 轉介紹追蹤列表（含篩選） | — |
| B3.6 | 成長事件 timeline | — |

#### Phase B4：排行榜 + Dashboard 強化（2 天）

| # | 任務 | 說明 |
|---|------|------|
| B4.1 | 積分排行 TOP N query | — |
| B4.2 | 積分排行 UI 區塊 | Dashboard 首頁 |
| B4.3 | 人才漏斗視覺化（bar chart） | — |
| B4.4 | PARTNER 視角首頁（簡化版） | 我的積分 · 我的轉介 · 我的顧客 |

#### Phase B5：權限細化 + 清理（2 天）

| # | 任務 | 說明 |
|---|------|------|
| B5.1 | 新增 `referral.read`、`referral.manage` 權限碼 | — |
| B5.2 | 新增 `points.read`、`points.manage` 權限碼 | — |
| B5.3 | PARTNER 預設權限：加 referral.read/manage、talent.read、points.read | — |
| B5.4 | PARTNER 財務隔離：移除 transaction 相關預設權限 | — |
| B5.5 | 移除 SpaceFee 相關 code + schema | — |
| B5.6 | 移除 coach-revenue 頁面 + API | — |
| B5.7 | 更新 seed 資料 | — |

#### Phase B6：驗證（1 天）

| # | 任務 | 說明 |
|---|------|------|
| B6.1 | `next build` 全量編譯 | — |
| B6.2 | 角色重命名後全流程測試 | — |
| B6.3 | PARTNER 視角權限測試 | 不能看財務 |
| B6.4 | 三軌報表數據正確性 | — |
| B6.5 | 排行榜 + 漏斗顯示 | — |

#### 🅱️ 小計

| Phase | 說明 | 預估 |
|-------|------|------|
| B1 | 角色重命名 | 3 天 |
| B2 | Points 完整版 | 2 天 |
| B3 | 三軌報表 | 3 天 |
| B4 | 排行榜 + Dashboard | 2 天 |
| B5 | 權限 + 清理 | 2 天 |
| B6 | 驗證 | 1 天 |
| **合計** | | **~13 天** |

---

## 三、兩版對照總覽

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  🅰️ 最小可上線版（~10 天）                              │
│  ─────────────────────────                              │
│  ✅ Referral model + CRUD + 自動積分                     │
│  ✅ Points MVP（5 種 type）                              │
│  ✅ Readiness 微調（加顯示 points，公式不動）             │
│  ✅ 顧客詳情頁：轉介紹 + 積分區塊                        │
│  ✅ Dashboard：人才核心卡片 + 接近開店提示                │
│  ❌ 不動角色名稱（仍用 STORE_MANAGER / COACH）            │
│  ❌ 不動權限架構                                         │
│  ❌ 不移除任何功能                                       │
│  ❌ 不做排行榜、三軌報表                                 │
│                                                         │
│  上線驗證 → 收集回饋 → 確認方向                          │
│                                                         │
│  🅱️ 第二階段完整版（~13 天）                             │
│  ─────────────────────────                              │
│  ✅ 角色正名（OWNER / PARTNER）                          │
│  ✅ Points 完整版（10+ type + 手動調整）                  │
│  ✅ 三軌報表（服務 / 店 / 人才）                          │
│  ✅ 積分排行榜                                           │
│  ✅ 人才漏斗視覺化                                       │
│  ✅ PARTNER 視角首頁                                     │
│  ✅ 權限細化（referral / points 權限碼）                  │
│  ✅ 清理（移除 SpaceFee、coach-revenue）                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 四、風險與注意事項

### 🅰️ MVP 風險（低）

1. **Schema additive only**：只新增 model / 欄位，不改不刪，零破壞風險
2. **Points 快取一致性**：`awardPoints` 必須在 `$transaction` 內同時建 PointRecord + 更新 totalPoints
3. **Referral 與 Sponsor 的區別**：程式碼中需清楚區分——`sponsorId` 是長期關係，`Referral` 是單次帶人行為；`convertReferral` 時可自動設定 `sponsorId`，但兩者各自獨立追蹤
4. **顧客詳情頁排版**：新增兩個區塊（轉介紹 + 積分），需確認 mobile 上不會過長

### 🅱️ 完整版風險（中）

1. **角色重命名是最大風險**：`STORE_MANAGER` / `COACH` 散布在 120+ 檔案，建議用 codemod 或 IDE 全域重構
2. **DB migration 需手寫 SQL**：Prisma 不支援 enum value rename，需 `ALTER TYPE ... RENAME VALUE`
3. **移除 SpaceFee 前**需確認無其他模組依賴（已確認僅 Staff model + SpaceFeeRecord + dashboard 少量 UI）
4. **PARTNER 權限收窄**需提前通知現有使用者

---

## 五、建議執行順序

```
Week 1-2：🅰️ Phase A1-A3（Schema + Referral + Points 後端）
Week 2-3：🅰️ Phase A4-A6（Readiness + UI + Dashboard）
Week 3  ：🅰️ Phase A7（驗證 + 上線）
         ↓
      收集 1-2 週使用回饋
         ↓
Week 5-6：🅱️ Phase B1-B2（角色重命名 + Points 完整版）
Week 6-7：🅱️ Phase B3-B4（三軌報表 + 排行榜）
Week 7-8：🅱️ Phase B5-B6（權限清理 + 驗證）
```
