import { PrismaClient } from '@prisma/client'
import { buildDatabaseUrl } from '@/lib/database-url'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Append connection-pool params to DATABASE_URL.
 *
 * 1. 偵測 Supabase transaction pooler（host 含 "pooler.supabase.com" 或 port 6543）→
 *    自動加 `pgbouncer=true`。否則 Prisma 會在 transaction-mode pgBouncer 上嘗試
 *    prepared statements 然後失敗 / 重新 prepare，每 query 多一次 round-trip。
 *
 * 2. 未指定 `connection_limit` 時：
 *    - Serverless（VERCEL=1）→ `1`（每個 lambda 一條，避免 pool 耗盡）
 *    - 其他（本機 dev / 長壽 process）→ `5`
 *
 * 3. 絕對不覆寫 URL 已自帶的參數。
 *
 * 參考：https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: buildDatabaseUrl() },
    },
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
