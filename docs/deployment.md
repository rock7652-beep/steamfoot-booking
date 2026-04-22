# 部署與環境變數

本文件定義 Vercel 三環境（Production / Preview / Development）的 env var 設定規則，避免登入 / 登出 / Email 連結在不同環境混亂。

---

## 基本原則

1. **Production 與 Preview 必須邏輯分離**
   - 不可讓 Preview 半連正式、半連測試
   - 正式 DB 只給 Production

2. **Session / Logout 必須同網域閉環**
   - Preview 網域登入 → Preview 網域登出
   - 不可跨 host（code 層已加 `redirect` callback 守門）

3. **`NEXTAUTH_URL` 是登入流程最容易踩雷的 env**
   - 設錯會強制 callback / redirect 導到錯誤 host
   - **Preview 不要設**，讓 NextAuth v5 靠 `trustHost: true` + `VERCEL_URL` 自動處理

---

## Vercel 環境變數矩陣

| Key | Production | Preview | Development |
|---|---|---|---|
| `DATABASE_URL` | 正式 Supabase pooler | **共用 demo DB**（PR2 指定） | 本機 Docker 或 demo DB |
| `DIRECT_URL` | 正式 Supabase direct | demo DB direct | 同上 |
| `NEXTAUTH_SECRET` | 一組隨機 32+ 字元 | **與 Prod 相同**（否則跨 env cookie 不相容） | 任意 |
| `NEXTAUTH_URL` | `https://www.steamfoot.com` | **不設**（讓 `VERCEL_URL` 生效） | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | 正式 OAuth app | Preview OAuth app 或同 Prod（需加白名單） | 開發用 |
| `GOOGLE_CLIENT_SECRET` | 對應 | 對應 | 對應 |
| `LINE_LOGIN_CHANNEL_ID` | 正式 | Preview 或同 Prod | 開發用 |
| `LINE_LOGIN_CHANNEL_SECRET` | 對應 | 對應 | 對應 |
| `RESEND_API_KEY` | 正式 | 可設或留空（留空 = console.log） | 留空 |
| `RESEND_FROM` | `noreply@steamfoot.tw` | Preview 專用寄件人 或留空 | 留空 |
| `CRON_SECRET` | 隨機字串 | 隨機字串（可不同） | 任意 |
| `HEALTH_API_URL` | 正式 | 正式或測試 | 開發用 |
| `HEALTH_API_KEY` | 對應 | 對應 | 對應 |

---

## 為什麼 Preview 不設 `NEXTAUTH_URL`

NextAuth v5 規則：

- 若設了 `NEXTAUTH_URL` → 用這個值做 callback / redirect base URL
- 若沒設 `NEXTAUTH_URL` + `trustHost: true` + 跑在 Vercel → 用 `VERCEL_URL`（Vercel 自動注入當前部署 URL）

Preview 每次部署 URL 會變（例如 `steamfoot-booking-abc123.vercel.app`），若硬設 `NEXTAUTH_URL=https://www.steamfoot.com`，登入成功後會被導回 Prod，造成：

- Cookie 設到 Prod host，Preview 再 refresh 就變未登入
- Logout 嘗試在 Prod host 清 cookie，Preview 狀態不變
- OAuth callback 送回 Prod，Preview 收不到

**避免方式：Preview 這個 key 在 Vercel 面板直接留空。**

---

## Email 連結的 base URL

所有 email 連結（開通、密碼重設、提醒）都透過 `src/lib/base-url.ts` 的 `deriveBaseUrl()` 取得 base URL，優先順序：

1. `NEXTAUTH_URL`
2. `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_BASE_URL`
3. `VERCEL_URL`（自動，無 protocol）
4. `http://localhost:3000`

**絕不硬編碼 `https://www.steamfoot.com`** — 否則 Preview 送出的 email 連結會指回 Prod。

---

## OAuth callback 白名單

**注意：Preview URL 每次部署會變**，Google / LINE 的 callback 白名單每次都要加很不實際。建議做法：

- 用 Vercel 的 **branch-based URL**（`*-git-<branch>.vercel.app`）— 同一 branch 的 preview URL 固定
- 在 Google / LINE 後台把這類 branch URL 一次加入白名單
- 或：Preview 先不做 OAuth 驗收，只驗 credentials login；OAuth 留到 PR2 處理

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
  → 驗收（含 PREVIEW 標記）
  → merge main
  → Production 自動部署
  → 正式驗收
```

規範：

- 未驗收的 PR 不可宣稱「網站已更新」
- Preview 驗收必須附 Preview URL
- Production 驗收看正式網域
- Preview 與 Production 截圖不可混用
