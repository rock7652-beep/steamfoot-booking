# 諮詢與體驗版開通：本機候選方案

> 以下保留初版候選與隔離執行歷程。已完成的 f9c81ec UI 驗收、後續雙 Preview／正式 main guard 組合，以及仍待批准的正式步驟，請以 [發布計畫](consultation-release-plan.md) 為準。

基線 main `51cab4ff29d858c9997b1ef7077112c1e47e11b0`。本稿不代表發布或已啟用。

## 保留兩階段

- `/apply`：需求諮詢、店家規模、主要困擾與聯絡意願。官網／Facebook／Instagram 選填。電話和 LINE ID 至少一項，沒有 Email 必填。
- `/pricing/trial`：洽談後準備開通所需的登入／聯絡 Email、LINE 串接與設定資料。繼續使用既有 TrialApplication。
- HQ 同一入口區分「需求諮詢」與「體驗版開通資料」，人工核對店家後才可關聯。禁止依同名或相同 Email 自動配對。
- 聯繫紀錄是管理員手動記錄，不代表已寄送或送达任何訊息。點電話／安全原始連結仍由操作者完成聯繫。

## 收件可靠性

`CONSULTATION_HQ_ENABLED` 必須精確為 `true` 才啟用新資料庫路徑；預設沿用舊 Sheet 收件，不查新表。啟用後：

1. 驗證資料，去除不需聯絡者的聯絡欄位。
2. 以 requestId 唯一鍵寫入 HQ 原始快照；同 ID 同內容 no-op，不同內容拒絕。
3. 如需接收器能力檢查，於 HQ 保存後進行；接收器未就緒保留 HQ 收件與 Sheet 未嘗試狀態。條件式領取第一次 Sheet POST。只有 PENDING 且尚未嘗試過可領取；SENDING 沒有逾時自動重送。
4. 明確回覆才顯示 Sheet 已確認；失敗／中斷標待核對，HQ 已收件仍成功。不能將「HQ 已保存」等同「Sheet／通知全部完成」。
5. 既有 Google Sheet 是原接收器，沒有第二封自動通知，也沒有新 queue、cron 或憑證。

網址資料附加到原 Sheet 的「其他需求」欄，不新增或移動其既有欄位。單次 payload 仍遵守接收器長度上限。Google Apps Script 的標題調整獨立於 GitHub／Vercel，需要另外核准部署後才生效。

## 權限與資料邊界

- 新諮詢資料讀寫要求 ADMIN + staff.manage、功能旗標與嚴格 Preview 連線檢查。原先 HQ auth/layout 可先於頁面層檢查存取 DB；本次受控部署補上 release-bound preflight，在 build、Next config 與三個 DB client 建構／快取使用前驗證精確分支、倉庫、Preview、兩旗標與兩條隔離連線。錯配即停止。公開諮詢 Preview 路由仍在 auth 前檢查隔離設定。開啟 HQ 前先核實實際 build 的安全布林紀錄。
- Preview 一律禁止 Apps Script GET/POST 與所有通知；僅在 CONSULTATION_HQ_ENABLED 與 CONSULTATION_PREVIEW_INTAKE_ENABLED 都為 true、DATABASE_URL/DIRECT_URL 精確指向既有隔離项目且無 override、HQ ADMIN + staff.manage 驗證通過、店名以「【HQ測試】」標記時，才允許合成諮詢寫入隔離 HQ。固定狀態 NOT_SENT_PREVIEW（測試未送），無法領取 Sheet 發送；未登入與未標記資料不能注入。
- 新表 additive SQL 保存在 docs/sql，未放自動 migrations；只經批准套用既有隔離資料庫，未套正式。
- 外部網址 HTTPS、拒絕 credentials／IP／本機位址；社群官方 hostname allowlist。絕不在伺服器抓取申請者提供的網址。
- LINE ID 不是已驗證的使用者連結，不從暱稱或 ID 拼造聊天網址。
- 狀態／關聯更動檢查 revision，聯繫紀錄追加寫入；操作與稽核同一交易。

## 舊資料

沒有匯入任何真實記錄。`scripts/consultation-import-dry-run.ts` 只接受私有本機 review JSON，檢查來源 row、帶時區的 createdAt、原 requestId 與有效 payload、同批 duplicate/conflict；不連 DB、不比對正式既有資料、不支援 apply、不輸出個資。不能用其成功結果宣稱歷史資料已同步。

正式匯入前另需：確認來源列及時區、以原始 requestId 對正式 DB 逐筆 dry-run、審閱異動數與衝突、明確批准 import。缺少既有穩定 ID 的舊列須另行決定可追溯來源鍵，不能自動猜測。

## 發布前門檻（尚未完成）

- 完整測試、typecheck、lint、獨立審閱。
- 經核准在隔離 DB 套用 additive SQL，再啟用上述兩個限定 Preview 旗標；以 HQ 登入和合成資料驗證表單→HQ（無外部發送）。真 PostgreSQL 冪等／併發／FK／revision驗收。
- 隔離桌機1366／寬螢幕、iPad1024×768/768×1024、360/390手機及窄內容區的視覺與實際操作驗收。DOM/mock 測試不等於實際驗收。
- 明確批准分支公開、Draft PR、隔離 Preview。未批准不能推送。首次 push 已包含精確分支 feat/hq-consultation-intake-20261008 的自動 Preview 停用設定，避免公開分支觸發未驗證部署。
- 正式資料庫 schema、功能旗標、正式發布、Apps Script 更新和歷史匯入各依實際授權執行；本候選未執行正式資料庫／正式發布、Apps Script 更新或歷史匯入；隔離執行情況見下方。

## 受控預覽進度（2026-10-08）

- 使用者已批准公開原倉庫的 Draft PR 與既有隔離資料庫測試；PR #1251，首版 head 993b4c28562e943b8a99b616d5f72a048c45fb6b。精確分支 feat/hq-consultation-intake-20261008 的自動 Preview 停用。
- 隔離 migration 20261008011222 已套用兩表 SQL，僅追加 transaction-local lock_timeout=5s、statement_timeout=30s。七組真 PostgreSQL 合成驗收通過並全回滾，兩表均0列；無正式資料或真實名單匯入。
- 兩旗標只設定在該分支的 Preview，未設 production。未讀取或重設資料庫憑證。
- 受控部署所需的 release-bound preflight 會在 migration runner 驗證後直接退出，完全跳過自動 migration。不能把本未合併候選直接部署正式；正式釋出須另審閱轉換。
- 初版遠端四項核心 CI 與工單 PostgreSQL 成功；後續 guard 提交與其 Preview／CI 結果以 PR 最新證據為準。
- 本機視覺驗收仍不列通過。尚待受控 Preview 的 HQ 登入與實際 UI 驗收。
- Supabase 對兩個只檢查 NEW/OLD 的 SECURITY INVOKER trigger functions 提示 mutable search_path；未超出批准 SQL 擅自調整。無 client policies 為刻意的 server-only 設計。
