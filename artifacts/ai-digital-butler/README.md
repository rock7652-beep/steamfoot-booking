# AI 數位店長驗收證據

LINE 格式離線合成事件補驗：[summary](line-synthetic/summary.json)、[信任邊界與限制](../../docs/ai/digital-butler-line-synthetic-acceptance.md)。只新增測試 driver，沒有新 Preview 或正式 Webhook 介接。

最新 Mock 串接證據：[summary](routing/summary.json)、[驗收與限制](../../docs/ai/digital-butler-routing-acceptance.md)。最終 b25 四店停止／重送及 15 組 RWD，ec6 四店完整 Mock 情境；版本不能混為同一次執行。

歷史知識管理證據：[Phase 2 summary](phase2/summary.json)、[驗收與限制](../../docs/ai/digital-butler-knowledge-acceptance.md)。以下保留 Phase 0/1 歷史。

## 最新隔離 Preview（2026-11-26 台灣時間）

- `hosted-results.json`：版本、受保護 URL、認證入口、四合成店／四產業 Mock、去重／人工接手／跨店、兩筆真實 API、CI、RWD 與收尾狀態；不含密碼、Cookie 或金鑰。
- `hosted-live-luna.png`：3568ee775 真實 Luna 成功選擇來源後的核准回覆。
- `hosted-steamfoot-*.png`：3568ee775，1920／1366／1024／768／390／360，含原頁首及側欄。
- `hosted-beauty-*.png`、`hosted-fitness-*.png`、`hosted-music-*.png`：c33eba33c，1366／1024／768；後續僅 Provider／來源契約修正，UI／auth 未變，保留原始來源。
- 以上為 Chromium 視窗模擬，不是實體裝置、原生四模組全業務或真實通路驗收。
- `preview-runtime-20261125.json`：依序保留失敗／修正及當時狀態，`finalResult` 指向最新結果；歷史的 0 請求／NOLOGIN 等不得當目前值。

## 初次本機／環境準備（歷史）

- `ai-panel-*.png`／`ui-results.json`：實際 AI panel + SettingsListRow，固定合成資料／替代 actions，六尺寸與七操作情境；不是雲端認證後證據。
- `credential-setup-20261125.json`：批准後的分支變數範圍、角色期限及當時待驗網路狀態，無憑證值。
- `hosted-postflight.json`：初次隔離 schema／RLS／角色停用快照，不是目前登入或模型狀態。
- 本機重現介面：`node scripts/qa/ai-digital-butler-ui.mjs`；編譯 JS/CSS 不進版控。

單一維護紀錄：[驗收與限制](../../docs/ai/digital-butler-acceptance.md)、[Runbook](../../docs/ai/digital-butler-runbook.md)、[工程契約](../../docs/ai/digital-butler-core.md)。
