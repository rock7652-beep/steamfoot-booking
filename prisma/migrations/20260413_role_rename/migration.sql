-- Phase B: 角色正名
-- STORE_MANAGER → OWNER, COACH → PARTNER in UserRole enum

-- Step 1: Rename enum values in UserRole
ALTER TYPE "UserRole" RENAME VALUE 'STORE_MANAGER' TO 'OWNER';
ALTER TYPE "UserRole" RENAME VALUE 'COACH' TO 'PARTNER';
