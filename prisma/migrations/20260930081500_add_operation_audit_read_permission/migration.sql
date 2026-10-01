-- Existing active store owners receive the new read-only audit-center permission.
-- Delegated staff remain opt-in through the existing per-account permission UI.
INSERT INTO "StaffPermission" (id, "staffId", permission, granted)
SELECT gen_random_uuid()::text, s.id, 'audit.read', true
FROM "Staff" s
WHERE s."isOwner" = true
  AND s.status::text = 'ACTIVE'
ON CONFLICT ("staffId", permission) DO NOTHING;
