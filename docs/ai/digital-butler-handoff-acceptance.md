# 隔離待人工處理管理：驗收

2026-11-26（台灣時間），沿用 [PR #1596](https://github.com/rock7652-beep/steamfoot-booking/pull/1596)，補上店長查看本店待人工對話、明確恢復與持久稽核的實際功能。[功能契約](digital-butler-handoff.md)；[結構化證據](../../artifacts/ai-digital-butler/handoff/summary.json)。正式客服與真實通路尚未開放。

## 版本與必要修正

| 版本 | Preview | 驗收結果 |
| --- | --- | --- |
| 676caffeda5128d99b2a145b0bbccdc426e3e4d3 | dpl_CNMaAauSzsMMzjja5dZUNZCedTiL | 建置成功，雲端恢復操作失敗：交易內權限 helper 等待已被交易佔用的唯一連線。沒有成功恢復或寫入 audit；新建的合成接手狀態保留待核對 |
| b1b2363e6ae518016ed4e5ad6ee53b9574a08136 | dpl_44GFQ8sEJaUJqXwtsyk7KQx68Bbp | 恢復、重送、雙視窗衝突與刷新已實際通過，兩輪蒸足操作各新增一筆 audit；仍有 React #418，因此未接受為最終版本 |
| 9b0dde6f40c86926ce27c2d17afb7b9be2250b34 | dpl_ChjN3zYiiLtgc4vENLHR3sLwUrJc | 蒸足、美業成功且無 hydration 錯誤；運動店整頁刷新超過 30 秒，故未接受為四店最終版本 |
| e3dc109aa837437743d42ef17a7c3c50a52bbf47 | dpl_2UqMFpxAmvB2EbNzfoKxAc6M8SKt | 四店登入、局部讀取、確認恢復與原控制同步通過，無瀏覽器錯誤 |

[最終 Preview](https://steamfoot-booking-a9o36q4nn-rock7652-2111s-projects.vercel.app)，保持 SSO 保護。這輪使用四次不同程式版本的必要建置，沒有重建相同 SHA、另開專案／PR、購買 IPv4 或修改全專案機器設定。沿用既有 Turbo，工具沒有單次 Enhanced 選項；實際 Vercel／GitHub 帳單未取得。

單連線問題先由 max=1 的本機 PostgreSQL pool 重現，再修正為交易前完成可寫權限／actor／store 查核；交易內以同一連線與 DB 時間核對 HQ 權益及版本，不提高連線上限。audit 與狀態更新同一交易，失敗回滾。

React 問題已重現為 Node 與 Chrome 的 zh-TW 空白差異：`2026/11/26 下午12:00` 對 `2026/11/26 下午12:00`。改由伺服器以共用 Asia/Taipei formatter 產生展示字串，client 不再重新格式化。UTF-8 SSR → hydrateRoot 的 Chromium 測試以舊程式重現失敗，修正版通過。

運動店整頁刷新同時讀取課表相關資料並超時。改用共用 usePanelReader、TTL 0、服務端重新授權；恢復成功回傳權威快照，同步目前 actor 的測試控制，保留確認、版本及不明結果重試契約，不再重跑整個後台。先前蒸足超時狀態已透過介面恢復，運動店已由最終版本介面核對恢復；沒有直接清除資料庫旗標。

## 本機結果與範圍

- 7 檔／133 個相關測試通過；本機無網路 PostgreSQL 容器的 6 個測試通過，包含兩操作員競爭同一版本、單連線查權限、預算及事件去重。
- 型別與變更檔案 ESLint（零警告）通過。
- 本機真實元件、替代 actions／局部 reader：51 筆資料、25／25／1 分頁，10 個案例、六尺寸通過，包含 SSR 初始化、取消不寫入、結果不明沿用 commandId、衝突、scope 切換、唯讀及讀取失敗不假空清單。`local-ui.json` 與 `local-*.png` 為本機證據，不能當成雲端登入驗收。
- 原待辦使用 AiButlerConversation 同一旗標與版本，未建立第二份對話或虛構原數位管家名單。稽核只存 HMAC actor／scope、操作鍵、版本及時間，不存訊息、LINE ID 或憑證。

## 雲端結果與收尾

最終 e3dc109aa 在四店的原登入入口完成 31 個操作檢查、15 組視窗尺寸，沒有非預期 HTTP 失敗或瀏覽器／hydration 錯誤。蒸足另驗人為中斷後同一命令重試、另一視窗舊版本拒絕與跨店直接網址拒絕。所有店皆驗取消、權威結果移除該列、原控制同步、原流程處理 0 模型呼叫及重新載入後結果持久。運動店先前保留的接手狀態由新介面恢復，未直接清 DB 旗標。

| 店別 | 登入至完整入口 ms | 局部清單刷新 ms | 確認恢復往返 ms | 暖重載 ms | 操作檢查 | 尺寸 |
| --- | --- | --- | --- | --- | --- | --- |
| steamfoot | 17179 | 1852 | 2458 | 3980 | 10 | 6 |
| beauty | 11419 | 1373 | 1859 | 4326 | 7 | 3 |
| fitness | 12829 | 1351 | 1853 | 4038 | 7 | 3 |
| music | 11277 | 1356 | 1866 | 3811 | 7 | 3 |

各路徑每店 n=1，因此該路徑的最小／中位／最大值相同，不宣稱效能 SLA；蒸足恢復時間包含刻意中斷與重試。蒸足六尺寸 1920／1366／1024／768／390／360，其他三店各 1366／1024／768。這是 Chromium 視窗模擬，非實體 iPad／手機。

最終程式 CI [45750372544](https://github.com/rock7652-beep/steamfoot-booking/actions/runs/45750372544) 四項全成功；全量 1,856 檔通過／36 檔跳過，17,578 項通過／340 項跳過，310.27 秒。運動 shared-card、音樂 makeup、混合課程的獨立檢查成功；booking／editorial 依 workflow 條件跳過，未當成已跑通過。CI 原有 canDuty lint 提醒未在本輪擴大修改。

2026-11-26 11:47（台灣時間）總帳核對：47 筆模型請求全 COMPLETE（44 Mock／3 歷史 OpenAI）、估算 1,310 micros 美元維持；65 筆 dispatch 全 COMPLETE，RESERVED／UNKNOWN／CLAIMED 皆零。8 筆 audit＝早期 b1 診斷 2 筆＋9b 蒸足／美業 2 筆＋最終四店 4 筆；本輪沒有新增模型請求。剩餘 1 筆為原先合成接手狀態，未自動解除。四店 Customer／Booking／DigitalButlerLead 皆零；global stopped=true，四店 enabled=false。

四次部署的手動測試通行憑證均撤銷，四合成帳號登入版本已更新；暫存密碼、失敗截圖及程式備份已刪除。DB／Vercel Secret 未輪替或回讀。SSO 保留，無 Production promote／merge；最後純文件／證據提交不另建 Preview。

## 隔離與未驗

只在 ttworfzgwejdeolegkxl 安裝 `ai_preview_handoff_operator_audit`，SQL checksum `06f6b00a9ef123153483687e90ceb7a00dc5c4494871cce5a8bc523f1ddbc6af`。新 audit 表 RLS=true，anon／authenticated 無讀取權；既有 fixture role 僅 SELECT／INSERT、無 UPDATE／DELETE。安全建議掃描未新增該表相關發現，既有建議未擴大處理。

沒有正式 migration、Production／Development／其他 Preview 設定變更、真實 LINE／Messenger／Email 外發、正式顧客／預約／財務資料寫入。原角色、DB 密碼、嚴格 TLS、公用 CA、connection limit 8 與每執行個體一條連線維持。本輪沒有 OpenAI 請求，費用 ledger 不因測試恢復而清除或釋放。

尚未驗真實 OA／Webhook、原流程持久資料庫橋接、真人訊息交付、真人工作台指派／聯絡內容、實體裝置或供應商帳單；這是 Preview 對話管理，不是正式日常客服工作台。Settings Framework 的營運／設定分工保留，正式營運仍應沿用原入口另外介接。原指南 AI-BUTLER-PREVIEW-01 更新步驟與來源，205 題／96 題待完整教學驗收不變。Cloudflare 不在此 Vercel 管理功能路徑，歷史額外 build 問題未處理。本 PR 保持 Draft，不 promote 隔離 Preview 正式。
