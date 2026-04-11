-- ============================================================
-- Enable Row Level Security on ALL public schema tables
-- ============================================================
-- Context: Database is hosted on Supabase, which exposes a PostgREST API.
-- Without RLS, the `anon` and `authenticated` roles can read/write all tables
-- via the REST API, bypassing application-level auth (NextAuth + Prisma).
--
-- This migration:
-- 1. Enables RLS on every application table (30 tables)
-- 2. Revokes all direct table access from `anon` and `authenticated` roles
-- 3. Sets default privileges to deny future tables as well
--
-- Impact on Prisma: NONE — Prisma connects as the `postgres` role (table owner),
-- which bypasses RLS by default. All existing queries continue to work unchanged.
-- ============================================================

-- Auth tables (NextAuth.js)
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VerificationToken" ENABLE ROW LEVEL SECURITY;

-- Staff & permissions
ALTER TABLE public."Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StaffPermission" ENABLE ROW LEVEL SECURITY;

-- Customer management
ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CustomerPlanWallet" ENABLE ROW LEVEL SECURITY;

-- Booking & services
ALTER TABLE public."Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BookingSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MakeupCredit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ServicePlan" ENABLE ROW LEVEL SECURITY;

-- Financial
ALTER TABLE public."Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CashbookEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpaceFeeRecord" ENABLE ROW LEVEL SECURITY;

-- Messaging & reminders
ALTER TABLE public."Reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReminderRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MessageTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MessageLog" ENABLE ROW LEVEL SECURITY;

-- Configuration & operations
ALTER TABLE public."ShopConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BusinessHours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpecialBusinessDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SlotOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DutyAssignment" ENABLE ROW LEVEL SECURITY;

-- Audit & reporting
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OpsActionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OpsActionHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReconciliationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReconciliationCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReportSnapshot" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Revoke all PostgREST API access from anon and authenticated
-- ============================================================
-- These are the Supabase roles used by the REST API (PostgREST).
-- With no GRANT and RLS enabled + no policies, these roles have zero access.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Prevent future tables from being auto-accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
