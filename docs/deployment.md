# 部署與環境變數

本文件定義 Vercel 三環境（Production / Preview / Development）的 env var 設定規則，避免登入 / 登出 / Email 連結在不同環境混亂。

相關：
- `src/lib/runtime-env.ts` — 環境判斷集中邏輯
- `src/lib/base-url.ts` — 對外 URL 生成
- `docs/preview-smoke-test.md` — Preview 驗收步驟

---

## Environment Matrix

| Key | Production | Preview | Development |
|---|---|---|---|
| `NEXTAUTH_URL` | ✅ 必填（正式網域，如 `https://www.steamfoot.com`） | ❌ **不可設**（讓 `VERCEL_URL` 生效） | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | 一組隨機 32+ 字元（固定值） | **與 Production 相同** | 任意（建議與 Prod 不同） |
| `DATABASE_URL` | Production DB（Supabase pooler） | Demo / Preview DB（**不可指向 Production**） | Local Docker 或 Demo DB |
| `DIRECT_URL` | Production direct | Demo DB direct | 同上 |
| `GOOGLE_CLIENT_ID` | 正式 OAuth app | 同 Prod（Preview 不驗 OAuth） | 開發用 |
| `GOOGLE_CLIENT_SECRET` | 對應 | 對應 | 對應 |
| `LINE_LOGIN_CHANNEL_ID` | 正式 | 同 Prod（Preview 不驗 OAuth） | 開發用 |
| `LINE_LOGIN_CHANNEL_SECRET` | 對應 | 對應 | 對應 |
| `RESEND_API_KEY` | 正式 | 可設或留空（留空 = console.log） | 留空 |
| `RESEND_FROM` | `noreply@steamfoot.tw` | Preview 寄件人 或留空 | 留空 |
| `CRON_SECRET` | 隨機字串 | 隨機字串（可不同） | 任意 |
| `HEALTH_API_URL` | 正式 | 正式或測試 | 開發用 |
| `HEALTH_API_KEY` | 對應 | 對應 | 對應 |

---

## Critical Rules

- Preview **MUST NOT** set `NEXTAUTH_URL`
- Preview **MUST NOT** point to production database
- Production **MUST** set `NEXTAUTH_URL`（fixed value，例：`https://www.steamfoot.com`）
- All environments **MUST** share a compatible `NEXTAUTH_SECRET`（否則 JWT 跨環境不相容 → cookie 失效）
- 程式碼層 **絕不硬編碼** `https://www.steamfoot.com` 作為 fallback

---

## Auth Behavior

- NextAuth 設定為 `trustHost: true`（見 `src/lib/auth.ts`）
- Base URL 取得順序（見 `src/lib/base-url.ts`）：
  1. `NEXTAUTH_URL`（若有）
  2. `VERCEL_URL`（Vercel 自動注入）
  3. `http://localhost:3000`（本機保底）
- Cross-origin redirect 被阻擋（PR1 加入 `redirect` callback 守門）
- Login / logout 均使用相對路徑；redirect 以當前 request host 為基準
- `src/lib/base-url.ts` 在 Preview 環境偵測到 `NEXTAUTH_URL` 時會 `console.warn` 提示

---

## OAuth Support Policy

**Preview environments do NOT support OAuth login.**

- **Credential login**（`/hq/login` email + 密碼、顧客手機 + 密碼）— Preview / Production 皆可驗
- **OAuth login**（LINE、Google）— **僅 Production 驗收**，Preview 不測
- 理由：Preview URL 每次部署可能變動，Google / LINE callback allowlist 無法逐一跟隨；目前無固定 preview URL 機制
- 若未來需要 Preview OAuth，另開任務評估「固定 branch-based preview URL」方案

---

## Email 連結 base URL

所有 email 連結（開通、密碼重設、提醒）都透過 `deriveBaseUrl()` 取得：

- Production → `NEXTAUTH_URL`（正式網域）
- Preview → `VERCEL_URL`（當前 preview deploy）
- Development → `http://localhost:3000`

**絕不硬編碼 production domain** — 否則 Preview 送出的 email 會指回 Prod，造成環境污染。

---

## Common Issues

### 1. Login redirects to production (from Preview)

**Cause:** `NEXTAUTH_URL` incorrectly set in Preview env → NextAuth 以它做 callback base

**Symptoms:**
- Preview 登入成功後頁面跳到 `www.steamfoot.com`
- Preview cookie 不見、refresh 變未登入
- Logout 後到正式站

**Fix:** 到 Vercel 面板 → Project Settings → Environment Variables → Preview → 刪除 `NEXTAUTH_URL`。然後 redeploy。

### 2. "Cookie not accepted" / JWT invalid after env change

**Cause:** `NEXTAUTH_SECRET` 三環境不一致，或被重新生成

**Fix:** 確認 `NEXTAUTH_SECRET` 在 Production 和 Preview 設成同一組。改後所有使用者 session 會失效，需重新登入。

### 3. Preview 資料污染到 Production

**Cause:** Preview `DATABASE_URL` 意外指到正式 DB

**Fix:** 確認 Preview `DATABASE_URL` / `DIRECT_URL` 為 demo DB。本機 `.env` 同理。

### 4. Email links 指回錯誤網域

**Cause:** 程式碼有硬編碼 fallback，或 Preview 設了 `NEXTAUTH_URL`

**Fix:**
- 檢查 `deriveBaseUrl()` 所有使用者是否都走 helper（PR1 已完成）
- 檢查 Preview 是否誤設 `NEXTAUTH_URL`

### 5. OAuth 在 Preview 失敗

**這是預期行為** — 見上方「OAuth Support Policy」。僅驗 credential login。

---

## 本機開發 `.env`

本機 `.env` 不進 git。需設：

```bash
# 本機 DB（Docker 或 demo DB）
DATABASE_URL="..."
DIRECT_URL="..."

# NextAuth
NEXTAUTH_SECRET="任何 32+ 字元字串"
NEXTAUTH_URL="http://localhost:3000"

# OAuth（可選，本機通常不跑 OAuth）
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

**禁止在本機 `.env` 填正式 Supabase URL** — 本機改任何東西都會進 prod。若不小心設了，立刻改成無效值或切到 demo DB。

---

## 部署流程

```
branch
  → PR
  → Vercel Preview 自動部署
  → 驗收（credential login only；見 preview-smoke-test.md）
  → merge main
  → Production 自動部署
  → 正式驗收（含 OAuth）
```

規範：

- 未驗收的 PR 不可宣稱「網站已更新」
- Preview 驗收必須附 Preview URL
- Production 驗收看正式網域
- Preview 與 Production 截圖不可混用
