# B7-2：功能權限 × 收費方案對照設計

> 建立日期：2026-04-15
> 狀態：第一版規劃完成，部分 UI 已實作

---

## 一、方案定位

| 方案 | DB Enum (PricingPlan) | DB Enum (ShopPlan) | 顯示名稱 | 一句話定位 |
|------|----------------------|-------------------|---------|-----------|
| 體驗版 | EXPERIENCE | FREE | 體驗版 | 零門檻上手，先試再說 |
| **BASIC** | BASIC | BASIC | 基礎版 | 適合單店日常營運 |
| **PRO** | GROWTH | PRO | 專業版 | 適合想培養人才、提升轉介紹與顧客經營的店家 |
| **ALLIANCE** | ALLIANCE | *(PRO 包含)* | 聯盟版 | 適合想建立準店長、複製分店與擴大團隊的店家 |

> 注意：ShopPlan (FREE/BASIC/PRO) 為舊系統，PRO 層包含 ALLIANCE 功能。
> PricingPlan (EXPERIENCE/BASIC/GROWTH/ALLIANCE) 為新系統，已正確分 4 層。

---

## 二、完整功能盤點

### A. 核心營運

| 功能 | 路由 | 說明 |
|------|------|------|
| 首頁 | `/dashboard` | KPI 摘要、今日預約、趨勢分析、人才指標 |
| 預約管理 | `/dashboard/bookings` | 月曆、新增/編輯/取消預約 |
| 顧客管理 | `/dashboard/customers` | 顧客列表、詳情、階段管理、LINE 綁定 |
| 值班安排 | `/dashboard/duty` | 每週值班表、每日排班編輯 |

### B. 營運工具

| 功能 | 路由 | 說明 |
|------|------|------|
| 交易紀錄 | `/dashboard/transactions` | 交易查詢、篩選、匯出 |
| 現金帳 | `/dashboard/cashbook` | 現金收支、月結摘要 |
| 對帳中心 | `/dashboard/reconciliation` | 自動對帳、差異比對 |
| 課程方案 | `/dashboard/plans` | 課程/套票管理（新增/編輯/封存） |
| 報表 | `/dashboard/reports` | 月度/區間基礎報表 |
| 營運儀表板 | `/dashboard/ops` | 即時營運 KPI（目前 MVP 隱藏） |

### C. 人才與顧客經營

| 功能 | 路由 | 說明 |
|------|------|------|
| 人才管道 | `/dashboard/talent` | 升級進度、readiness、候選人排名 |
| 轉介紹管理 | 顧客詳情頁內 | 轉介紹紀錄、帶出人數 |
| 升級進度 | 人才管道頁內 | 各階段人才數量、進度條 |
| 開店準備度 | 人才管道頁內 | readiness 分數、達標項目 |
| sponsor tree | 顧客詳情頁內 | 帶出關係鏈路 |
| 顧客健康評估 | `/dashboard/customers/[id]/health-report` | AI 健康報告 |

### D. 報表分析

| 功能 | 路由 | 說明 |
|------|------|------|
| 店營收報表 | `/dashboard/store-revenue` | 單店營收明細 |
| 合作店長營收報表 | `/dashboard/coach-revenue` | 教練/合作店長業績 |
| 排行榜 | `/dashboard/ranking` | 員工/分店排名（目前 MVP 隱藏） |
| 聯盟數據 | `/dashboard/analytics` | 跨店分析（目前 MVP 隱藏） |

### E. 設定與支援

| 功能 | 路由 | 說明 |
|------|------|------|
| 人員管理 | `/dashboard/staff` | 員工 CRUD、權限矩陣 |
| 方案設定 | `/dashboard/settings/plan` | 升/降級、方案比較 |
| 預約開放設定 | `/dashboard/settings/hours` | 營業時間、特殊日期 |
| 值班排班設定 | `/dashboard/settings/duty` | 排班規則開關 |
| 營運健康中心 | `/dashboard/system-status` | DB/LINE/API 連線檢查 |
| 提醒管理 | `/dashboard/reminders` | 提醒規則、模板、發送紀錄 |
| 學習中心 | `/dashboard/training` | 訓練素材、教學內容 |
| 升級申請 | `/dashboard/upgrade-requests` | 升級審核（MVP 隱藏） |

---

## 三、功能 × 方案 × 顯示方式對照表

### 圖例
- **全開** = 完整功能
- **Soft Lock** = 可見入口 + 升級提示 / 精簡版
- **鎖定** = 選單鎖 + 點擊顯示升級 modal
- **隱藏** = MVP 階段不顯示

