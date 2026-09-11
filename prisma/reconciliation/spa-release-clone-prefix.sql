-- Test-only replay harness: use inside one transaction; append spa-release-schema.sql, fingerprint, then ROLLBACK.
BEGIN; CREATE SCHEMA spa_release_verify; SET LOCAL search_path TO spa_release_verify, public;
CREATE TYPE spa_release_verify."IndustryModule" AS ENUM ('STEAMFOOT','SPA');
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='StoreModuleInstallationStatus') THEN CREATE TYPE "StoreModuleInstallationStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'FAILED');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='StoreModuleInstallationStatus') <> ARRAY['ACTIVE', 'FAILED', 'PROVISIONING'] THEN RAISE EXCEPTION 'Unexpected enum: StoreModuleInstallationStatus'; END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaBookingStatus') THEN CREATE TYPE "SpaBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaBookingStatus') <> ARRAY['CANCELLED', 'COMPLETED', 'CONFIRMED', 'NO_SHOW', 'PENDING'] THEN RAISE EXCEPTION 'Unexpected enum: SpaBookingStatus'; END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaAvailabilityExceptionType') THEN CREATE TYPE "SpaAvailabilityExceptionType" AS ENUM ('UNAVAILABLE', 'AVAILABLE');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaAvailabilityExceptionType') <> ARRAY['AVAILABLE', 'UNAVAILABLE'] THEN RAISE EXCEPTION 'Unexpected enum: SpaAvailabilityExceptionType'; END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaEntitlementStatus') THEN CREATE TYPE "SpaEntitlementStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'VOIDED');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaEntitlementStatus') <> ARRAY['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'VOIDED'] THEN RAISE EXCEPTION 'Unexpected enum: SpaEntitlementStatus'; END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaEntitlementUseStatus') THEN CREATE TYPE "SpaEntitlementUseStatus" AS ENUM ('RESERVED', 'COMPLETED', 'RELEASED', 'VOIDED');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaEntitlementUseStatus') <> ARRAY['COMPLETED', 'RELEASED', 'RESERVED', 'VOIDED'] THEN RAISE EXCEPTION 'Unexpected enum: SpaEntitlementUseStatus'; END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaPaymentStatus') THEN CREATE TYPE "SpaPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'VOIDED', 'REFUNDED');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaPaymentStatus') <> ARRAY['PENDING', 'REFUNDED', 'SUCCESS', 'VOIDED'] THEN RAISE EXCEPTION 'Unexpected enum: SpaPaymentStatus'; END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaPaymentMethod') THEN CREATE TYPE "SpaPaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'LINE_PAY', 'CREDIT_CARD', 'STORED_VALUE', 'ENTITLEMENT', 'OTHER');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaPaymentMethod') <> ARRAY['CASH', 'CREDIT_CARD', 'ENTITLEMENT', 'LINE_PAY', 'OTHER', 'STORED_VALUE', 'TRANSFER'] THEN RAISE EXCEPTION 'Unexpected enum: SpaPaymentMethod'; END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaStoredValueEntryType') THEN CREATE TYPE "SpaStoredValueEntryType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT', 'VOID');
 ELSIF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname='SpaStoredValueEntryType') <> ARRAY['ADJUSTMENT', 'CREDIT', 'DEBIT', 'REFUND', 'VOID'] THEN RAISE EXCEPTION 'Unexpected enum: SpaStoredValueEntryType'; END IF;
END $$;
CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" "IndustryModule" NOT NULL);
INSERT INTO "Store" SELECT id,"industryModule"::text::spa_release_verify."IndustryModule" FROM public."Store";
CREATE TABLE "Customer"(id text,"storeId" text,UNIQUE(id,"storeId"));
INSERT INTO "Customer" SELECT id,"storeId" FROM public."Customer";
CREATE TABLE "Staff"(id text,"storeId" text,UNIQUE(id,"storeId"));
INSERT INTO "Staff" SELECT id,"storeId" FROM public."Staff";
CREATE TEMP TABLE release_counts(name text,n bigint);
DO $$ DECLARE t text; cols text; ix record; BEGIN
FOREACH t IN ARRAY ARRAY['StoreModuleInstallation','SpaBooking','SpaBookingItem','SpaTreatment','SpaServiceLocation','SpaTreatmentServiceLocation','SpaSkill','SpaTreatmentSkill','SpaStaffSkill','SpaStaffAvailability','SpaStaffAvailabilityException','SpaReceipt','SpaPackage','SpaCreditSale','SpaRefund','SpaBookingGroup','SpaEntitlement','SpaEntitlementUse','SpaPayment','SpaStoredValueWallet','SpaStoredValueEntry','SpaStaffCompensation'] LOOP
IF to_regclass(format('public.%I',t)) IS NULL THEN CONTINUE; END IF;
SELECT string_agg(format('%I %s %s %s',a.attname,replace(format_type(a.atttypid,a.atttypmod),'public.',''),CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE '' END,CASE WHEN d.adbin IS NOT NULL THEN 'DEFAULT '||replace(pg_get_expr(d.adbin,d.adrelid),'public.','') ELSE '' END),', ' ORDER BY a.attnum) INTO cols
FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=format('public.%I',t)::regclass AND a.attnum>0 AND NOT a.attisdropped;
EXECUTE format('CREATE TABLE spa_release_verify.%I (%s)',t,cols);
-- Cast through JSON to use private enum types while preserving every value.
EXECUTE format('INSERT INTO spa_release_verify.%I SELECT (jsonb_populate_record(NULL::spa_release_verify.%I,to_jsonb(p))).* FROM public.%I p',t,t,t);
FOR ix IN SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=t AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE contype='x' AND conrelid=format('public.%I',t)::regclass) LOOP
EXECUTE replace(ix.indexdef,'public.','spa_release_verify.');
END LOOP;
EXECUTE format('INSERT INTO release_counts SELECT %L,count(*) FROM spa_release_verify.%I',t,t);
END LOOP; END $$;
