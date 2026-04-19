# UI 導覽重構 — 現況盤點 × 落地計畫

對應來源：使用者提出的「重構前後導覽地圖」
目標：在不推翻現有程式的前提下，以最小變更把新版主線走通。

---

## TL;DR（一行總結）

> 新版 sitemap 設計的「顧客體驗線」與「經營培育線」分離，**大部分已經落地**。
> 真正要做的只剩：**幾處文案統一 + 成長頁觸發條件收緊 + 後台入口命名微調**，不需要大改路由或資料模型。

---

## 1. 現況盤點 × 新版 sitemap 對照表

### 1.1 前台（顧客線）— `src/app/(customer)/`

| 新版 sitemap 節點 | 現有路由／檔案 | 狀態 | 備註 |
|---|---|---|---|
| 首頁（行動首頁／Hero／快速功能／推薦卡／條件式成長卡） | `book/page.tsx` | 保留 | Hero、快速功能、推薦朋友卡、條件式成長卡、今日提醒卡 **都已存在** |
| 立即預約下一次 | `book/new/page.tsx` | 保留 | |
| 我的預約 | `my-bookings/page.tsx` | 保留 | |
| 我的方案 | `my-plans/page.tsx` | 保留 | |
| AI 健康評估 | 外部 `healthflow-ai.com/liff` | 保留 | layout 與首頁都已串接 |
| 我的推薦 | `my-referrals/page.tsx` | 保留 | 側欄不放、首頁卡進入（符合新版設計） |
| 我的成長（條件式） | `my-growth/page.tsx` | **需微調** | 觸發條件比新版寬鬆，見 §2.3 |
| 我的資料 | `profile/page.tsx` | 保留 | 已經是精簡版：基本資料／修改密碼／帳號安全，**已經沒有**教練準備度、邀請差幾位、朋友預約數 |
| 積分紀錄（sitemap 未列，但從 `/my-referrals` 與 `/my-growth` 進入） | `my-points/page.tsx` | 保留 | |

### 1.2 後台（培育線）— `src/app/(dashboard)/`

| 新版 sitemap 節點 | 現有路由／檔案 | 狀態 | 備註 |
|---|---|---|---|
| 人才培育 / 高潛力名單 | `dashboard/growth/page.tsx` | **需文案微調** | 側欄目前叫「高潛力名單」，可視需要改為「人才培育」 |
| TOP 10 高潛力候選人 | `dashboard/growth/top-candidates/page.tsx` | 保留 | 完整指標（分數／積分／轉介／帶出／出席／事件） |
| 候選人詳情頁（成長分數／等級／推薦數／來店數／成交數） | `dashboard/customers/[id]/page.tsx` | 保留 | 已含 `talent-pipeline-section`、`points-section`、`referral-section` |

### 1.3 共用元件

| 元件 | 路徑 | 狀態 |
|---|---|---|
| LINE／複製 分享元件 | `src/components/share-referral.tsx` | 保留，首頁／我的推薦共用 |
| AI 健康分數卡 | `src/components/health-assessment-card.tsx` | 保留 |
| 顧客側欄（桌面） | `src/app/(customer)/layout.tsx` | 5 個主項目＋AI 健康外部連結，**符合新版** |
| 顧客側欄（手機） | `src/app/(customer)/mobile-nav.tsx` | 同上 |

---

## 2. 落差清單（要做什麼）

### 2.1 首頁／推薦卡：文字統一（輕量）
- **現況**：首頁推薦卡底部連結文字為「我分享的朋友」，指向 `/my-referrals`
- **新版 sitemap**：寫「查看我的推薦」
- **建議**：兩者語意接近。若要照 sitemap 用「查看我的推薦」，只改一處字串即可
- **檔案**：`src/app/(customer)/book/page.tsx`（大約 L265 `我分享的朋友` 附近）
- **風險**：零；只是顧客可見文字

