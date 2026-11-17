import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CUSTOMER_MESSAGES_MIGRATION = '20261117090000_customer_messages';
export const CUSTOMER_MESSAGES_CHECKSUM = 'ac2b4e6930b20137a467bdd9f2c93837e3686d2bd420e9a13e25d1b28379f185';

// Manual reviewed installation only; never enables notifications or generic migrate deploy.
export function buildCustomerMessagesMigrationSql() {
  const sql = readFileSync(new URL(`../prisma/migrations/${CUSTOMER_MESSAGES_MIGRATION}/migration.sql`, import.meta.url), 'utf8');
  if (createHash('sha256').update(sql).digest('hex') !== CUSTOMER_MESSAGES_CHECKSUM) throw new Error('Customer messages migration checksum mismatch');
  if (sql.includes('$customer_messages_source$')) throw new Error('Migration delimiter conflict');
  return `DO $customer_messages_release$
BEGIN
PERFORM set_config('lock_timeout','3s',true);
PERFORM set_config('statement_timeout','30s',true);
PERFORM pg_advisory_xact_lock(hashtextextended('customer-messages-reviewed-release',0));
IF to_regclass('public."Store"') IS NULL OR to_regclass('public."User"') IS NULL OR to_regclass('public._prisma_migrations') IS NULL THEN
 RAISE EXCEPTION 'Customer messages dependencies missing';
END IF;
IF EXISTS (SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
 RAISE EXCEPTION 'Unresolved migration failure';
END IF;
IF to_regclass('public."CustomerMessageBatch"') IS NOT NULL OR to_regclass('public."CustomerMessageRecipient"') IS NOT NULL
 OR EXISTS (SELECT FROM public._prisma_migrations WHERE migration_name='${CUSTOMER_MESSAGES_MIGRATION}') THEN
 RAISE EXCEPTION 'Customer messages existing or partial state rejected';
END IF;
EXECUTE $customer_messages_source$${sql}$customer_messages_source$;
INSERT INTO public._prisma_migrations (id,checksum,migration_name,started_at,finished_at,applied_steps_count)
VALUES (gen_random_uuid()::text,'${CUSTOMER_MESSAGES_CHECKSUM}','${CUSTOMER_MESSAGES_MIGRATION}',now(),now(),1);
END $customer_messages_release$;`;
}
