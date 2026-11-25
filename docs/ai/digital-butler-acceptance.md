# AI 數位店長驗收紀錄（2026-11-25）

狀態：Phase 0/1 可安全實作已交付；雲端與真實 API 驗收未完成。不得作為正式發布或店家試營運通過證據。

## 版本與執行範圍

- 最新 main 在開工與交付前均核對為 `378cd9475317f6c4ab804f0e48642f1d4f0f567a`。
- 支線 `feat/ai-digital-butler-core`；首個部署隔離守衛 commit `62ebc3ea7`。完整候選 head 以本次 PR／交付訊息為準，避免自我引用 commit。
- 本機 Node 24.19.0，Vitest 4.1.4，PGlite 及獨立 Docker PostgreSQL 16。Docker 無網路、無公開 port，兩個獨立連線驗證 row lock，不以同一 JS 記憶體鎖冒充多 instance 控制。
- Hosted 只對既有 `steamfoot-preview`／`ttworfzgwejdeolegkxl`（Postgres 17）安裝 AI 私有表、受限角色與四個新合成店；沒有正式 migration 或真實營運資料異動。

## 通過的工程檢查

| 檢查 | 結果與範圍 |
| --- | --- |
| 目標回歸 | 49 個測試檔、657 項通過。包含 AI Provider／repository／service／action／Page／工具與隔離守衛、既有數位管家（含 LINE/Messenger）、人工交接、權益三態、LINE 綁定、課程取消／改期、四模組提醒、美業存取與設定入口。不是全站所有測試或 E2E。 |
| 指南盤點 | 新增後台共用測試指南、205 題／96 題待登入驗收狀態同步；3 個指南測試檔、25 項通過，保留歷史完整 main 盤點基準。 |
| PostgreSQL 併發／角色 | 上述含 3 項獨立 Docker PostgreSQL 測試：跨連線最後預算競爭、重送事件原子去重、隔離 fixture 與限制角色（無 Booking 寫入、非 AI fixture 被 RLS 隱藏）。 |
| 遷移守衛 | 實際執行 `scripts/ci-migrate.mjs`，使用合成、不可用 DB credentials，成功在連線前輸出 migrations_skipped；錯誤連線與環境 provenance 由純函式測試拒絕。 |
| 預算日期邊界 | 使用現行 `dayRange`／`monthRange` 的 inclusive end；驗證台灣換日與月底最後一個 millisecond 仍計入額度。 |
| 型別 | `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`；先依最新 main 重新 generate 三個 Prisma client，無 DB 連線或 migration。 |
| ESLint／diff | 變更的核心、UI、測試、守衛與瀏覽器驗收腳本 ESLint 通過，`git diff --check` 通過。 |

657 項回歸後，另修正新遷移守衛測試的 TypeScript `NODE_ENV` 環境型別宣告，重新執行該核心守衛檔（29 項）及型別檢查。產品程式行為未因這個測試環境宣告改變。交付審查另補共用 feature helper 在全部門市／空 scope 的 AI 拒絕行為，新增一項權限案例並重跑該權限／呈現／Page 測試。657 + 25 + 新權限案例共 683 個不同案例。

重跑主要回歸時設定 `AI_LOCAL_POSTGRES_REHEARSAL=1`，測試用的 `DIGITAL_BUTLER_ENCRYPTION_KEY` 使用公開的全零合成 fixture；不是店家或 OpenAI Key。不啟用 Docker opt-in 時，那 3 項會跳過，不能據此報告已完成獨立 PostgreSQL 驗收。

## 安全與功能案例

- 四模組共用相同核心，只有本店已發布且有效的來源可成為回答。B 店、錯模組、草稿與過期來源被排除；模型追加 storeId／tool 欄位或輸出未知來源不能擴權。
- 會員、工具、退款等未知事項轉人工；接手後後續 AI 停止，直到明確恢復。模型等待中關店家開關或真人接手，晚到答案被抑制。
- 重送事件不增加第二次 reservation／模型呼叫；scope 納入店家、通路、通路帳號及可信 actor。
- HQ 授權與角色在伺服器驗證；前端多傳 storeId 或任意文字無法寫入。正式店 ID、全部門市、無角色權限、未授權與 expired grant 全部拒絕。
- AI 與原數位管家獨立：AI-only grant 不查詢或掛載確定性流程；原數位管家有授權而 AI 關閉時，不讀 AI persistence，原編輯器仍可使用。
- 成本先預留；未知成本不釋放，過額／超 Tokens 停全域；併發不能繞過 US$20。實際發送的 API schema、server-only Key、單次 transport、錯誤遮罩均用 Mock transport 驗證。
- 即使 AI branch 帶有互相衝突的 production/test 旗標，外部整合仍被阻擋。沒有開放真實 LINE／Messenger 或會員資料查詢。

## RWD 與操作證據

執行 `node scripts/qa/ai-digital-butler-ui.mjs`，使用 `/usr/bin/chromium`。實際 `AiButlerPanel` 與共用 `SettingsListRow`，替代 server actions、阻斷外部網路；不是認證後的完整後台、Vercel Preview 或真實 iPad／手機。

