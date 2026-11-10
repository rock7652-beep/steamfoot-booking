# 課程排課、進度與會員介面交付檢查

分支：`fix/course-schedule-progress-ui-20261110`。
已整合正式分支 `a9f97129b4fb0bfdb42848ed813535b6d1fcf9ae`（PR #1532），保留新版混合排課、課表預載及統一顧客總覽。本批沒有 schema、migration、GitHub workflow 或 Vercel 設定變更。

## 交付內容

1. 原生舞蹈／運動單次排課可一次安排 1–53 週；固定每週／隔週維持永久系列。開放選課同時安排固定學員的既有功能保留。
2. 名單原地開啟學員資料，背景課表／日期／篩選不切換；沿用最新顧客總覽與預讀。
3. 原生堂數方案的上課進度每排 5 格，實際授予幾堂就幾格，只填已出席或有效補登日期；共卡核對全部使用人可見性。點數及來源／總堂數不可核對者保留完整明細，不猜日期。其他模組未串接資料讀取。
4. 名單方案欄收窄，原地卡片詳情上限 640px，完整歷史預設收合。
5. 會員課程卡片刪除明細切換、確認會到、體驗不扣方案說明、單人數量與同日重複日期；停用取消時不顯示取消截止，聯絡提示合併。仍保留必要金額、出席、期限、請假與取消規則，LINE 通知確認原流程保留。

## 同步後驗證

- 修改到的測試及相關回歸共 20 檔、271 項 Vitest 通過。
- 全專案 TypeScript 通過：Node 8GB heap，`tsc --noEmit --incremental --tsBuildInfoFile /tmp/course-release-merged.tsbuildinfo`。
- 所有變更的 JS／TS／MJS ESLint 無錯誤；`course.ts` 的既有 `musicStore` 未使用警告保留，未修改無關程式。
- `git diff --check` 通過，合併衝突已解決。
- 已重跑單次週數、原地學員／格子、會員精簡卡片三個 Chromium 合成預覽；後台 1440、1366、1024、768、600px，會員 1366、768、390、360px，檢查無整頁橫向溢出。共用腳本適配最新版總覽與下次預約讀取，未用過期預覽驗證新版。
- 圖與結果：`/tmp/sports-single-weeks-ui/`、`/tmp/course-roster-customer-ui/`、`/tmp/course-portal-direct-actions-ui/`。這是模擬尺寸、合成資料及後端替身，沒有正式資料交易、登入後完整業務或真機驗收。

## 尚未發布及授權邊界

僅完成本地 commit／同步及 patch，未 push、建 PR、部署、合併 main 或執行 migration。
現有 CI 在 PR 執行 lint、測試與型別檢查；Vercel git 設定只逐一列出停用分支，本分支沒有明確停用規則，因此上傳可能觸發預覽建置。專案 build 包含 `scripts/ci-migrate.mjs` 與其他環境 preflight，尚未證實本分支託管預覽的資料隔離；不得把推送當成純上傳或擅改部署設定放行。

依 AGENTS.md 第 65 行，正式合併需使用者明確授權；依 release-check Skill 第 11 行，push／PR、Preview、正式發布需分別確認。本批已可供檢閱，下一步需確認要授權的上傳／預覽／正式發布範圍。正式資料庫與環境任何寫入仍須按其實際影響核對，未因本地測試通過視為已獲准。
