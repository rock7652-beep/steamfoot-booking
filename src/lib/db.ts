import { PrismaClient } from '@prisma/client'

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
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? ''
  if (!base) return base
  const url = new URL(base)

  const isPooler =
    /pooler\.supabase\.com$/i.test(url.hostname) || url.port === '6543'
  // TODO(PR2): relies on env — verify against docs/deployment.md matrix.
  // 此 flag 用於偵測 "是否跑在 Vercel serverless"（preview + production 都算），
  // 與 runtime-env.ts 的 isProduction/isPreview 語意不同（後者區分兩個 Vercel 環境），
  // 故不改用 helper。若未來要獨立 "isVercelRuntime()" 再抽出。
  const isServerless =
    process.env.VERCEL === '1' || !!process.env.VERCEL_ENV

  const params: Record<string, string> = {
    connection_limit: isServerless ? '1' : '5',
    pool_timeout: '10',      // Fail fast (seconds) instead of hanging forever
    connect_timeout: '10',   // TCP connect timeout (seconds)
  }
  if (isPooler) {
    params.pgbouncer = 'true'
  }

  for (const [k, v] of Object.entries(params)) {
    if (!url.searchParams.has(k)) url.searchParams.set(k, v)
  }
  return url.toString()
}

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
