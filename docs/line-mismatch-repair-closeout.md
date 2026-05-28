# LINE account-mismatch 修復 closeout（PR-F2 系列收尾）

> 本文件是 PR-F2 系列的**收尾紀錄**（post-mortem / closeout），不是設計文件。
> 設計請看 `docs/pr-f2-line-mismatch-repair-plan.md`（PR #221）。
> 本 PR 是 **docs-only**：不改 code、不跑 DB、不跑 migration、不跑 apply。

---

## TL;DR

- PR-F1 系列（observability + diagnostic + repair-decision audit）和 PR-F2 系列（per-record repair）已完成。
- Production read-only audit 顯示 zhubei 的 LINE `account-mismatch` 從 **3 降到 1**。
- 剩下 1 筆為 `needs_manual_business_check`，**不**進入自動修復流程，要等業務 / 店長確認後再個別判斷。
- 工程焦點下一階段可以從 LINE 身份修復切換回 **LIFF identity binding / customer binding** 開發。

---

## 1. 已完成的 PR 清單

按時間順序，全部已 merged 進 `main`：

| PR | Branch / Title | 性質 | 狀態 |
| --- | --- | --- | --- |
| **#218** | `feat(line): add binding observability and guardrails (PR-F1)` | code | merged |
| **#219** | `feat(diagnostic): triage fields for LINE account-mismatch (PR-F1.1)` | code (script + tests) | merged |
| **#220** | `feat(diagnostic): repair-decision audit for LINE account-mismatch (PR-F1.2)` | code (script + tests) | merged |
| **#221** | `docs(line): add PR-F2 line mismatch repair plan` | docs-only | merged |
| **#222** | `feat(line): PR-F2.1 dry-run repair script for first needs_customer_merge` | code (per-record script + tests) | merged |
| **#223** | `feat(line): PR-F2.2 dry-run repair script for second needs_customer_merge` | code (per-record script + tests) | merged |
| **#224** | `fix(line): correct stale PR-F2.1 label in PR-F2.2 console header` | code (single-string label fix) | merged |

各 PR 互相關係：

- **#218**：在 3 條 LINE 綁定路徑（LIFF / webhook / NextAuth LINE provider）加結構化 log；`bind-line-to-customer.ts` 加 P2002 guardrail；新增 mask helpers (`maskId` / `maskLineUserId` / `maskPhone`)。
- **#219**：擴 `diagnose-line-identity-drift` 的 `account-mismatch` 樣本，加 triage 欄位（雙邊 hasPwd、createdAt、Customer/Booking/Transaction count）。
- **#220**：新增 `scripts/diagnose-line-mismatch-repair-audit.ts` — 對每一筆 mismatch 跑 4 選 1 分類（`safe_reassign_account_only` / `needs_customer_merge` / `do_not_touch` / `needs_manual_business_check`）；含 cross-store unified guard。
- **#221**：docs-only 設計文件 `docs/pr-f2-line-mismatch-repair-plan.md`，把 19 條 invariants（13 identity + 4 footprint + 1 cross-store + 1 rollback-aware idempotency）、4 個 write groups（W1/W2/W3/W4）、AuditLog L0..L3 row 結構、rollback W1'..W4' 對稱反轉全部寫定。
- **#222**：per-record DRY-RUN-default repair script，硬編碼第一筆 `needs_customer_merge` 的 8 個常數，跑完 19 條 invariants 後才允許 `--apply`。
- **#223**：同 #222 模板，硬編碼第二筆 `needs_customer_merge` 的 8 個常數。
- **#224**：#223 從 #222 clone 時漏改的 stdout header label drift；console-only，不影響 AuditLog 內容。

---

## 2. Production apply + verify 結果

### PR-F2.1（第一筆 `needs_customer_merge`）

- 目標 record（masked）：`cmojgm****` / `zhubei` / `U0ed****50`
- Footprint：canonical 側 2 bookings / 2 transactions / 1 active wallet；placeholder 側全 0
- DRY RUN 19 條 invariants 全 PASS
- `--apply` 跑完後 post-state verify：
  - `Account.userId` 已 reassign 到 canonical User
  - placeholder Customer 已 `mergedInto` canonical + `selfBookingEnabled=false` + `lineLinkStatus=UNLINKED`
  - placeholder User `status=SUSPENDED`
  - 4 筆 AuditLog（L0 summary + L1/L2/L3 detail）已寫入
- **Verify PASS**。Audit 隨後從 3 降到 2。

### PR-F2.2（第二筆 `needs_customer_merge`）

- 目標 record（masked）：`cmojyo****` / `zhubei` / `U917****61`
- Footprint：canonical 側 13 bookings / 17 transactions / 5 wallets (4 active) / 48 wallet sessions；placeholder 側全 0
- DRY RUN 19 條 invariants 全 PASS
- `--apply` 跑完後 post-state verify：同 PR-F2.1 形狀，placeholder 已 SUSPENDED + merged，canonical 持續綁住 LINE Account
- **Verify PASS**。Audit 隨後從 2 降到 1。

兩支 script 都嚴格遵守 PR-F2.0 §1.3 「一筆一支 script、一個 PR、reviewer + 店長雙簽、`--apply` 與 dry-run 分開兩次呼叫」的 SOP。

---

## 3. 目前 production read-only audit count（zhubei）

最近一次 `scripts/diagnose-line-identity-drift.ts --store=zhubei --count`：

