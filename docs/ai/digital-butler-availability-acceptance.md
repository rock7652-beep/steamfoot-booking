# 蒸足空位唯讀工具：隔離驗收

2026-11-26（台灣時間），沿用 [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596) 與 `feat/ai-digital-butler-core`。這是 Phase 3 第一個唯讀介接，不是完整會員查詢、模型自動工具或預約操作。見 [功能契約](digital-butler-availability.md)；[結構化證據](../../artifacts/ai-digital-butler/availability/summary.json)。

## 版本與本機檢查

程式 SHA `d5e840d75e250c3c7f8159209a758f73f88ab60d`；受保護 [Preview](https://steamfoot-booking-fi7lz234p-rock7652-2111s-projects.vercel.app)，deployment `dpl_81LKVW8GdVxtFg8Cr9dNgnHstnhr`。本輪建立一次必要的新程式 Preview；沒有重建相同 SHA 或修改全專案 Build Machine。沿用既有 Turbo，工具沒有單次 Enhanced 選項；Vercel 實際費用尚未取得。

- 15 檔／206 項回歸通過；既有 opt-in PostgreSQL 6 項於這次本機一般命令跳過，不能當成已跑。新增 RLS 演練另 1 項通過，合計 207 項；registry 最後收緊為只接受 READ_ONLY 後，其 19 項直接相關測試重驗通過。
- 型別及變更檔案 ESLint 通過。兩次未指定 heap 的型別執行因 Node 記憶體不足結束；改採 repo CI 同一 `NODE_OPTIONS=--max-old-space-size=6144` 後通過，沒有修改 CI 或專案設定。
- 本機 PGlite 的 RLS 測試包含啟動，首次遇到預設五秒 timeout；將此單一資料庫測試的 timeout 設為三十秒後通過，未變更功能成功判斷。占用名額、跨店、寫入禁止與回復拒讀皆由實際 RLS 驗證。
- 真實 UI 元件以替代 actions／共用 reader 測試九案例及六尺寸：SSR hydration、成功結果、收合保留、更換日期清除舊結果、權威空結果、錯誤不假空值、中斷、舊日期與舊工作區晚到回應。瀏覽器／hydration 錯誤皆零；本機 fixture 不當雲端登入或真機證據。

## 隔離資料庫修正

表層 SELECT 已存在，但 Booking／DutyAssignment 原先沒有該角色可用的列政策，不能據此假設看得見占用人數。只在 `ttworfzgwejdeolegkxl` 套用 `ai_preview_availability_read`，SQL [preview-availability.sql](../../scripts/sql/ai-digital-butler/preview-availability.sql)，SHA256 `7e43aa74fbb1b67f12d8057986b658908d651b28cd63ccb72ad70b297f28181a`。

兩條政策皆為 SELECT、只給既有 `steamfoot_ai_preview_20261125`、只允許 `ai-preview-steamfoot`；其他店／角色／既有政策不變。角色仍無 Booking INSERT／UPDATE／DELETE、無 DutyAssignment UPDATE，無 superuser／bypass RLS，connection limit 8 與嚴格 TLS 不變。安全掃描前後均三筆既有建議、無新增，未擴大修改既有建議。

管理 SQL 工具拒絕 SET ROLE，因此未取得該途徑的雲端角色讀取結果，也未繞過權限。實際雲端讀取須由受保護 Preview 的既有應用連線驗證。沒有新增預約／顧客／值班測試資料；雲端使用既有合成蒸足營業設定（每日 10:00–18:00、每時段 6 人、預約窗 14 天、值班功能關閉），占用及值班有資料的案例在本機驗證。

## 雲端結果與收尾

最終 d5e840d75 的四店登入檢查共 17 個案例通過。蒸足核對 2026-11-27／28 各八個 10:00–17:00 時段、每時段六個空位；相同日期再次查詢有新的 server action 請求，沒有以快取取代權威讀取。超出十四天預約窗顯示已確認的空結果，過去日期由伺服器拒絕；人為中斷顯示讀取錯誤，重試成功，沒有把失敗當成零空位。收合與六尺寸保留結果，重新載入回到原入口；其他三個產業 fixture 不掛載蒸足 adapter。

跨店測試最初只判斷「沒有蒸足查詢區」，不能單獨證明頁面遭拒。另以同一 Preview 補驗：先確認本人合成蒸足頁 200 且共用 AI 區塊存在，再直接進美業網址。既有 dashboard layout 顯示「無法存取此店舖」、共用 AI 區塊與蒸足查詢區都為零。此拒絕畫面 HTTP 為 200，不冒稱 HTTP 403／404；初次補驗的狀態碼／通用 404 判斷不符既有產品機制，查閱 source 後修正 harness，沒有修改應用行為或重建 Preview。證據見 scope-hosted.json 與 steamfoot-foreign-denied.png。

| 路徑 | 觀察值 |
| --- | --- |
| 蒸足登入至完整入口 | 16648 ms，n=1 |
| 蒸足再次載入原入口 | 4051 ms，n=1 |
| 同日期兩次成功查詢 | [1435, 1579] ms；中位 1507、最小 1435、最大 1579 ms，n=2 |
| 新日期／超窗／過去日期／中斷後重試 | [1366, 1348, 1154, 1399] ms，各 n=1 |
| 蒸足整輪首次流程 | 33390 ms，包含六尺寸截圖及人為中斷 |
| 美業／運動／音樂登入至完整入口 | 15872／12534／12090 ms，各 n=1 |

這是 Chromium 視窗模擬 1920／1366／1024／768／390／360，不是真機、強制 Lambda 冷啟動或效能 SLA。原本預期之外的瀏覽器／HTTP 失敗及 hydration 錯誤皆零；蒸足另外保留一次刻意中斷。

程式 [CI 45754811900](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45754811900) 四項成功：1,859 檔／17,603 項通過，36 檔／340 項跳過，全量 408.08 秒。運動 shared-card、音樂 makeup、混合課程檢查成功；booking／editorial 依 workflow 條件跳過，不當成實際跑通過。

收尾帳本維持 47 筆模型請求全部 COMPLETE（44 Mock／3 歷史 OpenAI）、累計估算 1,310 micros 美元；65 筆 dispatch、8 筆接手 audit、原先 1 筆接手旗標均不變，沒有新的模型用量或商業資料。四個 AI fixture 的 Booking／Customer／DigitalButlerLead 均零，隔離 DB 其他既有測試資料總數也未改。global stopped=true、四店 enabled=false，真實外發封鎖維持。

本輪兩個手動測試通行憑證均撤銷，四個合成帳號測試登入版本已更新，補驗蒸足的工作階段也已失效；暫存登入密碼與失敗截圖已刪除。DB 角色密碼、TLS、連線上限及 Vercel Sensitive 均未改動。SSO 保留、PR 保持 Draft，沒有 merge／promote；純文件／證據提交不再建 Preview。

## 未開放範圍

僅後台人員手動驗證新工具；知識 Provider 工具仍關閉，沒有新 OpenAI 呼叫或自動客服接管。美業／音樂／運動 adapter、經身分驗證的會員預約／方案查詢、受控建立／改期／取消、正式 OA／Webhook、日常客服工作台及實體裝置尚未驗證。這次不等同整個 Phase 3 完成，也沒有修改正式站或開啟試營運。
