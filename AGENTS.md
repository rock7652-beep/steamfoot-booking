<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 開發約定

## 日期與時區

- 全系統統一 UTC+8 (Asia/Taipei)，規則文件：`docs/date-time-rules.md`
- 所有「今天」「本月」判斷必須使用 `src/lib/date-utils.ts` 的共用函式
- **禁止** `new Date().toISOString().slice(0, 10)` 用於判斷營業日
- **禁止** 各檔案自行宣告 `TZ_OFFSET` 或手算時區偏移
- 正確用法：`toLocalDateStr()`、`toLocalMonthStr()`、`todayRange()`、`monthRange()`、`dayRange()`
- 唯一例外：DB 日期欄位（bookingDate、entryDate、birthday）讀出後 `.toISOString().slice(0, 10)` 是安全的

## 權限檢查

- 每個 dashboard 頁面（含 new/edit 子頁）必須在頁面頂部做 `checkPermission()` UI 檢查
- Staff 相關頁面必須加 `user.role !== "OWNER"` → `notFound()` 檢查
- Server action 必須用 `requirePermission()` 做後端檢查（不可只靠 UI）
- 權限矩陣文件：`docs/role-permission-matrix.md`


## 蒸管家 UI／Settings Framework

凡涉及以下工作，開始前必須先閱讀 `docs/STEAMFOOT_UI_Settings_Framework_v1.0.md`，並以該文件作為設計、開發與驗收基準：

- UI／UX 調整
- 設定介面
- 新增功能或既有功能優化
- 跨模組共用元件
- Settings Center / Settings Panel / Reminder Center
- 桌機／iPad 後台介面
- 清單、提醒、方案管理與操作流程

執行原則：

1. 優先使用既有共用骨架與元件，不為單一模組複製一套。
2. 共用的是操作與呈現，不硬統一各模組業務規則。
3. 密度不得靠縮小字體取得；狀態先顯示，需要修改才展開。
4. UI 相關變更必須完成 Preview，並檢查桌機與 iPad。
5. 未取得使用者明確授權，不得合併正式站。
