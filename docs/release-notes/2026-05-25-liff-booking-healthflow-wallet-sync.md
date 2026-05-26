# 2026-05-25 release notes — LIFF booking · HealthFlow · wallet sync

今日上線總計 **9 支 PR**（#193 → #201），分三條主線：

| | 主線 | PRs |
|---|---|---|
| A | 多人扣堂 bug 家族 | [#193](https://github.com/rock7652-beep/steamfoot-booking/pull/193) · [#194](https://github.com/rock7652-beep/steamfoot-booking/pull/194) · [#201](https://github.com/rock7652-beep/steamfoot-booking/pull/201) |
| B | LIFF 會員自助預約 | [#195](https://github.com/rock7652-beep/steamfoot-booking/pull/195) · [#196](https://github.com/rock7652-beep/steamfoot-booking/pull/196) |
| C | HealthFlow 我的健康紀錄 | [#197](https://github.com/rock7652-beep/steamfoot-booking/pull/197) · [#198](https://github.com/rock7652-beep/steamfoot-booking/pull/198) · [#199](https://github.com/rock7652-beep/steamfoot-booking/pull/199) · [#200](https://github.com/rock7652-beep/steamfoot-booking/pull/200) |

下方按主線記錄。

---

## A. 多人扣堂 bug 家族

### 觸發原因

正式站發現顧客「彭惠珍」2026-05-25 10:00 兩筆 PACKAGE_SESSION 完成預約（people=2 + people=1，合計 3 人）只扣 2 堂。Root cause：`wallet-session.ts` 5 個 helper（allocate / release / complete / uncomplete / reReserve）都用 `findFirst({ bookingId, status })`，一筆 booking 只動 1 個 WalletSession row，與 `people` 完全脫鉤。

### PR #193 — 建立多人預約時扣 N 堂

**Merge commit**: `d1d45a0fb55ed5fe5b1c87def39a9a89cfafc4cb` (commit `f28d1c5` on branch)

| | 內容 |
|---|---|
| 解決 | createBooking / cancel / markCompleted / markNoShow / revert 五條路徑：`people=N` 一律對應 N 個 WalletSession + N 筆 `SESSION_DEDUCTION quantity=1` |
| 範圍 | 7 files, +507 / -140；wallet-session.ts 加 5 個 plural helper + 保留 5 個 singleton wrapper @deprecated |
| 不動 | schema / migration / payment / cashbook / cash drawer / LIFF / trial collection |
| 測試 | 22 既有 + 13 新（people=2 全 lifecycle / mixed people=1+2 / 老 wrapper compat） |
| Prod data repair | 彭惠珍那筆少扣 1 堂單獨 read-only audit → dry-run → 授權執行修復（第 5 堂 AVAILABLE → COMPLETED + 補 1 筆 SESSION_DEDUCTION） |
| Prod smoke | 黃珊毓 5/26 19:30 people=2 PACKAGE_SESSION：建立 → 2 RESERVED；完成 → 2 COMPLETED + 2 SESSION_DEDUCTION（qty=1 各一） |

### PR #194 — 跨 wallet 不足時 FEFO split

**Merge commit**: `a815b2334e07ed3608f29e85a4d127c7ed7e6ed4` (commit `9b20608` on branch)

| | 內容 |
|---|---|
| 觸發 | PR #193 ship 後彭惠珍場景：5 堂 wallet 剩 1 + 10 堂 wallet 剩 10，建 people=2 報「系統錯誤」— `allocateSessions` 想從一張 wallet 配 2 堂但只剩 1 |
| 解決 | 新增 `allocateSessionsFefo(tx, { candidates, bookingId, count, preferredWalletId })`：preferred 排第一 + FEFO；3 個 plural helper 改 group-by-walletId（一個 booking 跨多 wallet 也能正確 release / complete / uncomplete）；`SESSION_DEDUCTION` 改 per-session walletId（不再都掛 primary） |
| 範圍 | 7 files, +578 / -112 |
| 不動 | schema / migration / payment / trial / LIFF G3 / Booking.customerPlanWalletId 保持單欄位（primary wallet） |
| 測試 | +10 新（split 1+1 / preferred override / FEFO fallback / total-short throw / 多 wallet complete-release-uncomplete-reReserve / e2e 彭惠珍場景） |
| UX 決策 | 若使用者手選 wallet A 但 A 不足，silently top up from FEFO of remaining wallets（audit trail per Transaction.customerPlanWalletId） |
| Prod smoke | 黃珊毓 wallet 用完後彭惠珍重建 6/1 預約，FEFO 自動跨到新買的 $299 wallet，split 1+1 正確 |

### PR #201 / PR-H3 — updateBooking 改 people 同步 WalletSession

**Merge commit**: `474887f39d6a997688be7e1ff15359d231fc504b` (commit `82326e2` on branch)

| | 內容 |
|---|---|
| 觸發 | Audit 發現 updateBooking line 583 允許改 `Booking.people` 但完全沒同步 WalletSession；同 bug 家族 latent risk |
| Prod dirty data | 162 筆 PACKAGE_SESSION 掃描，6 筆 COMPLETED drift（合計少扣 8 堂）— 都是 PR #193 前 createBooking 老 bug 留下，**不是** updateBooking 觸發 |
| 解決 | updateBooking 包進 `prisma.$transaction`；用 `actualReservedCount → newPeople` delta（不是 booking.people → newPeople，這樣對 stale 資料也能 reconcile）；增 → `allocateSessionsFefo`，減 → 新增 `partialReleaseSessions` |
| 範圍 | 4 files, +607 / -3；wallet-session.ts +1 helper；booking.ts 清掉 PR #194 後就 dead 的 `allocateSessions / reReserveSessions` import |
| 不動 | schema / migration / LIFF / createBooking / markCompleted / markNoShow / revertBookingStatus / payment / HealthFlow |
| 測試 | +5 partialReleaseSessions（單獨 / stale 容忍 / 空 / validation / multi-wallet） + 11 updateBooking integration（1→2 / 2→1 / 1→3 不足 / no-op / COMPLETED 拒絕 / CANCELLED 拒絕 / FIRST_TRIAL 不動 / SINGLE 不動 / makeup 不動 / stale data reconciliation） |
| Production UI smoke | **無法執行** — production 後台「改時間」modal 目前只有日期 / 時段，**沒有 people edit 欄位**。Baseline confirmed（內部測試顧客一筆 PENDING people=1 booking，id 略），正式資料未動 |
| 為何仍要 ship | Backend 防線先補。任何呼叫 `updateBooking({ people })` 的 surface（未來若 UI 開放 / API 直接調用）都會走正確 sync 路徑 |

### 歷史 dirty data 處理

6 筆 COMPLETED dirty 維持**認列損失，不修**（per memory `historical-data-writeoff-pattern`：系統 bug 防線 ship 後的歷史漏帳預設認列損失，補建是例外）。Audit script (`scripts/healthflow-link-dryrun.ts` 同精神) 留作未來查核工具。

### 收斂結論

```
Create (PR #193) → Cross-wallet (PR #194) → Edit (PR #201)
三條 booking lifecycle 路徑都打通，Booking.people 與 WalletSession 永遠一致。
```

---

## B. LIFF 會員自助預約

### 觸發背景

PR #193 / #194 修完扣堂邏輯後，下一步把顧客自助預約入口接上 LIFF。

### PR #195 — LIFF /liff/member-booking 自助預約頁

**Merge commit**: `d010953` (commit `f28d1c5` on branch)

| | 內容 |
|---|---|
| 解決 | 接上 PR-G2 dead-code `submitLiffMemberBooking` server action 到實際 UI |
| 範圍 | 4 files, +887 / -1（2 new: page + form / 2 modified: messages + wallets-list）|
| Mirror | trial-booking page + form，移除 already_has_trial / 體驗收費 footnote / store label 等體驗專用元素 |
| 新增 | Wallet summary bar「目前可預約 X 堂」+ 多張顯示「共 N 張方案」；submit label「使用堂數預約」；SuccessCard 兩顆 CTA「查看我的預約 / 回我的方案」 |
| 入口 | `/liff/wallets` ReadyView footer 加「立即預約」primary（active.reduce(availableToBook) > 0 才出） |
| 不動 | schema / migration / payment / booking / wallet allocation / Rich Menu / AI / LINE OA / liff-member-booking server action |
| Production QA | 黃珊毓 2026-05-26 10:00 PACKAGE_SESSION people=2 → SuccessCard / `/liff/bookings` upcoming / 顧客方案明細「待到店 2」全綠；DB spot-check 全 9 項 PASS |

### PR #196 — LIFF 首頁分流：會員 / 新客

**Merge commit**: `90c4f80` (commit `87b7bcf` on branch)

| | 內容 |
|---|---|
| 觸發 | 會員要從「我的方案」進入「立即預約」，多一步；首頁應直接露出 |
| 解決 | LiffShell signed_in 後 lazy `fetchLiffWallets`；active.reduce(availableToBook) > 0 時，「課程預約」dark primary 排第一，「體驗預約」降 outlined（B 方案）|
| 範圍 | 2 files, +66 / -3 |
| Lazy-fetch | signed_in 進入立即渲染既有 4 顆 CTA；wallet 載完才追加課程預約 CTA；失敗靜默不擋其他 CTA |
| 不動 | server action / schema / dashboard / Rich Menu |
| Production QA | 真機看到「課程預約」深色按鈕排第一，「體驗預約」outlined；點課程預約進 `/liff/member-booking` 正常 |

---

## C. HealthFlow 我的健康紀錄

### 觸發背景

LIFF 首頁原本「AI 健康評估」入口直接跳 HealthFlow 外站；顧客在 LINE 內看不到自己的健康紀錄。同時 PR-H1 audit 發現 dashboard 已有完整 health-service 基建但 `HealthSectionWrapper` 在 PR #55 被拔掉沒 mount。

### PR #197 / PR-H2 — LIFF /liff/health 唯讀頁

**Merge commit**: `1828ac1` (commit `9ced4c4` on branch)

| | 內容 |
|---|---|
| 解決 | 顧客在 LINE 內可看自己的 HealthFlow 健康摘要；不再只能跳外站 |
| 範圍 | 5 files, +889 / -13（3 new: page / view / liff-health action；2 modified: messages + liff-shell）|
| Action shape | `fetchLiffHealthSummary` 走 NextAuth session + canonical customerId；read-only（不打 `tryAutoLinkHealth`，dashboard 仍是 SoT）|
| 路由變更 | LIFF home 的「AI 健康評估」入口從跳外部 HealthFlow LIFF 改先進 Steamfoot `/liff/health`；linked 看摘要，unlinked 才 CTA 跳外部 |
| 醫療免責 | 所有 state 都顯示「此評估僅供健康管理參考，不能取代醫療診斷或治療建議」disclaimer |
| 不動 | schema / migration / dashboard health actions / HealthFlow API contract |
| Production QA | 真機顯示 healthflow-ai.com profile 量測資料正常 |

### PR #198 / PR-H2b-1 — HealthFlow link dry-run report

**Merge commit**: `9326772` (commit `03e1d4a` on branch)

| | 內容 |
|---|---|
| 觸發 | PR-H1 audit 發現 dashboard `HealthSectionWrapper` 沒 mount → 沒人觸發過 autoLink → prod 0 顧客 linked。決定走「批次 sync」架構而非 remount UI（避免店長打開顧客頁就觸發 HealthFlow lookup 拖慢頁面） |
| 解決 | Read-only batch tool 把未綁定顧客分 8 桶：AUTO_LINK_CANDIDATE / NEEDS_REVIEW_EMAIL_ONLY / NEEDS_REVIEW_PHONE_ONLY / MULTIPLE_CANDIDATES / NOT_FOUND / API_ERROR / SKIPPED_NO_CONTACT / SKIPPED_INVALID_CONTACT |
| 範圍 | 1 new file (`scripts/healthflow-link-dryrun.ts`, +465)；imports 只有 PrismaClient + `lookupHealthProfile`（**不 import** linkHealthProfile / tryAutoLinkHealth / unlinkHealthProfile） |
| 安全 | masked DB banner / `--yes-i-checked-db` 必帶 / 50ms API gap / pre-check phone `^09\d{8}$` 擋 `_oauth_line_*` placeholder（不污染 API_ERROR bucket） |
| Prod scale | 81 unlinked，1 AUTO_LINK_CANDIDATE（黃彥陸） / 33 NEEDS_REVIEW_PHONE_ONLY / 11 MULTIPLE_CANDIDATES / 31 NOT_FOUND / 5 SKIPPED_INVALID_CONTACT |

### PR #199 / PR-H2b-2 — HealthFlow link execute writer

**Merge commit**: `f82aa0c` (commit `0b4d45f` on branch)

| | 內容 |
|---|---|
| 解決 | Default dry-run；`--execute --max-writes N` 必帶才寫；只寫 AUTO_LINK_CANDIDATE，其他 bucket 全 skip；CAS write（`updateMany WHERE healthProfileId IS NULL AND healthLinkStatus IN [unlinked, not_found, error]`）；idempotent（第二次 0 寫入）|
| 範圍 | 2 files, +437 / -72；dryrun script refactor（export classify / 移 prisma 進 main() / 加 entrypoint gate 避免 import side effect） |
| 拍板 | A/A/B：共用 classify(export+import) / 不加 confirmation prompt / `--max-writes` 必要 |
| 安全閥測試 | `--execute --max-writes 0`（candidate=1>0）→ REFUSED，零 partial write，黃彥陸 healthProfileId 仍 null |
| Prod execute | 用 `--max-writes 1` 寫入內部測試顧客（黃彥陸）`healthProfileId = bde935c3-...-ff75c14a`（值已遮罩） |

### PR #200 / PR-H2c — 移除 Steamfoot 自算 score

**Merge commit**: `5286f6f` (commit `e1c4b3c` on branch)

| | 內容 |
|---|---|
| 觸發 | 黃彥陸 LIFF `/liff/health` 顯示 **68 分**，HealthFlow 原站顯示 **86 分**，同一筆 2026-04-03 量測（weight 69, BMI 23.3, bodyFat 22）|
| Root cause | HealthFlow summary API **不回 score 欄位**（read-only diagnostic raw fetch 確認）；Steamfoot `computeHealthScore` 自算 70% metric + 30% activity decay，52 天衰減把分數拉低 |
| 解決（短期止血）| 顧客面（LIFF / `(customer)/my-bookings` / `(customer)/book`）全部不顯示 self-computed score；保留量測 / alerts / 趨勢；CTA「查看完整評估」導 HealthFlow 看官方分數 |
| 範圍 | 8 files, +152 / -178；`health-score.ts` 標 @deprecated 不刪（dashboard health-history / health-report 仍 import，但 dashboard 那邊在 prod 是 dead code） |
| 不動 | schema / HealthFlow API contract / dashboard health-history / booking / payment |
| Production env 設定 | 補上 `HEALTH_API_URL` / `HEALTH_API_KEY` 到 Vercel Production scope（先確認指向 production HealthFlow 而非 staging；值不寫此文） |
| Production QA | 真機 `/liff/health`：不再顯示 68 / 風險等級；顯示「最近量測 2026/04/03（52 天前）+ 6 指標 + alerts + 趨勢 + 查看完整評估 CTA + 醫療免責」 |

---

## 全域 scope guard（今日所有 PR 都遵守）

✋ **未動**：
- `prisma/schema.prisma` / migrations / seed / DB script
- Payment / Cashbook / Cash Drawer / Transaction（除 SESSION_DEDUCTION per-session 寫法的調整）
- Trial booking / FIRST_TRIAL collection logic
- HealthFlow API contract（只 read，不要求對方改）
- Rich Menu / LINE OA / AI prompt / 自動化
- Booking / Wallet / Session 既有 storage model

---

## 已知 latent / 認列損失

- **歷史 6 筆 COMPLETED dirty data**（彭惠珍補帳之外）：合計少扣 8 堂，per memory write-off pattern 不修
- **80 筆未綁定 HealthFlow 顧客**（NEEDS_REVIEW / MULTIPLE_CANDIDATES / NOT_FOUND 等）：等顧客需要時店長手動處理或 HealthFlow 端補資料
- **Production UI 沒露出 people edit surface**：PR-H3 backend 已 live，UI 開放時不會留 drift

---

## Open follow-ups

### 1. PR-H2d — HealthFlow API 加官方 `score / riskLevel`

需 HealthFlow 端配合。Steamfoot 已準備好接：拿到 API 後 dashboard health-history.tsx + health-report 也跟著清 `computeHealthScore`（連同 `src/lib/health-score.ts` 整段刪除）。

**請求文案（給 HealthFlow team）**：

> 我們想請 HealthFlow summary API 增加官方分數欄位，讓 Steamfoot 可以直接顯示與 HealthFlow 原站一致的分數。
>
> 目前狀況：
> - HealthFlow 原站顯示健康分數，例如 86 分
> - Steamfoot 透過 summary API 只能拿到 `latest / trend / alerts / meta`，沒有官方 score
> - Steamfoot 曾經自行 compute score，但同一筆資料會出現 Steamfoot 68 分、HealthFlow 86 分，造成顧客混淆
> - 因此 Steamfoot 已先移除自算分數，只保留量測資料與「查看完整評估」CTA
>
> 希望 `/api/health/summary` 回傳新增欄位：
> - `score`（整數，0–100）
> - `riskLevel`（`good / warning / danger` 之一）
> - `riskLabel`（顯示字串）
> - （如有可能）`scoreExplanation` 或 `adviceSummary`
>
> 目標：Steamfoot 不自行計算健康分數，只顯示 HealthFlow API 提供的官方分數，避免兩套演算法 drift。

### 2. Dashboard health-section remount audit

不急著做 implementation。**audit only**，鎖一個原則：

> 顧客詳情頁只讀 Steamfoot DB 裡已 linked 的結果，不在開頁時打 HealthFlow lookup。

PR #55 拔掉 `HealthSectionWrapper` 的原因可能就是「mount 後自動跑 `tryAutoLinkHealth` 拖慢顧客頁」。下次 audit 要確認新方案：
- 純讀 `Customer.healthProfileId / healthLinkStatus`
- 若 linked → server-render `<HealthSummarySection>`（已有 component；用 LRU 5 min cache 的 `getHealthSummarySafe`）
- 若 unlinked → 顯示「未綁定」靜態提示 + 「跑批次 sync」CTA（連到 `scripts/healthflow-link-execute.ts` 操作說明）
- **完全不在開頁時 lookup HealthFlow**；綁定動作靠 PR-H2b-1/2 的 batch script 處理

### 3. 後台「修改人數」UI surface 是否要開放

PR-H3 backend 已 ready。如果店家有實際業務需求（改 people 不取消重建），就在 dashboard reschedule modal 加 people 欄位。改了人數會走正確 sync。但若業務上不需要，**保留現狀不開**也 OK，反而避免誤觸。
