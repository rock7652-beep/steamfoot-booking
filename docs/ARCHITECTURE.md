# 技術架構文件

## 專案定位

蒸足店預約＋課程消費管理系統。非公開預約平台，而是「店長名下會員的蒸足課程預約與月結系統」。

## 技術棧

| 層級 | 技術 | 版本 | 選擇理由 |
|------|------|------|----------|
| Framework | Next.js (App Router) | 16.x | SSR + Server Actions，全端整合 |
| Language | TypeScript | 5.x | 型別安全，減少運行時錯誤 |
| Database | PostgreSQL | 16+ | 複雜關聯查詢、JSON 支援、交易安全 |
| ORM | Prisma | 6.x | 型別安全 ORM，migration 管理方便 |
| Auth | NextAuth.js v5 (Auth.js) | beta | 支援 credentials + OAuth，與 Next.js 深度整合 |
| Validation | Zod | 3.x | Server Actions 輸入驗證 |
| Styling | Tailwind CSS | 4.x | 快速開發 UI |
| Deploy | Vercel | - | 零配置部署 Next.js |
| DB Hosting | Supabase / Neon | - | 免費 tier PostgreSQL，Vercel 整合好 |
| Cron | Vercel Cron | - | 提醒排程、月結 |

## 為什麼這樣選

### PostgreSQL > SQLite
- 多用戶同時存取（Owner, Manager, Customer 同時操作）
- 複雜 JOIN 查詢（月報、營收歸屬）
- ENUM type 原生支援
- JSON/JSONB 欄位（audit log 的 before/after）
- Row-level locking（預約不超賣）

### NextAuth.js v5 > 自建 JWT
- Session 管理成熟，不需自己處理 refresh
- 未來可擴展 LINE Login / Google OAuth
- Prisma adapter 直接整合
- Middleware 層統一驗證

### Server Actions > API Routes
- 商業邏輯集中在 server 端
- 型別安全 end-to-end
- 減少 API 路由維護成本
- 仍保留 API routes 給需要的場景（auth callback、webhook）

## 部署建議

### Production
- **App**: Vercel (Hobby / Pro)
- **Database**: Supabase 或 Neon PostgreSQL
- **Domain**: 自訂域名 via Vercel

### Staging
- Vercel Preview Deployments（每個 PR 自動部署）
- Supabase 獨立 staging project

## Local Dev Setup

```bash
# 1. Clone & install
npm install

# 2. 啟動本地 PostgreSQL
docker compose up -d

# 3. 設定環境變數
cp .env.example .env

# 4. 初始化資料庫
npx prisma db push
npm run seed

# 5. 啟動開發伺服器
npm run dev
```

## 環境變數

| 變數 | 說明 | 範例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串 | `postgresql://user:pass@localhost:5432/steamfoot` |
| `NEXTAUTH_SECRET` | NextAuth 加密金鑰 | 至少 32 字元隨機字串 |
| `NEXTAUTH_URL` | 應用程式 URL | `http://localhost:3000` |
| `SMTP_HOST` | SMTP 主機 | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP Port | `587` |
| `SMTP_USER` | SMTP 帳號 | `your@gmail.com` |
| `SMTP_PASS` | SMTP 密碼 | App Password |
| `SMTP_FROM` | 寄件人 | `your@gmail.com` |
| `CRON_SECRET` | Cron 保護金鑰 | 隨機字串 |

## 核心架構原則

1. **商業邏輯不放 UI** — 所有業務規則在 `server/actions/` 和 `server/queries/`
2. **營收歸屬快照** — booking/transaction 建立時冗餘保存 `revenue_staff_id`
3. **RBAC 統一入口** — 所有 action 經過 `lib/permissions.ts` 驗證
4. **時段不寫死** — BookingSlot 表配置，前端動態載入
5. **歷史不可變** — 顧客轉讓不影響已建立的 booking/transaction