### 2.2 我的推薦頁：補「目前點數」與「再差多少可解鎖回饋」為獨立指標格
- **現況**：`my-referrals` 顯示「朋友來店體驗／朋友開始了解／我分享過」三格 + 下方 milestone 進度條（含「目前 X 點 · 目標 Y 點」字樣）
- **新版 sitemap**：要求五項並列
  - 已分享幾次、已加入 LINE 幾位、已來店幾位 ✔ 已有
  - 目前點數 ✖ 尚未獨立為 stat cell
  - 再差多少可解鎖回饋 ✔ 已有（在 milestone 區塊，但位置分離）
- **建議**：將「目前點數」加進 StatCell 行（可由 3 欄改為 4 欄，或在 milestone 卡保留現況）。視覺衝擊小
- **檔案**：`src/app/(customer)/my-referrals/page.tsx`（StatCell 區塊 L41-L49）、可能需要 `getMyReferralSummary` 提供 `totalPoints`（檢查 `src/server/queries/my-referral-summary.ts`）

### 2.3 我的成長頁：觸發條件收緊（**需要政策決策**）
- **現況** `growthEligible`（`src/server/queries/my-referral-summary.ts`）：`shareCount >= 1` OR `lineJoinCount >= 1` OR `visitedCount >= 1`
- **新版 sitemap**：`推薦人數 >= 2` OR `點數 >= 100` OR `來店轉換 >= 1`
- **差異**：現況把「分享 1 次就看得到」視為門檻；新版要求至少「帶 2 位朋友 / 100 點 / 1 位轉換」，更強調「真的開始影響別人」
- **建議**：
  1. 確認此為**政策決策**（現況寬鬆、新版嚴格）。若採新版門檻，約 30%-60% 原本看得到成長頁的顧客會看不到（需觀察）
  2. 若確定要改，兩個地方要同步：`my-referral-summary.ts` 的 `growthEligible` 判斷、`book/page.tsx` 首頁「條件式成長卡」的顯示條件（同一個值）
- **建議變更位置**：`src/server/queries/my-referral-summary.ts`（只有一處）

### 2.4 後台入口命名（可選）
- **現況**：dashboard 側欄項目顯示「高潛力名單」（`src/components/sidebar.tsx` L92-93）
- **新版 sitemap**：寫「人才培育 / 高潛力名單」
- **建議**：如要跟 sitemap 一致，把 label 改為「人才培育」；或保留現況，只是在內部文件說明兩者等價

### 2.5 清單外但值得一提
- 首頁 `book/page.tsx` 目前尾端還有「今日提醒卡」（`todayShareCount`）。新版 sitemap 沒寫這塊，但語意上符合「推薦朋友卡」的延伸鼓勵。**建議保留**
- `my-points` 不在新版主 sitemap，但從 `/my-referrals` 與 `/my-growth` 都有連結進入，**保留**

---

## 3. 實作分階段（建議順序）

### Phase 0 — 確認政策（在寫程式前）
1. §2.3 成長頁觸發條件：決定走「現況寬鬆」或「新版嚴格」，或設中間版（例如 `shareCount>=1 AND (lineJoinCount>=1 OR visitedCount>=1)`）
2. §2.1 / §2.4：文字要不要統一為 sitemap 用字

> 這兩個決策**不是技術問題**，是產品方向。建議寫在 `docs/product-plan-v2.md` 的對應段落。

### Phase 1 — 只改文案（0.5h 以內）
- §2.1 首頁推薦連結文字
- §2.4 後台側欄 label

**影響檔**：
- `src/app/(customer)/book/page.tsx`
- `src/components/sidebar.tsx`

**風險**：零；全是字串

### Phase 2 — 我的推薦頁補「目前點數」獨立格（1–2h）
- §2.2
- 先確認 `getMyReferralSummary` 回傳是否已含 `totalPoints`；沒有就補欄位

**影響檔**：
- `src/server/queries/my-referral-summary.ts`（可能需補欄位）
- `src/app/(customer)/my-referrals/page.tsx`（UI 調整）

**風險**：低；type-only 的變更，無 DB 異動

### Phase 3 — 成長頁觸發條件調整（如 Phase 0 決定要改；1–2h）
- §2.3

**影響檔**：
- `src/server/queries/my-referral-summary.ts`：修改 `growthEligible` 運算
- （連動）`src/app/(customer)/book/page.tsx` 首頁成長卡條件、`src/app/(customer)/my-growth/page.tsx` 入口守門

