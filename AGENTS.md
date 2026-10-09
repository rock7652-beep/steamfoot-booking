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
- Staff 相關頁面必須檢查 `staff.view`；管理操作須檢查 `staff.manage` 與 Owner / Manager / Staff 階層，不能只以 OWNER 角色判斷
- Server action 必須用 `requirePermission()` 做後端檢查（不可只靠 UI）
- 權限矩陣文件：`docs/role-permission-matrix.md`


## 蒸管家 UI／Settings Framework

凡涉及以下工作，開始前必須先閱讀 `docs/STEAMFOOT_UI_Settings_Framework.md`，並以該文件作為設計、開發與驗收基準：

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

## 全站 RWD 預設要求

- 官網、HQ、所有模組後台、顧客／工作前台與 LINE LIFF 的新增或修改 UI，MUST 依 Framework 第 40 節納入 RWD；不需要使用者再次提出。
- 共用元件按自身可用寬度排列，保留桌機密度、字級、觸控操作及編輯狀態；表格只在區塊內捲動。
- UI PR 必須列明受影響入口、驗收尺寸、結果與限制；官網／前台驗手機，後台驗桌機與 iPad，共用元件驗窄容器。靜態 fixture 或登入受阻不得寫成完整業務驗收。

## 全站視窗資料載入

- 右滑／彈窗新增或修改時遵守 Framework 第 41 節與 `docs/panel-loading-inventory.md`。
- client 資料讀取共用 panel reader／client read cache；已由 props 提供的資料直接顯示，設定面板沿用路由預讀。
- 現金、額度、名額及修訂資料維持權威查詢；快取與 stale 摘要不可取代後端授權或交易檢查。

## 操作指南維護範圍（2026-10-09）

- 使用者已決定：操作指南只維護店家與總部後台。僅新增、更新、優化後台操作文章、搜尋詞及必要截圖。
- 會員專區與「我的工作」不提供操作指南；不得重建入口或新增／修訂前台教學。前台若難懂，應簡化介面與功能設定。
- 既有課程前台 CP 系列文章及盤點歷史僅作封存，不計入現行待驗收／缺漏題數，也不得標記為已驗收。
- 後台文章可說明設定對顧客／教師的影響，仍須從後台管理者的任務撰寫，不新增前台逐步教學。