| Chromium 模擬尺寸 | 結果 |
| --- | --- |
| 1920×1080 | 無整頁水平溢出，控制可操作 |
| 1366×900 | 同上 |
| 1024×768 | 同上 |
| 768×1024 | 同上 |
| 390×844 | 同上 |
| 360×800 | 同上 |

7 項操作案例通過：展開、確認後切換開關、旋轉／尺寸變化保留選擇、回覆測試、人工接手／恢復、儲存失敗保留狀態、網路中斷沿用原 eventId。可見的主要按鈕／選擇框至少 44px，高寬變化不清除狀態，console page error 0。人工檢視 1366 與 390 截圖。

適用操作情境：01（立即顯示 RSC props／合成首次狀態）、03（確認儲存後更新）、06（錯誤就地且狀態保留）、09/10（角色／店家由 action 與 Page 測試）。02 搜尋、04 真實交易、05 切月、07 詳情清單、08 大量名單本次未新增，無此介面；不因沒有這些測試而宣稱全站情境通過。未量測認證後冷／暖端到端時間，沒有性能改善宣稱。

證據在 [artifacts/ai-digital-butler](../../artifacts/ai-digital-butler/README.md)，含六張截圖、`ui-results.json`、`hosted-postflight.json`。

## Hosted postflight 與阻擋

已確認：4 張 AI 表啟用 RLS、anon 無請求表讀取權、四家合成店全部 enabled=false、global stopped=true、請求數 0。新角色無 bypass RLS、無 Booking 寫入，現在 NOLOGIN。Supabase security advisors 已查詢，未出現 AiButler 相關 finding；不是全專案安全零風險聲明。

Vercel 在使用者明確「批准」後，已成功存入新產生的 DATABASE_URL、DIRECT_URL、AI_IDENTITY_SECRET（Sensitive、僅指定 Preview branch），並補上停發／停用／模型費率設定，共 10 個支線變數。沒有重用正式憑證；Production、Development、其他支線未改。角色 LOGIN 有效至 2026-12-02 22:15:52（台灣時間），仍無 bypass RLS／Booking 寫入權限。暫存憑證檔已刪除，不含於 Git 或 PR。

實際設定的隔離 guard 與 migration runner 通過，global stopped=true、enabledStores=0、requests=0。參見 `artifacts/ai-digital-butler/credential-setup-20261125.json`；先前 `hosted-postflight.json` 的 NOLOGIN 是取得新批准之前的歷史快照。

實際 PostgreSQL 網路登入未驗：本 Cloud 執行器連到 pooler 5432/6543 出現拒絕或逾時，管理 connector 也不具 SET ROLE 權限；未增加 admin membership 繞過。目錄檢查不能當成執行環境連線成功。Vercel 執行環境的網路登入／Mock 驗收通過之前，AI 保持全域停止，Key 設定本身不會啟用模型。

原 head 的 GitHub targeted tests、Typecheck、changed ESLint 與三項 Postgres 整合 job 通過；Full Vitest baseline 為 17,457 通過、19 失敗、337 跳過，19 個失敗都來自過往指南測試把本次新目錄 205 題寫死為 204 題。已更新相關當前總數、96 題待驗與 17 題累計新草稿期待值，保留歷史驗收與來源基準，40 個指南測試檔／212 項在本機重驗通過；待新 head 的 CI 重驗。這與原 658 個核心／權限／回歸案例合計 870 個不同本機案例。

Vercel 分支部署查詢仍為 0 筆，沒有新增 Vercel 建置或 OpenAI 請求。現有 Cloudflare Workers Builds 額外回報失敗；GitHub output 僅有 Build ID、無 annotations 或原因，未聲稱是預期 guard，也未改 Cloudflare 或重跑其建置。精確 AI scope 仍拒絕 Cloudflare provider claim，正式站路由與設定未變。

## 未驗及待下一階段

- Vercel 執行環境的隔離角色網路登入、合成登入帳號準備、認證後 server action + UI；branch DB / HMAC Secret 已寫入。
- 使用者親自設定 OpenAI Key 後的最小真實 Responses 相容性／Token 與費用測試；支線環境設定已確認，下一步請使用者僅在該 Preview 支線自行設定 Key。
- 必要的一次隔離 Preview build、全頁含側欄的 RWD／登入流程、真實裝置與 LIFF 業務驗收。
- Phase 2 的知識管理／權威營運設定 adapter、原 Webhook 未命中整合、原真人客服工作台接手、對話保留清理實作與帳號資料控制核對。
- Phase 3 的身分驗證業務讀取／受控預約交易、正式 migration／正式 API Project／店家試營運均未執行。

正式站未受本支線影響，正式 AI 未啟用。未新增付費服務；隔離 DB 儲存與 GitHub CI 使用既有服務計費，雲端建置及實際 API 後續可能產生成本，未估算為永久免費。
