# LIFF Mini App 內測 SOP

最後更新：2026-05-26（#205～#208 內測收斂第一階段完成後）

本文件定義 LIFF Mini App 在「內測中、尚未正式上架」階段的：

1. 現況範圍 — 已完成 / 未完成功能
2. 內測 SOP — iPhone / Android LINE App 內測手順
3. 每次 LIFF 相關 PR 後的回歸測 checklist
4. 上架前剩餘 blocker 清單
5. 問題回報格式（含敏感資訊遮罩規則）

⚠️ **目前狀態：內測中，尚未正式上架給顧客使用。** 任何顧客若收到 LIFF URL 都屬於白名單內測對象，**不應對外公開傳播**。Rich Menu 入口尚未啟用。

---

## 1. 現況範圍

### 1.1 已上線的 LIFF route（7 條）

| 路徑 | 對應 page.tsx 入口 | 用途 | 已 ship 主線 |
|---|---|---|---|
| `/liff` | shell | 進入點，依顧客身份分流：未綁定 → onboarding；已綁定 → 4 顆 CTA + lazy fetch wallet summary | PR-A → PR-G4 |
| `/liff/onboarding` | 補手機綁定 | 顧客首次進入時填姓名 + 手機，自動驗 LINE idToken | PR-C2 |
| `/liff/trial-booking` | 體驗預約 | 新顧客選日 + 選時段，建立 FIRST_TRIAL booking | PR-D1B |
| `/liff/member-booking` | 課程預約 | 有 wallet 顧客選日 + 選時段，扣 wallet 堂數建 PACKAGE_SESSION booking | PR-G3 |
| `/liff/bookings` | 我的預約 | upcoming / history 兩 tab，卡片含取消、改時間、聯絡店家、導航、加入行事曆 | PR-D2 / D4A-2 / D4B-1 / E1-1/2/3 |
| `/liff/wallets` | 我的方案 | active / expired / history 三 section，顯示堂數明細 | PR-E2 |
| `/liff/health` | AI 健康評估 | HealthFlow linked 顧客看 official score + 指標趨勢；未綁定看入口 CTA | PR-H2 / H2c / 官方 score wire |

### 1.2 內測收斂里程碑

四支 PR 把 LIFF 從「能跑」推進到「可內測、可回歸測、未來可上架」：

