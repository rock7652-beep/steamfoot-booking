# 蒸足店預約＋課程消費管理系統

店長名下會員的蒸足課程預約與月結系統。

---

## 快速啟動

### 前置需求

- Node.js 18+
- Docker Desktop（本地 PostgreSQL）

### 第一次設定

```bash
# 1. 安裝依賴
npm install

# 2. 啟動本地 PostgreSQL
docker compose up -d

# 3. 設定環境變數
cp .env.example .env

# 4. 初始化資料庫 + 測試資料
npx prisma db push
npm run seed

# 5. 啟動開發伺服器
npm run dev
```

開啟瀏覽器：http://localhost:3000

### 重置資料庫

```bash
npm run db:reset
```

### 資料庫管理 GUI

```bash
npm run db:studio
```

---

## 測試帳號

密碼皆為 `test1234`

| 角色 | Email | 說明 |
|------|-------|------|
| Owner | alice@steamfoot.tw | 店主，可管理全部 |
| Manager | bob@steamfoot.tw | 合作店長 B |
| Manager | carol@steamfoot.tw | 合作店長 C |

---

## 角色

| 角色 | 說明 |
|------|------|
| Owner | 店主，管理全店、所有店長、所有顧客 |
| Manager | 合作店長，管理自己名下顧客 |
| Customer | 顧客，購課後可自助預約 |

---

## 核心商業邏輯

1. 每位顧客有直屬店長，所有消費歸屬直屬店長
2. 首次預約通常由店長代約
3. 購課後才開放顧客自助預約
4. 到店完成後才扣堂
5. 歷史營收不受顧客轉讓影響
6. 合作店長每月繳固定空間分租費給店主

詳細設計見 `docs/` 目錄。

---

## 環境變數

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `NEXTAUTH_SECRET` | NextAuth 加密金鑰 |
| `NEXTAUTH_URL` | 應用程式 URL |

完整列表見 `.env.example`。

---

## 技術棧

- Next.js 16 (App Router)
- TypeScript
- PostgreSQL + Prisma
- NextAuth.js v5
- Tailwind CSS v4
- Zod

---

## 文件

- `docs/ARCHITECTURE.md` — 技術架構
- `docs/PERMISSIONS.md` — 權限設計
- `docs/API.md` — API / Server Actions 規劃