| 功能 | 體驗版 | BASIC | PRO | ALLIANCE | 顯示方式 |
|------|--------|-------|-----|----------|---------|
| **核心營運** | | | | | |
| 首頁 | 全開 | 全開 | 全開 | 全開 | 正常 |
| 預約管理 | 全開 | 全開 | 全開 | 全開 | 正常 |
| 顧客管理 | 全開 | 全開 | 全開 | 全開 | 正常 |
| 值班安排 | 全開 | 全開 | 全開 | 全開 | 正常（權限控制） |
| **營運工具** | | | | | |
| 交易紀錄 | 鎖定 | 全開 | 全開 | 全開 | 體驗版顯示鎖 + BASIC badge |
| 現金帳 | 鎖定 | 全開 | 全開 | 全開 | 同上 |
| 對帳中心 | 鎖定 | 全開 | 全開 | 全開 | 同上（ownerOnly） |
| 課程方案 | 鎖定 | 全開 | 全開 | 全開 | 同上 |
| 報表 | 鎖定 | 全開 | 全開 | 全開 | 同上 |
| 店營收報表 | 鎖定 | 全開 | 全開 | 全開 | 體驗版顯示鎖 + BASIC badge |
| 營運儀表板 | 鎖定 | 鎖定 | 全開 | 全開 | MVP 隱藏 |
| **人才經營** | | | | | |
| 人才管道 | Soft Lock | Soft Lock | 全開 | 全開 | 低方案：可見入口 + PRO badge + 升級提示 |
| 升級進度 | 鎖定 | 鎖定 | 全開 | 全開 | 人才管道頁面內 soft lock |
| 轉介紹分析 | 鎖定 | 鎖定 | 全開 | 全開 | 顧客詳情頁區塊鎖 |
| 開店準備度 | 鎖定 | 鎖定 | 部分 | 全開 | PRO 顯示簡版、ALLIANCE 完整 |
| sponsor tree | 鎖定 | 鎖定 | 鎖定 | 全開 | ALLIANCE 獨佔 |
| **報表分析** | | | | | |
| 合作店長營收報表 | 鎖定 | 鎖定 | 鎖定 | 全開 | 低方案：說明頁 + ALLIANCE badge |
| 排行榜 | 鎖定 | 鎖定 | 全開 | 全開 | MVP 隱藏 |
| 聯盟數據 | 鎖定 | 鎖定 | 鎖定 | 全開 | MVP 隱藏 |
| **設定** | | | | | |
| 人員管理 | 鎖定 | 全開 | 全開 | 全開 | 體驗版顯示鎖 + BASIC badge |
| 方案設定 | 全開 | 全開 | 全開 | 全開 | 正常（ownerOnly） |
| 預約開放設定 | 全開 | 全開 | 全開 | 全開 | 正常 |
| 值班排班設定 | 全開 | 全開 | 全開 | 全開 | 正常（ownerOnly） |
| 營運健康中心 | 全開 | 全開 | 全開 | 全開 | 正常（ownerOnly） |
| **其他** | | | | | |
| 提醒管理 | 鎖定 | 全開 | 全開 | 全開 | 體驗版顯示鎖 + BASIC badge |
| 學習中心 | 鎖定 | 鎖定 | 全開 | 全開 | 低方案顯示鎖 + PRO badge |

---

## 四、Soft Lock 規格

### 層級 1：選單層 Soft Lock

**已實作** — `LockedNavItem` 元件

| 情境 | 呈現 |
|------|------|
| 功能被方案鎖定 | 淡灰文字 + 鎖頭 icon |
| 點擊鎖定項目 | 彈出 UpgradePrompt modal，列出升級後解鎖的能力 |
| badge 提示 | 鎖定項目旁顯示所需方案 badge |

### 層級 2：頁面層 Soft Lock（規劃中）

適用：人才管道（低方案可進入但看到精簡版）

| 區域 | BASIC 以下 | PRO | ALLIANCE |
|------|-----------|-----|----------|
| 人才總數摘要 | 可見 | 可見 | 可見 |
| 候選人排名 | 鎖定 + 升級 CTA | 全開 | 全開 |
| readiness 詳情 | 鎖定 | 簡版 | 完整 |
| sponsor tree 視圖 | 鎖定 | 鎖定 | 全開 |

**建議文案：**
- 「升級 PRO 解鎖完整人才管道，追蹤團隊成長」
- 「升級 ALLIANCE 解鎖開店準備度與複製分析」

### 層級 3：區塊層 Soft Lock（規劃中）

適用：顧客詳情頁的轉介紹、人才指標區塊

| 區塊 | 低方案 | 高方案 |
|------|--------|--------|
| 基本資料 | 全開 | 全開 |
| 轉介紹紀錄 | 顯示總數，明細鎖定 | 全開 |
| 人才指標 | 隱藏 | 全開 |
| AI 健康評估 | 鎖定 + CTA | 全開 |

---

## 五、前端顯示規則

### 選單 Badge

