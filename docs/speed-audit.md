# Speed Audit v1 — 店長核心流程速度巡檢

這是一套**背後工程巡檢工具**，不是給店長看的功能。目的：主動、固定地檢查店長每天最常用的頁面 / 按鈕 / Drawer / 搜尋 / 表單，是否「點了有反應、搜尋快、Drawer 立即開、送出有 loading、系統忙也不卡」。

> ⚠️ v1 為**報告制**，全程 **read-only**，只跑 **Preview / Staging**，**不碰 production**、**不改任何資料**。

---

## 它量什麼（與既有 server 計時的差別）

| 層 | 量什麼 | 來源 |
|---|---|---|
| **Client 感知延遲**（本工具） | 點擊→第一個 UI 反應、Drawer 開啟、搜尋回應、送出按鈕 loading、背景 RSC 筆數、console error、5xx | Playwright 在 Preview 量 |
| **Server SSR 耗時**（既有） | 每頁 server render 毫秒、是否破 SLA | 正式站 log `[PERF]` / `[PERF:SLA_BREACH]`（`src/lib/perf.ts`、`src/lib/sla.ts`） |

兩者**互補**：本工具看「使用者感覺」，server log 看「伺服器耗時」。

---

## 怎麼跑

```bash
# 1) 安裝瀏覽器（首次）
npx playwright install chromium

# 2) 設環境變數（用 staging 帳號，禁用正式帳號）後執行
SPEED_AUDIT_BASE_URL=https://<your-preview>.vercel.app \
SPEED_AUDIT_EMAIL=owner@staging.local \
SPEED_AUDIT_PASSWORD=*** \
npm run speed-audit
```

環境變數（見 `e2e/speed-audit/.env.example`）：

| 變數 | 必填 | 說明 |
|---|---|---|
| `SPEED_AUDIT_BASE_URL` | ✅ | Preview / Staging URL。**缺少 fail-fast；命中 `steamfoot.com` 直接 abort。** |
| `SPEED_AUDIT_EMAIL` / `SPEED_AUDIT_PASSWORD` | ✅ | staging 店長帳密；不可 hardcode 進 repo |
| `SPEED_AUDIT_SEARCH_QUERY` | — | 搜尋關鍵字（≥2 字），預設「測試」 |

---

## 涵蓋範圍（v1）

**A. 預約管理** — 進入 `/dashboard/bookings`、點日期開當日 Drawer、新增預約入口、顧客搜尋、新增補課入口、體驗預約 Drawer、完成/未到/取消「按鈕是否立即 loading/可用」（不送出）。

**B. 顧客管理** — 進入 `/dashboard/customers`、搜尋顧客、點 row 開 Drawer、Drawer/skeleton 是否立即出現、編輯顧客入口、新增預約入口、匯出「沒進頁就偷跑 `/api/export/customers`」（不點擊匯出）。

> C.（收款/方案/營收）不在 v1。涉及金流，留待後續 PR 用唯讀方式量。

---

## 速度門檻（`e2e/speed-audit/fixtures/thresholds.ts`）

| 指標 | warn | fail |
|---|---|---|
| 頁面進入有畫面/loading | >1s | — |
| 單一步驟總時 | >2s | >5s |
| Drawer 開啟 | >0.5s | — |
| 顧客搜尋 | >1s | — |
| 送出按鈕未立即 disabled/loading | — | fail |
| 背景 RSC 請求數 | >10 | — |
| Console error | — | fail |
| 5xx / unexpected response | — | fail |

v1 **不**當 CI hard gate：門檻只反映在文字報告。

---

## 報告長相

跑完輸出文字表格到 stdout，並存檔到 `e2e/speed-audit/.report/`（已 gitignore）。每步一行：`step / reaction / rsc / err / verdict`，結尾附 pass/warn/fail/skip 統計與「Preview ≠ prod」警語。`➖ skip` = 資料相依步驟在當前 staging 無法執行（例：當日無預約）。

---

## ⚠️ Preview 快 ≠ 正式站快

正式站受 `connection_limit=1`（`src/lib/db.ts`）＋ Supabase pooler 影響，serverless 單連線會排隊；Preview/staging 通常沒這壓力。因此：

- **本工具在 Preview 量「UX 行為正確性」很準**（有無 loading、有無背景 request storm、有無 error）。
- **「絕對速度數字」不能只信 Preview** — 正式站可能更慢。最容易落差的：當日 Drawer + 三按鈕、`/bookings/new` 載入、顧客搜尋、顧客詳情 waterfall。

---

## 如何對照正式站 log

跑完巡檢後，到 **Vercel → Project → Logs** 比對同一頁：

| filter | 看什麼 |
|---|---|
| `[PERF:SLA_BREACH]` | 哪頁 server render 破門檻（bookings/customers 200ms、customer detail 300ms） |
| `[PERF]` | 單頁 `totalMs` + `spans`（哪個 query 慢） |
| `[PERF:ERROR]` | query 失敗 |
| `[DASHBOARD_SUMMARY] fail` / `[GROWTH] fail` | 首頁/經營區降級 |

> 認 deploy 看 `githubCommitSha`，別只看 alias。v1 為人工對照；自動化（拉 Vercel log API join）留待後續 PR。

---

## 安全護欄（read-only 保證）

1. **base URL 把關**：缺值 fail-fast、命中 production domain abort（`fixtures/env.ts`）。
2. **全域 mutation 護欄**：abort 所有非 GET 請求（server action POST / PUT / PATCH / DELETE）（`fixtures/metrics.ts` `installMutationGuard`）。即使誤觸按鈕也不送達後端。
3. **dialog 一律 dismiss**：取消預約等 native `confirm()` 不會被接受。
4. **登入** 走 `/hq/login` UI，session 存 `.auth/`（gitignore），帳密只從環境變數讀。

### 已知取捨 / 待調整（first-run tuning）

- 由 server action 回資料的 Drawer 內容（顧客詳情 / 預約詳情）會被護欄一併擋下 → v1 只量「Drawer 開啟 + skeleton 立即出現」，不量內容載入完成時間。
- 護欄被擋的 mutation 會 hold 約 600ms 再 abort，讓送出按鈕 loading 可被觀測；連帶的網路錯誤噪音已被 console-error 過濾，不算 fail。
- 預約明細的「完成/未到/取消」需當日有預約；無預約時記為 `skip`。
- 部分選擇器（日曆 cell、預約明細按鈕、體驗預約入口）為 best-effort，首次對真實 staging 執行時可能需微調。

---

## v1 不做

不改 UI / DB / schema / production；不送出完成/未到/取消/收款/指派方案；不真的匯出；不接 CI hard gate；不一次掃全站；不做效能優化（跑出慢只記錄，修速度另開 PR）。
