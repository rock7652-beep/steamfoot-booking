# Design System — 使用規範

## 元件總覽

| 元件 | 用途 | 檔案 |
|------|------|------|
| KpiCard | 指標卡片 | `kpi-card.tsx` |
| SectionCard | 區塊容器 | `section-card.tsx` |
| AlertCard | 警示卡片 | `alert-card.tsx` |
| PeriodToggle | 時段切換器 | `period-toggle.tsx` |
| EmptyState | 空狀態 | `empty-state.tsx` |
| ErrorState | 錯誤狀態 | `error-state.tsx` |
| Skeleton | 載入骨架 | `skeleton.tsx` |

---

## KpiCard 使用規則

**必須使用的頁面：**
- Dashboard 首頁 — 今日預約 / 人數 / 已完成 / 顧客 / 營收
- Ops Dashboard — 今日營運 6 卡
- 任何需要呈現 KPI 指標的區域

**規則：**
- 有前期比較資料時，必須帶 `change` prop
- 顏色語意：primary=預約, green=完成, amber=營收, red=異常, earth=一般, blue=新增
- 不可在 KpiCard 內嵌套其他元件

---

## SectionCard 使用規則

**必須使用的頁面：**
- Dashboard 首頁所有區塊
- Ops Dashboard 所有區塊
- 任何 `rounded-2xl bg-white p-5 shadow-[...]` 的區塊

**規則：**
- 標題放 `title`，不要在 children 裡再加 `<h2>`
- 有「查看更多」連結時使用 `action` prop
- 副標題（如「近 30 天」）使用 `subtitle` prop

---

## AlertCard 使用規則

**級別標準：**
- `info` — 資訊提示，不需立即處理（藍色）。例：今日無預約
- `warning` — 需要注意，建議處理（琥珀色）。例：有 NO_SHOW 未處理
- `error` — 嚴重問題，需立即處理（紅色）。例：對帳失敗

**規則：**
- 必須提供 `title` + `description`
- 建議提供 `action`（下一步動作連結）
- 不用於表單驗證錯誤（表單用 inline error）

---

## PeriodToggle 使用規則

**固定選項：**
- 趨勢圖時間範圍：`7 天` / `30 天`（可選加 `90 天`）
- 指標切換：依頁面需求自定

**規則：**
- 預設選中第一個選項
- 選項不超過 4 個
- 泛型支援：可用於任意 string union type

---

## EmptyState 使用規則

**四種變體：**
- `empty` — 尚無資料（預設）。例：尚無顧客資料
- `search` — 查無結果。例：沒有符合條件的顧客
- `lock` — 尚未開通。例：此功能需升級才能使用
- `settings` — 尚未設定。例：尚未設定營業時間

**規則：**
- 必須提供 `title`（說明現在的狀態）
- 必須提供 `description` 或 `action`（告訴使用者下一步）
- 不可只顯示文字而不用此元件

---

## ErrorState 使用規則

**規則：**
- 必須提供 retry 機制（`retry` prop 或 `backHref`）
- 不可顯示技術錯誤訊息（error.message / stack trace）
- 用語用「載入失敗」「暫時無法取得」，不用「Error」「Exception」

---

## Skeleton 使用規則

**規則：**
- 每個 `loading.tsx` 必須使用 skeleton，不可空白頁面
- Skeleton 須模擬實際頁面結構（KPI 卡數量、表格列數）
- 統一色調：`bg-earth-50` / `bg-earth-100` / `bg-earth-200`
- 統一動畫：`animate-pulse`

**可用元件：**
- `KpiSkeleton` — KPI 卡片區域
- `TableSkeleton` — 表格區域
- `SectionSkeleton` — SectionCard 區域
- `DashboardSkeleton` — 完整 Dashboard 頁面

---

## 狀態系統規範

所有頁面必須支援四種狀態：

```
Loading  → 使用 Skeleton（必須有載入動畫）
Empty    → 使用 EmptyState（必須說明 + 下一步）
Error    → 使用 ErrorState（必須可重試，不顯示技術訊息）
Success  → 操作回饋（toast / 狀態更新 / 畫面變化）
```

讓使用者在任何情況下都知道：現在發生什麼 → 下一步做什麼。

---

## 成功回饋規範（Toast）

**使用 Sonner（已全局配置）。**

**文案規則：**

| 操作類型 | Toast 文案範例 | 語氣 |
|----------|---------------|------|
| 新增成功 | `已新增顧客「{name}」` | 陳述事實 |
| 修改成功 | `已更新顧客資料` | 簡短確認 |
| 刪除成功 | `已刪除交易紀錄` | 簡短確認 |
| 儲存成功 | `設定已儲存` | 簡短確認 |
| 狀態更新 | `預約已標記為出席` | 明確新狀態 |

**規則：**
- 成功用 `toast.success()`，失敗用 `toast.error()`
- 文案開頭用「已」（已新增、已更新、已刪除），不用「成功」
- 包含關鍵識別資訊（顧客名、預約時間等），但不超過一行
- 失敗文案必須說明原因，不可只顯示「操作失敗」
- 不需要為每次頁面載入顯示 toast

---

## 按鈕互動狀態規範

**兩種按鈕元件：**

### SubmitButton（表單內）
- 自動偵測 `useFormStatus()` pending 狀態
- 用於 `<form action={serverAction}>` 內

### ActionButton（非表單）
- 手動管理 4 種狀態：`idle → loading → success → idle`
- 用於 onClick handler 場景（狀態切換、快速操作）

**4 種狀態：**
```
idle     → 顯示 label，可點擊
loading  → Spinner + pendingLabel，disabled
success  → 綠勾 + "完成"（500ms 後回到 idle）
disabled → 灰化，不可點擊
```

**Variant 語意：**
- `primary` — 主要操作（新增、儲存、確認）
- `secondary` — 次要操作（取消、返回）
- `danger` — 破壞性操作（刪除、取消預約）

---

## CTA 文案規則

**EmptyState 的 CTA 必須符合情境：**

| 情境 | CTA 文案 | 避免 |
|------|----------|------|
| 無資料 | "新增第一位顧客" / "建立方案" | "新增" / "建立" |
| 查無結果 | "清除篩選" / "調整條件" | "重新搜尋" |
| 未設定 | "前往設定" / "開始設定" | "設定" |
| 未開通 | "了解方案" / "升級" | "開通" |

**規則：**
- CTA 用動詞開頭，描述具體動作
- 包含操作對象（"新增顧客" 而非 "新增"）
- 首次使用場景加上「第一」（"新增第一位顧客"）