| 方案 | 顏色 | 文字 |
|------|------|------|
| BASIC | `bg-primary-100 text-primary-700` | BASIC |
| PRO | `bg-amber-100 text-amber-700` | PRO |
| ALLIANCE | `bg-indigo-100 text-indigo-700` | ALLIANCE |

### 頁面內升級提示文案

| 情境 | 文案 |
|------|------|
| 人才管道被鎖 | 「升級專業版，開始追蹤團隊人才成長」 |
| 轉介紹被鎖 | 「升級專業版，了解每位顧客的轉介紹成果」 |
| 開店準備度被鎖 | 「升級聯盟版，完整掌握準店長開店準備度」 |
| 合作店長營收被鎖 | 「升級聯盟版，查看合作店長的營收貢獻」 |
| 進階報表被鎖 | 「升級專業版，用數據驅動經營決策」 |

### 升級按鈕

| 位置 | 文案 |
|------|------|
| UpgradePrompt modal | 「立即升級」+「查看方案比較」 |
| 頁面內 CTA | 「查看升級方案」/「解鎖完整功能」 |
| 區塊鎖定 CTA | 「升級我的方案」 |

---

## 六、最小可行實作建議

### 已完成（本輪）

| 項目 | 檔案 | 說明 |
|------|------|------|
| Feature flags 新增 | `src/lib/feature-flags.ts` | 新增 talent_pipeline、referral_analytics 等 6 個 feature |
| ShopPlan feature 新增 | `src/lib/shop-plan.ts` | 新增 TALENT_PIPELINE、STORE_REVENUE 等 feature flags |
| 方案文案更新 | `src/lib/shop-plan.ts` | PLAN_INFO label 與 description 對齊產品命名 |
| 升級文案更新 | `src/lib/upgrade-copy.ts` | PLAN_CAPABILITIES 對齊人才經營定位 |
| 側邊欄 feature gate | `src/components/sidebar.tsx` | 人才管道加 PRO gate、店營收改 BASIC gate |

### 下一步建議（後續輪次）

| 優先級 | 項目 | 說明 |
|--------|------|------|
| P1 | 人才管道頁面 soft lock | PRO 以下進入後顯示精簡版 + 升級 CTA |
| P1 | 顧客詳情頁區塊鎖 | 轉介紹/人才指標區塊依方案顯示 |
| P2 | 開店準備度分層 | PRO 簡版 vs ALLIANCE 完整版 |
| P2 | PricingPlan 與 ShopPlan 統一 | 逐步將 sidebar 遷移到 PricingPlan 系統 |
| P3 | 定價頁更新 | `/pricing` 頁面加入 ALLIANCE 層級 |
| P3 | sponsor tree 視圖 | ALLIANCE 獨佔的複製鏈路分析 UI |

---

## 七、Feature Flag 對照索引

### feature-flags.ts (PricingPlan)

| Feature Key | 最低方案 | 說明 |
|-------------|---------|------|
| basic_booking | EXPERIENCE | 基礎預約 |
| customer_management | EXPERIENCE | 顧客管理 |
| staff_management | EXPERIENCE | 員工管理 |
| duty_scheduling | EXPERIENCE | 值班排班 |
| line_reminder | BASIC | LINE 提醒 |
| transaction | BASIC | 交易紀錄 |
| cashbook | BASIC | 現金帳 |
| basic_reports | BASIC | 基礎報表 |
| talent_pipeline | GROWTH (PRO) | 人才管道 |
| referral_analytics | GROWTH (PRO) | 轉介紹分析 |
| talent_upgrade_progress | GROWTH (PRO) | 升級進度 |
| advanced_reports | GROWTH (PRO) | 進階報表 |
| ai_health_summary | GROWTH (PRO) | AI 健康摘要 |
| kpi_dashboard | GROWTH (PRO) | KPI 儀表板 |
| talent_readiness | ALLIANCE | 開店準備度 |
| coach_revenue | ALLIANCE | 合作店長營收 |
| sponsor_tree | ALLIANCE | 複製鏈路分析 |
| multi_store | ALLIANCE | 多店管理 |
| alliance_analytics | ALLIANCE | 聯盟數據 |

### shop-plan.ts (ShopPlan)

| Feature Key | 最低方案 | 說明 |
|-------------|---------|------|
| TALENT_PIPELINE | PRO | 人才管道 |
| REFERRAL_ANALYTICS | PRO | 轉介紹分析 |
| STORE_REVENUE | BASIC | 店營收報表 |
| COACH_REVENUE | PRO | 合作店長營收 |
| TALENT_READINESS | PRO | 開店準備度 |
| SPONSOR_TREE | PRO | 複製鏈路 |
| CROSS_BRANCH_ANALYTICS | PRO | 聯盟數據 |
