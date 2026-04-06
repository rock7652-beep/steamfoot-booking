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
