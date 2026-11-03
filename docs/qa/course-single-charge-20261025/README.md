# 音樂／新版運動單次收費與體驗（2026-10-25）

## 結果與規則

- 沿用 CoursePlanDraftForm 與設定儲存回執，不新增第二套管理頁。音樂／新版運動新增預設單次（一堂），既有方案保留原單位與堂數；可切換多次方案。
- 指定項目的單次收費保存一般售價、一般時間、體驗價、體驗時間與本收費可安排人員。體驗價 NULL 不開放、0 免費；體驗時間 NULL 沿用一般時間。人員須為本店啟用且具該項目資格，不改寫整個教學項目的資格。
- 新版運動開放選課沿用店家預設體驗費，時間依實際課次。指定項目方案與開放選課通用卡各自選擇，不混用適用範圍。
- 排課從權威收費設定取價及時間，依選定人員過濾可排時段，仍檢查資格、教室、營業時間與衝突。建立課次時保存 chargeSnapshot；原收費改價不回算已排課。重送使用原課次快照，防止重複建立。
- 新體驗與既有名單加體驗共用 reserveCourseInTransaction，保存 TRIAL、trialPrice 及實際課次時間。加入已排團課沿用該課時間，不重設整堂課時長。一般付費／持卡流程沿用現有邏輯。
- 分析維持 TRIAL／一般；出席看 bookingKind 與出席狀態、轉換看後續購買、收入看實收及沖銷，不用設定價推估。免費體驗不變成一般課。

## 儲存與發布

新增可空 JSONB 欄位：CoursePointPlan.chargeSettings、CourseSession.chargeSnapshot。NULL 保留既有行為，未回填／搬動歷史紀錄。遷移來源：prisma/migrations/20261025170000_course_single_charge/migration.sql，並更新 course-prisma/schema.prisma。

此輪僅修改工作區，未合併 main、未部署、未操作正式資料庫。發布前須先套用這個追加遷移並重新產生 Prisma client；須在具登入與測試資料的 Preview 再驗證真實排課、收款與分析流程。

## 驗證範圍

- 17 個測試檔，193 項通過：單次設定、免費體驗、效期、獨立人員、模式切換、失敗與重送、課卡、收款、分析及既有美業表單回歸。
- PGlite 執行實際追加 SQL，檢查原資料保持 NULL；修改收費設定後，已建立課次的快照不變。
- Chromium 以真實共用表單與合成資料驗 1366×900、1024×768、768×1024、390×844，音樂／運動各四組，無水平溢出、縮放保留草稿；開放選課不顯示個別體驗價與時間。
- 畫面為合成本機 Preview，後端呼叫受阻，不能視為登入後端到端業務驗收。預覽結果見 preview-results.json，截圖見 music-768.png、sports-1024.png。
- TypeScript 全專案檢查通過；變更檔 ESLint 無錯誤，兩項既有未使用變數警告保留。git diff --check 通過。不執行會連線或遷移資料庫的 npm build。

## 重現

離線測試使用 scripts/qa/beauty-ui-block-network.cjs 預載，阻擋網路／資料庫 sockets。畫面腳本：scripts/qa/course-single-charge-browser.mjs，需 Playwright 與 /usr/bin/chromium；透過 PLAYWRIGHT_PATH 指定已安裝套件。
