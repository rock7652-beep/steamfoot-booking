-- 新增權限代碼到現有員工的 StaffPermission 表
-- 新增的權限: wallet.adjust, plans.edit, business_hours.view, business_hours.manage, staff.view

-- 為所有現有員工新增 wallet.adjust（預設 granted=true，因為原 MANAGER 已有 wallet.create）
INSERT INTO "StaffPermission" ("id", "staffId", "permission", "granted")
SELECT gen_random_uuid()::text, s."id", 'wallet.adjust', true
FROM "Staff" s
WHERE NOT EXISTS (
  SELECT 1 FROM "StaffPermission" sp WHERE sp."staffId" = s."id" AND sp."permission" = 'wallet.adjust'
);

-- plans.edit（預設 granted=true）
INSERT INTO "StaffPermission" ("id", "staffId", "permission", "granted")
SELECT gen_random_uuid()::text, s."id", 'plans.edit', true
FROM "Staff" s
WHERE NOT EXISTS (
  SELECT 1 FROM "StaffPermission" sp WHERE sp."staffId" = s."id" AND sp."permission" = 'plans.edit'
);

-- business_hours.view（預設 granted=true）
INSERT INTO "StaffPermission" ("id", "staffId", "permission", "granted")
SELECT gen_random_uuid()::text, s."id", 'business_hours.view', true
FROM "Staff" s
WHERE NOT EXISTS (
  SELECT 1 FROM "StaffPermission" sp WHERE sp."staffId" = s."id" AND sp."permission" = 'business_hours.view'
);

-- business_hours.manage（預設 granted=true）
INSERT INTO "StaffPermission" ("id", "staffId", "permission", "granted")
SELECT gen_random_uuid()::text, s."id", 'business_hours.manage', true
FROM "Staff" s
WHERE NOT EXISTS (
  SELECT 1 FROM "StaffPermission" sp WHERE sp."staffId" = s."id" AND sp."permission" = 'business_hours.manage'
);

-- staff.view（預設 granted=true）
INSERT INTO "StaffPermission" ("id", "staffId", "permission", "granted")
SELECT gen_random_uuid()::text, s."id", 'staff.view', true
FROM "Staff" s
WHERE NOT EXISTS (
  SELECT 1 FROM "StaffPermission" sp WHERE sp."staffId" = s."id" AND sp."permission" = 'staff.view'
);