**風險**：中；會改變「誰看得到成長頁」的基數；建議改完後手動測試幾組測試顧客，確認：
1. 未達新門檻的顧客：首頁不顯示成長卡、直接訪問 `/my-growth` 會被 redirect 回 `/book`
2. 達新門檻的顧客：成長卡顯示、可進入 `/my-growth`

### Phase 4 — 可選：視覺／互動細節（另案）
如果要更貼近 sitemap「主推／條件式」的權重感：
- 分享卡用比快速功能更強的視覺層級（現況已經用了 primary 漸層 + 邊框，但可以再比較一次）
- 「條件式成長卡」加入近期數據差異提示（例如「本月朋友又多 +1 位來體驗」）

---

## 4. 會「動到」與「不會動到」的清單

### 會動到
- `src/app/(customer)/book/page.tsx`（文字 + 成長卡條件）
- `src/app/(customer)/my-referrals/page.tsx`（補 stat cell）
- `src/app/(customer)/my-growth/page.tsx`（只改守門條件、不動主體）
- `src/server/queries/my-referral-summary.ts`（觸發條件定義、可能補 `totalPoints`）
- `src/components/sidebar.tsx`（後台 label）

### 不會動到
- 路由結構（不新增、不刪除）
- Prisma schema
- 權限模型（`docs/role-permission-matrix.md`、`requirePermission` 邏輯）
- 顧客側欄主項目（5 項維持不變）
- 日期／時區共用函式（`src/lib/date-utils.ts`）

---

## 5. 規格約束驗證（對照 AGENTS.md）

依 `AGENTS.md` / `docs/date-time-rules.md` / `docs/role-permission-matrix.md`：

- **日期與時區**：本次變更不涉及「今天／本月」邊界。首頁已用 `todayRange()`（`book/page.tsx` L50），**符合規範**。不要在新程式碼裡自行宣告 `TZ_OFFSET`
- **權限檢查**：
  - 前台（顧客）頁面：均有 `getCurrentUser` + `redirect` + `role !== 'CUSTOMER'` 守門 ✔
  - 後台 TOP 10（`top-candidates/page.tsx`）：`role !== 'ADMIN' && role !== 'OWNER'` → `notFound()` ✔
  - 本次不新增後台頁面，無 server action 變更，**無權限新增需求**
- **Staff 相關**：本次變更未涉及 staff 頁面，無 OWNER 守門新增需求

---

## 6. 驗收條件（做完怎麼算完成）

### 顧客前台（手機 LIFF／桌面皆測）
1. 登入後進入首頁 `/s/{slug}/book`：看得到 Hero、立即預約、查看我的方案、AI 健康評估
2. 快速功能 5 項全部可點、全部到正確頁
3. 推薦卡：LINE 分享、複製連結都能用；底部連結文字為「{決定後版本}」
4. 我的推薦頁：5 個指標都看得到（含「目前點數」獨立格）
5. 成長卡／成長頁：未達門檻的帳號**看不到卡、無法進入頁**；達門檻的看得到
6. 我的資料：僅顯示基本資料 / 修改密碼 / 帳號安全

### 後台（OWNER／ADMIN）
7. 側欄項目名稱一致（依 Phase 0 決定）
8. `/dashboard/growth` 與 `/dashboard/growth/top-candidates` 指標顯示正確

### 非登入 / 權限異常
9. 未登入進入 `/my-growth` → redirect 到登入頁
10. CUSTOMER 進入 `/dashboard/*` → redirect 或 notFound
11. OWNER 進入 `/s/{slug}/book` → redirect 至 admin/dashboard

---

## 7. 下一步建議

1. **先回答 §3 Phase 0 兩個問題**（成長觸發條件、文案一致性）
2. 由我在新的對話裡依照 Phase 1 → 2 → 3 順序實作
3. 每個 Phase 完成後跑一次 `npm run lint` 與 `npm run build`，合手動驗收
4. 如未來要做 Phase 4（視覺層級強化），另案開

---

_文件位置：`docs/v2-ui-navigation-landing-plan.md`_
_盤點時間：2026-04-18_