| PR | 主旨 | 影響 |
|---|---|---|
| [#205](https://github.com/rock7652-beep/steamfoot-booking/pull/205) | `(liff)` route group 加 `error.tsx` / `loading.tsx` 邊界 | 任何 server throw 不再露英文 Next.js error 頁；初次載入有友善 spinner |
| [#206](https://github.com/rock7652-beep/steamfoot-booking/pull/206) | `LIFF_ID_BY_SLUG` 集中到 `src/lib/liff/liff-id.ts` | 多店新增 slug 只動一個檔；PR-E 改 `Store.liffId` 路徑預備好 |
| [#207](https://github.com/rock7652-beep/steamfoot-booking/pull/207) | `bookings-list.tsx` 942 → 307 行 + 5 模組 | 我的預約頁拆成 orchestrator + ReadyView / BookingCard / CancelModal / BoundaryBlocks / Helpers |
| [#208](https://github.com/rock7652-beep/steamfoot-booking/pull/208) | `member-booking-form.tsx` 740 → 499 行 + 5 模組 | 課程預約頁拆 6 個 presentational sub-component；main 保留 state + handleSubmit |

### 1.3 已知不在範圍內

以下功能目前**不在 LIFF Mini App 範圍**，是否做、何時做都另案評估：

- LINE Rich Menu 正式入口
- 對所有顧客的 HealthFlow bulk auto-link
- Sentry / 結構化錯誤觀測
- Rate limit（exchange + booking actions）
- Token 過期 background-tab 自動 re-init
- 上架後的多語系（目前只 zh-TW）
- 真正 atomic reschedule semantics（目前改時間 = cancel + new booking 鏈式）
- LIFF 內顯示 / 操作金流（付款、收費、refund 一律走實體 / dashboard）

---

## 2. 內測 SOP

### 2.1 測試帳號需求

| 項目 | 要求 |
|---|---|
| LINE App | iPhone：最新 stable 版本；Android：最新 stable 版本 |
| 測試環境 | Production（staging LIFF ID 未對顧客啟用）|
| 顧客身份 | 至少 2 個 LINE 帳號：A = 未綁定（測 onboarding 路徑），B = 已綁定且有 ≥ 1 張 active wallet（測會員預約 + wallet 扣堂）|
| 額外建議 | C = HealthFlow linked 帳號（測 official score 顯示）|

### 2.2 兩台真機同時測試的價值

`/liff/member-booking` 的 `slot_full` 路徑需要兩台裝置同時搶同一個 slot 才能觸發。內測 QA 建議備 2 台手機（iPhone + Android 各一）以同時覆蓋平台差異 + 並發測試。

### 2.3 標準進場流程

```
LINE App 內點 LIFF URL
  ↓
/liff (LiffShell)
  ↓ 跑 liff.init() + POST /api/liff/exchange
  ├─ 未綁定 → 顯示 WelcomeCta「開始使用」→ /liff/onboarding
  ├─ 已綁定 → 顯示 4 顆 CTA（體驗預約 / 課程預約 / 我的預約 / 我的方案 / AI 健康評估）
  ├─ ID Token 過期 → expired 黃色 InfoBlock + 重新整理
  └─ 桌面瀏覽器開 → not_in_line_app 灰色 InfoBlock
```

⚠️ **不要從桌面瀏覽器點 LIFF URL 當「正面測試」**——非 LINE App 入場一律會被擋。要驗 not_in_line_app 路徑時才這樣開。

### 2.4 完整 lifecycle 測試順序（建議跑一輪 ~15 分鐘）

#### A. Onboarding 路徑（用未綁定帳號）

1. 從 LINE App 點 LIFF URL → `/liff` → 看到「開始使用」CTA
2. 點「開始使用」→ `/liff/onboarding`
3. 填姓名 + 手機（必須 09 開頭共 10 碼）→ submit
4. 成功 → SuccessCard「歡迎回來」+「回到會員首頁」CTA
5. 點回首頁 → `/liff` → 應顯示「歡迎回來」+ 4 顆 CTA
6. **預期失敗**：填非 09 開頭手機 → inline error「手機格式不正確」

#### B. 體驗預約路徑（同新顧客；onboarding 後立刻測）

1. `/liff` → 點「體驗預約」→ `/liff/trial-booking`
2. 月曆預設當月，可換上 / 下個月
3. 點一個有可預約 slot 的日期 → 下方 slot 列表載入
4. 點一個未滿 slot → 「確認預約」按鈕變藍可點
5. 點「確認預約」→ 成功 → SuccessCard「體驗預約已建立」+ 3 顆 CTA
6. 點「查看我的預約」→ `/liff/bookings` upcoming tab 第一筆就是剛建的
7. **預期失敗**：對同顧客再開 `/liff/trial-booking` → ExistingTrialCard「您目前已有體驗預約」

#### C. 課程預約路徑（用已綁定 + 有 wallet 顧客 B）

1. `/liff/wallets` 先看 totalAvailable = N（記下這個數字）
2. `/liff` → 點「課程預約」→ `/liff/member-booking`
3. Wallet summary bar 顯示「目前可預約 N 堂」+（多張方案則加「共 X 張方案」）
4. 月曆 + slot 選擇與體驗預約相同
5. 點「使用堂數預約」→ 成功 → SuccessCard「預約已建立」+ 2 顆 CTA
6. 回 `/liff/wallets` → totalAvailable 應 = **N − 1**（people=2 顧客應 = N − 2）
7. **若扣堂不一致 = P0 嚴重 bug，立刻回報**

#### D. 改時間路徑（接 B 或 C 建立的 booking）

1. `/liff/bookings` → 找剛建的 upcoming card
2. 點「取消此次預約」→ Modal 跳出
3. 點「改時間」（primary 按鈕）→ Modal 鎖住 → 自動跳到 `/liff/trial-booking`
4. 重新選日 + 選時段 + 確認 → 應建立新 booking + 原 booking 已 CANCELLED
5. 回 `/liff/bookings` → upcoming tab 看到新 booking；history tab 看到舊 CANCELLED

#### E. 取消路徑（同 booking）

1. `/liff/bookings` upcoming card → 點「取消此次預約」
2. Modal 跳出 → 點「取消此次預約」（紅色 outlined 按鈕）
3. 成功 → modal 消失 → card 從 upcoming 移到 history
4. **預期失敗**：開課前 < 12 小時的 booking → 取消按鈕應 disabled + hint「開課前 12 小時可自行取消」

#### F. 我的預約周邊功能（同 booking card）

1. 「聯絡店家」綠色按鈕 → 開 LINE OA chat
2. 「導航到店」藍色按鈕 → iOS 跳原生 Maps；Android 跳 Google Maps app
3. 「加入行事曆」outlined 按鈕 → 開 `calendar.google.com` TEMPLATE 頁，預填日期 / 時段 / 地址 / 聯絡店家連結

⚠️ **「加入行事曆」這條是 PR #184 hotfix 路徑**——LINE iOS webview 對 ICS data URI dispatch 不穩，#184 改走 Google Calendar URL。每次 LIFF refactor 都建議真機驗一次。

#### G. HealthFlow 健康評估（用顧客 C 或內測顧客）

1. `/liff` → 點「AI 健康評估」→ `/liff/health`
2. 已 linked 顧客 → 顯示 official score 大字 + riskLabel pill + scoreExplanation + adviceSummary bullets + 醫療免責
3. 未 linked 顧客 → 顯示「尚未完成 AI 健康評估」+ 「開始 AI 健康評估」CTA → 外開 HealthFlow LIFF
4. HealthFlow API down → 顯示「健康資料暫時無法載入」+ retry / contact

---

## 3. 每次 LIFF PR 後的回歸測 Checklist

任何修改 `src/app/(liff)/`、`src/server/actions/liff-*.ts`、`src/lib/liff/*`、`src/components/liff/*` 的 PR merge 並 deploy 後，建議**所有條目都跑一遍**。

### 3.1 健康路徑 smoke（8 條，~10 分鐘）

- [ ] iPhone LINE 開 `/liff` → 4 顆 CTA 正常顯示
- [ ] `/liff/onboarding` 用未綁定帳號完成綁定流程
- [ ] `/liff/trial-booking` 月曆 + slot 正常 → 建一筆體驗預約成功
- [ ] `/liff/member-booking` wallet summary bar 顯示對 → 建一筆會員預約成功
- [ ] `/liff/bookings` upcoming + history 兩 tab 切換正常 → 卡片資料對
- [ ] `/liff/bookings` 「加入行事曆」按鈕 → 開 `calendar.google.com` 頁，date / location / details 對
- [ ] `/liff/wallets` active / expired / history 三 section 顯示對
- [ ] `/liff/health` linked 顧客看到 official score；unlinked 顧客看到入口 CTA

### 3.2 Wallet 扣堂一致性（嚴重等級，必跑）

- [ ] 預約前 `/liff/wallets` 記下 totalAvailable = N
- [ ] `/liff/member-booking` 建立一筆 people=1 預約
- [ ] 預約後 `/liff/wallets` 應 = **N − 1**
- [ ] （若是 people=2 顧客）應 = **N − 2**

⚠️ 此條 fail = P0 bug，是 #193 / #194 / #201 多人扣堂修復鏈的最後防線，**任何 LIFF 改動都要驗**。

### 3.3 Error path（6 條，~5 分鐘）

- [ ] 桌面瀏覽器開 LIFF URL → `not_in_line_app` 灰色 InfoBlock
- [ ] LINE App 內等 idToken 過期（≥ 1 小時不操作）再開 → `expired` 黃色 InfoBlock + retry
- [ ] 預約一個 slot 滿的時段 → `slot_full` BlockedBlock + 「重新選擇」按鈕
- [ ] 點「重新選擇」→ 回月曆 + slot 重新載入
- [ ] 已 CANCELLED booking 卡片 → opacity-60 灰化 + 不顯示 cancel/contact/map/calendar
- [ ] 開課前 < 12h 的 booking → 取消按鈕 disabled + hint

### 3.4 Dev-time gates（PR 階段已跑，merge 後不需要重跑）

PR 內 reviewer 須確認：
- `tsc --noEmit` clean
- `eslint` 觸及檔 clean
- `next build` OK，全部 7 條 LIFF route 仍在 manifest

---

## 4. 上架前剩餘清單

LIFF Mini App 從內測 → 正式上架前，建議完成以下項目。**順序為建議優先級**。

| # | 項目 | 為何上架前要做 | 可否暫緩 |
|---|---|---|---|
| **P1-2** | Sentry / 結構化錯誤 sink | 上架後流量會放大；console.warn / console.error 在 Vercel log 撈得到但難對應顧客 + 不易訂閱 alert | 不建議；上架前必補 |
| **P1-1** | Rate limit `exchange` + booking actions | 上架後 `/api/liff/exchange` 與 `submitLiffTrialBooking` / `submitLiffMemberBooking` 可能被暴力重試 | 不建議；上架前必補 |
| **P1-6** | Token 過期 background-tab UX | 顧客把 LIFF tab 留背景幾小時後再回來，目前體驗是看到 expired card 後手動 retry。可優化成自動 re-init | 可暫緩；上架後依顧客回饋再評估 |
| **Rich Menu** | LINE OA 正式入口 | 上架定義 = 顧客從官方 OA 圖文選單能進來；目前內測靠 URL 私下分享 | 必做；上架前最後一步 |
| **HealthFlow bulk link** | 對所有正式顧客做 auto-link | 目前只內測顧客 link，店長後台看不到大多數人的 health card | 可上架後做；非阻擋項 |
| **dead code 清理** | 移除 `health-section.tsx` / `health-summary.tsx` / `health-history.tsx` / `src/lib/health-score.ts` | 已被 #200 / #203 / #204 取代但檔還在 repo | 可上架後做；非阻擋項 |
| **多店 LIFF** | `Store.liffId` schema 化 | 目前 #206 已把 dict 集中；新增店家要動 env + dict | 只在開新店時必做 |

P0 / P1-3 / P1-5 已於 #205～#208 完成，故未列入。

---

## 5. 問題回報格式

### 5.1 回報前自我檢查（30 秒）

- [ ] 問題可重現嗎？至少嘗試重現一次
- [ ] 是否只在某一台手機 / 某 LINE 版本 / 某網路狀況下發生？
- [ ] 截圖 / 螢幕錄影是否準備好？
- [ ] 是否確認不是顧客自己的 LINE App 異常（試試重啟 LINE）？

### 5.2 標準回報格式

```
測試時間：YYYY-MM-DD HH:MM (台灣時間)
測試裝置：iPhone 15 Pro / Android Pixel 8 / 其他
LINE App 版本：14.x.x （LINE App → 設定 → 關於 LINE 看到）
測試路徑：/liff/member-booking
顧客識別：內測顧客 B（末 4 碼 1234）   ← 不要貼完整資訊
操作步驟：
  1. 開 /liff
  2. 點「課程預約」
  3. 選 6/1（週日）
  4. 選 10:00 slot
  5. 點「使用堂數預約」
預期：成功 → SuccessCard
實際：按鈕一直 loading 不結束，30 秒後仍無反應
螢幕截圖：（附圖；可遮顧客姓名）
其他：剛剛 5 分鐘前 onboarding 完，是同一個 session
```

### 5.3 敏感資訊遮罩規則（必遵守）

回報問題時**絕對不要**貼以下內容：

| 敏感欄位 | 遮罩方式 | 範例 |
|---|---|---|
| 完整手機號 | 只留末 4 碼 | `09xx-xxx-1234` |
| 完整 email | 只留 @ 後 domain，or 首 2 字 + 末 1 字 | `ab***z@gmail.com` |
| LINE userId | 完全不貼 | （任何情況都不要貼）|
| HealthFlow profileId | 前 8 字 + `...` + 末 8 字 | `bde935c3-...-ff75c14a` |
| 顧客姓名 | 用「內測顧客 A / B / C」or 姓氏 + 末 4 碼 | `黃 1234` |
| Database 連線字串 | 完全不貼 | （任何情況都不要貼）|
| API key / token / secret | 完全不貼 | （任何情況都不要貼）|
| `.env` 內任何 value | 完全不貼 | （任何情況都不要貼）|

⚠️ **截圖前先檢查畫面是否含敏感資訊**——例如截到 dashboard 顧客詳情頁時，手機號 / email 都會在圖上，截圖時用編輯工具遮掉。

### 5.4 回報管道

優先順序：

1. **嚴重 bug（顧客錢 / 堂數 / 預約被吞）** → 立刻 LINE 群 + 同時開 GitHub issue
2. **一般 bug（UI 走樣、文案錯、卡頓）** → GitHub issue
3. **建議 / 觀察** → 用 LINE 群討論先過濾，確認是 bug 再開 issue

---

## 附錄 — 跨文件 cross-reference

| 主題 | 文件 |
|---|---|
| 2026-05-25 LIFF / HealthFlow / wallet sync 上線記錄 | `docs/release-notes/2026-05-25-liff-booking-healthflow-wallet-sync.md` |
| LIFF 環境變數 / LINE Channel 設定 | `docs/liff-setup.md` |
| LINE Mini App 整體架構規劃 | `docs/line-mini-app-plan.md` |
| 角色 / 權限矩陣（OWNER / STAFF / CUSTOMER） | `docs/role-permission-matrix.md` |
| 時區規則（UTC+8 / Asia/Taipei） | `docs/date-time-rules.md` |
| 提醒系統（daily 18:00 batch） | `docs/reminder-system.md` |
| HealthFlow API 整合計畫 | `docs/health-integration-plan.html` |
| LIFF 身份識別 / OAuth 流程 | `docs/identity-flow.md` |
| 通用驗收清單 | `docs/acceptance-checklist.md` |

---

## 變更歷史

| 日期 | 內容 |
|---|---|
| 2026-05-26 | 初版：#205～#208 內測收斂第一階段完成後固定本文件 |
