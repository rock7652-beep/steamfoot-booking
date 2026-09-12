# SPA Preview session-pool exhaustion

Vercel deployment f16d06a0 runtime logs identify all three reported page digests (72406207, 1114712191, 3740443918) as EMAXCONNSESSION: max clients reached, session pool size 15. Read-only pg_stat_activity on verified steamfoot-preview confirmed 15 idle postgres connections. No sessions were terminated and no database records changed.

Runtime repair is restricted to VERCEL_ENV=preview, branch codex/hq-module-foundation, the verified shared-pool host and postgres.ttworfzgwejdeolegkxl username. The two Prisma clients switch the existing runtime URL from shared session port 5432 to transaction port 6543, enforce pgbouncer=true and connection_limit=1. Credentials/TLS stay intact; DIRECT_URL and migrations are unaffected. Both client instances are reused within the Preview process. Production, other branches and other database identities are not rewritten.

A node-only instrumentation hook on this exact Preview target performs two read-only queries and logs only booleans/mode/port, with no public diagnostic endpoint or returned data. The verification marker is [spa-preview-pool] verified. A READY build alone is not runtime evidence.

40 targeted tests passed, including endpoint/branch/environment guards, credential preservation and existing commerce tests. TypeScript and ESLint passed.

Reference: https://supabase.com/docs/guides/database/connecting-to-postgres (shared transaction pooler for serverless; prepared statements disabled).
