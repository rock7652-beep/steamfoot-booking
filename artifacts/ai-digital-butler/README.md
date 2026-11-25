# AI 數位店長驗收證據

- `ai-panel-*.png` / `ui-results.json`：實際 AI panel + SettingsListRow，六種 Chromium 模擬尺寸，固定合成資料／替代 actions。不是登入後完整業務、雲端 Preview 或真實裝置驗收。
- `credential-setup-20261125.json`：使用者批准後的分支變數範圍、角色期限與待驗網路狀態，不含憑證值。
- `hosted-postflight.json`：既有 steamfoot-preview 隔離資料庫的 schema、RLS、受限角色與停用狀態；沒有正式站或真實 API 請求。
- 產生介面證據：`node scripts/qa/ai-digital-butler-ui.mjs`。編譯 JS/CSS 忽略版本控制。
- 核心／獨立 PostgreSQL 連線驗證及未驗項目見 `docs/ai/digital-butler-acceptance.md`。
