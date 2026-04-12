import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/** Append connection pool params if not already present */
function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? ''
  const params: Record<string, string> = {
    connection_limit: '5',   // Supabase free tier ≤20; keep per-instance low
    pool_timeout: '10',      // Fail fast (seconds) instead of hanging forever
    connect_timeout: '10',   // TCP connect timeout (seconds)
  }
  const url = new URL(base)
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