| 檢查 | 數量 | 解讀 |
| --- | --- | --- |
| `orphan-line` | **0** | 沒有 Customer 有 lineUserId 但缺登入帳號 |
| `account-mismatch` | **1** | 剩 1 筆 — 為 `needs_manual_business_check`（見下節） |
| `cross-store` | **0** | 沒有同 lineUserId 跨多店 |
| `missing-account` | **0** | 所有 Customer.lineUserId 都有對應的 `Account[line]` |

`account-mismatch` 從 PR-F1 系列剛上 prod 時的 **3 筆**，經 PR-F2.1 / PR-F2.2 兩次 apply，已降到 **1 筆**。

---

## 4. 剩餘 1 筆 `needs_manual_business_check` 處理原則

剩下的記錄（masked）：`cmojv9****` / `zhubei` / `Ub01****5c`。

PR-F1.2 `classify()` 給的 reason：

```
customer_side_primary(有經濟足跡);
account_user_is_live_login_without_data(有密碼或其他帳號，reassign 會孤立該登入身份)
```

也就是說：

- canonical 側是真正有歷史的顧客（bookings / transactions / wallets 都有）
- `Account.userId` 指到的 User **有 password**、是個「活的登入身份」，但身後沒有業務資料
- naive reassign 會讓那個有密碼的登入身份失去 Account 連結 — 顧客若曾用該登入身份登入過 / 設過密碼，會被孤立

因此這筆 **不在 PR-F2 任何 sub-PR 的 scope 內**。處理原則照 PR-F2.0 §5 寫定：

1. **不自動修**：不會被任何已存在的 repair script 處理；A1 invariant 與 audit 分類本身就會把它擋下。
2. **不 batch、不 loop**：禁止任何 `--all` / `--from-file` / batch script 嘗試「順便也修這筆」。
3. **不 apply**：在店長 + 業務雙方完成書面確認前，沒有任何 `--apply` 對這筆執行。
4. **店長 / 業務必須先做的事**（per PR-F2.0 §5.2 `account_user_is_live_login_without_data` 條目）：
   - 查 A 側 `User.role`：若 `OWNER` / `STAFF` → 立刻停手（這就不是顧客身份問題，是員工帳號被誤綁 LINE OAuth，要工程查 staff bind path）
   - 查 A 側 `User` 的 Account 列表：若還有 Google `Account` → 顧客可能用 Google 跟 LINE 兩種方式登入、且 LINE 那把走錯 User
   - 查 A 側 `User` 的最近 `Session.expires`：若還活著，先不要動，等顧客下次登入前確認
   - 與顧客確認：是否有意保留 A 那個登入身份（即使它沒有歷史）
5. **書面紀錄**（per PR-F2.0 §5.3）：用既有 `OpsActionLog` model，`module="line_mismatch_repair"`、`refId=<canonicalCustomerId>`、`status` 走 `assigned/contacted/decided/rejected`，不改 schema。
6. **若確認後 A 側真的是空殼**：才考慮 **新開一支 PR-F2.3**，硬編碼這筆的 6 個 ID，重跑 19 條 invariants → DRY RUN → reviewer 簽 → `--apply`。不可以「降級」走 PR-F2.1 / PR-F2.2 的舊 script。
7. **若 A 側是真的有意義的第二身份**：留 known-split、不 apply，PR-F2 對這筆收尾。

簡單來說：**這筆只能由店長 / 業務先在系統外確認，再決定要不要進 PR-F2.3；工程不主動推進。**

---

## 5. 下一階段建議

PR-F2 系列把「歷史已分裂的身份」這部分的 ad-hoc 修復收尾，後續工程焦點可以**切回 LINE 身份 / 顧客綁定的主開發路線**。候選的下一步（順序非定案，只是 backlog）：

- **LIFF identity binding** — 補完顧客 LINE Mini App 端的 binding flow（前端 + onboarding 行為強化）
- **Customer binding** — 後台「綁定」UI 與 webhook bind-code 流程的整合穩定化
- **PR-C3A**（per memory `project_identity_system_p0`）— 身份系統 P0 路線剩下的綁定 UI
- **顧客合併 Phase 2**（per memory `project_customer_merge_phase2`）— 候選偵測 / 雙 userId UI / identity-repair 防呆

選擇順序由產品 / 店長 / 業務優先序決定，本文件只記錄「PR-F2 收尾完成、工程可以回到上面這些 backlog」。

不在 PR-F2 系列範圍、之後**仍不**自動處理的事項：

- 不會自動 schedule cron 跑 `--apply` 任何 LINE drift 修復
- 不會把 PR-F2.x 的 script 改成 batch mode 或加 `--all` flag
- 不會自動「降級」`needs_manual_business_check` 為 `needs_customer_merge`
- 不會改 PR-F2.0 §2 的 19 條 invariants（若未來新型 drift 需要新規則，要先更新 spec 才能落地）

---

## 6. Scope guard

本 PR 是 **docs-only**：

- ❌ 不改 code（沒有 `.ts` / `.tsx` / `.prisma` 改動）
- ❌ 不改 schema / migration / 不跑 `db push`
- ❌ 不跑 DB（read-only audit 也沒跑）
- ❌ 不跑任何 repair `--apply`
- ❌ 不改 LIFF / OAuth / webhook / wallet / booking / transaction / NextAuth 任何邏輯
- ✅ 只新增 `docs/line-mismatch-repair-closeout.md` 一個檔案

設計文件 `docs/pr-f2-line-mismatch-repair-plan.md` 維持原樣，本文件只在它旁邊作為 closeout 紀錄存在。
