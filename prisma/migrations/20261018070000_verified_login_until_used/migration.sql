-- Generic legacy captures retain their original deadlines. Only a previously
-- staff-reviewed, exact Login subject may remain authorized until use/revocation.
ALTER TABLE "LineRebindRequest" ADD COLUMN IF NOT EXISTS "untilUsed" BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"LineRebindRequest"'::regclass AND conname='line_rebind_until_used_verified_only') THEN
    ALTER TABLE "LineRebindRequest" ADD CONSTRAINT "line_rebind_until_used_verified_only"
      CHECK (NOT "untilUsed" OR "reason" ~ '^LIFF_LOGIN_(CHANNEL_MIGRATION|FIRST_CAPTURE)_V1:verified:[a-f0-9]{64}$');
  END IF;
END $$;

-- Preserve existing exact, audited approvals only while their original
-- phone/owner/Login snapshot still agrees. Never approve a pending review,
-- reopen a revoked/consumed request, or turn generic migrations permanent.
WITH upgraded AS (
 UPDATE "LineRebindRequest" r SET "untilUsed"=true, "updatedAt"=CURRENT_TIMESTAMP
 FROM "Customer" c JOIN "User" u ON u.id=c."userId"
 WHERE r."customerId"=c.id AND r."storeId"=c."storeId"
   AND r.status='PENDING_CAPTURE' AND r."consumedAt" IS NULL AND NOT r."untilUsed"
   AND r.reason ~ '^LIFF_LOGIN_(CHANNEL_MIGRATION|FIRST_CAPTURE)_V1:verified:[a-f0-9]{64}$'
   AND c."mergedIntoCustomerId" IS NULL AND u.status='ACTIVE' AND u.role='CUSTOMER'
   AND r."phoneHash"=encode(sha256(convert_to(c.phone,'UTF8')),'hex')
   AND (SELECT count(*) FROM "Customer" p WHERE p."storeId"=c."storeId" AND p.phone=c.phone AND p."mergedIntoCustomerId" IS NULL)=1
   AND NOT EXISTS (SELECT 1 FROM "CustomerIdentityLink" x WHERE x."customerId"=c.id AND x."userId"<>u.id)
   AND EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."targetId"=r.id AND a.action='AUTHORIZE_VERIFIED_LIFF_LOGIN_RECOVERY')
   AND (
    (r.reason LIKE 'LIFF_LOGIN_CHANNEL_MIGRATION_V1:verified:%' AND
     EXISTS (SELECT 1 FROM "CustomerIdentityLink" l JOIN "Account" a ON a."userId"=l."userId" AND a.provider=l.provider AND a."providerAccountId"=l."providerAccountId"
       WHERE l."customerId"=c.id AND l."storeId"=c."storeId" AND l."userId"=u.id AND l.provider='line'
         AND l."lineUserId"=l."providerAccountId" AND r."oldUserIdHash"=encode(sha256(convert_to(l."providerAccountId",'UTF8')),'hex')))
    OR
    (r.reason LIKE 'LIFF_LOGIN_FIRST_CAPTURE_V1:verified:%' AND r."oldUserIdHash" IS NULL
     AND NOT EXISTS (SELECT 1 FROM "Account" a WHERE a."userId"=u.id AND a.provider='line')
     AND NOT EXISTS (SELECT 1 FROM "CustomerIdentityLink" l WHERE l."customerId"=c.id AND l.provider='line'))
   )
 RETURNING r.id,r."storeId",r."customerId",r."createdByUserId"
)
INSERT INTO "AuditLog" (id,"actorUserId",source,"storeId","targetType","targetId",action,"afterJson","createdAt")
SELECT 'audit_'||replace(gen_random_uuid()::text,'-',''),"createdByUserId",'POLICY_MIGRATION',"storeId",'LineRebindRequest',id,
 'VERIFIED_LOGIN_RECOVERY_UNTIL_USED',jsonb_build_object('customerId',"customerId",'untilUsed',true,'basis','prior_audited_exact_identity_approval_and_unchanged_owner_snapshot'),CURRENT_TIMESTAMP
FROM upgraded;
