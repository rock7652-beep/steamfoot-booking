-- Execute only on steamfoot-preview. All fixtures and audit writes roll back.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "LineRebindRequest") THEN
   RAISE EXCEPTION 'This rollback verification requires an empty preview LineRebindRequest table';
 END IF;
END $$;
DO $$
DECLARE
  k text;
  uid text;
  sid text;
  cid text;
  phone text;
  old_subject text;
  actual_subject text;
  pinned_reason text;
  case_index integer := 0;
  fixture_prefix text := 'qa_until_used_' || replace(gen_random_uuid()::text,'-','');
BEGIN
  FOREACH k IN ARRAY ARRAY['reviewed','generic','unreviewed','cancelled','consumed','changed-phone','changed-login','first-capture','wrong-owner','inactive','candidate-captured','expired'] LOOP
    case_index := case_index + 1;
    uid := fixture_prefix || '_user_' || k;
    sid := fixture_prefix || '_store_' || k;
    cid := fixture_prefix || '_customer_' || k;
    phone := '090000' || lpad(case_index::text,4,'0');
    old_subject := fixture_prefix || '_old_' || k;
    actual_subject := CASE WHEN k='changed-login' THEN old_subject || '_changed' ELSE old_subject END;
    pinned_reason := CASE WHEN k='generic' THEN 'LIFF_LOGIN_CHANNEL_MIGRATION_V1'
       WHEN k='first-capture' THEN 'LIFF_LOGIN_FIRST_CAPTURE_V1:verified:' || repeat('a',64)
       ELSE 'LIFF_LOGIN_CHANNEL_MIGRATION_V1:verified:' || repeat('a',64) END;
    INSERT INTO "User"(id,name,role,status,"updatedAt") VALUES(uid,'登入授權隔離驗證','CUSTOMER',CASE WHEN k='inactive' THEN 'SUSPENDED'::"UserStatus" ELSE 'ACTIVE'::"UserStatus" END,now());
    INSERT INTO "Store"(id,name,slug,"updatedAt") VALUES(sid,'登入授權隔離驗證',sid,now());
    INSERT INTO "Customer"(id,"storeId","userId",name,phone,"updatedAt") VALUES(cid,sid,uid,'登入授權隔離驗證',CASE WHEN k='changed-phone' THEN '0999999999' ELSE phone END,now());
    IF k='reviewed' THEN
      BEGIN
        INSERT INTO "Customer"(id,"storeId",name,phone,"updatedAt") VALUES(cid||'_duplicate',sid,'測試重複手機',phone,now());
        RAISE EXCEPTION 'Duplicate store phone unexpectedly accepted';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END IF;
    IF k <> 'first-capture' THEN
      INSERT INTO "Account"(id,"userId",type,provider,"providerAccountId") VALUES(uid||'_account',uid,'oauth','line',actual_subject);
      IF k='wrong-owner' THEN
        INSERT INTO "User"(id,name,"updatedAt") VALUES(uid||'_other','測試其他歸屬',now());
      END IF;
      INSERT INTO "CustomerIdentityLink"(id,"userId","storeId","customerId",provider,"providerAccountId","lineUserId","updatedAt")
        VALUES(uid||'_link',CASE WHEN k='wrong-owner' THEN uid||'_other' ELSE uid END,sid,cid,'line',actual_subject,actual_subject,now());
    END IF;
    INSERT INTO "LineRebindRequest"(id,"storeId","customerId","createdByUserId",reason,"phoneHash","oldUserIdHash",status,"expiresAt","consumedAt","updatedAt")
      VALUES(fixture_prefix||'_request_'||k,sid,cid,uid,pinned_reason,encode(sha256(convert_to(phone,'UTF8')),'hex'),
      CASE WHEN k='first-capture' THEN NULL ELSE encode(sha256(convert_to(old_subject,'UTF8')),'hex') END,
      CASE WHEN k='cancelled' THEN 'CANCELLED'::"LineRebindRequestStatus" WHEN k='consumed' THEN 'CONSUMED'::"LineRebindRequestStatus" WHEN k='expired' THEN 'EXPIRED'::"LineRebindRequestStatus" WHEN k='candidate-captured' THEN 'CANDIDATE_CAPTURED'::"LineRebindRequestStatus" ELSE 'PENDING_CAPTURE'::"LineRebindRequestStatus" END,
      '2000-01-01',CASE WHEN k='consumed' THEN now() ELSE NULL END,now());
    IF k <> 'unreviewed' THEN
      INSERT INTO "AuditLog"(id,"actorUserId","storeId","targetType","targetId",action)
        VALUES(fixture_prefix||'_approval_'||k,uid,sid,'LineRebindRequest',fixture_prefix||'_request_'||k,'AUTHORIZE_VERIFIED_LIFF_LOGIN_RECOVERY');
    END IF;
  END LOOP;
END $$;

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

DO $$
DECLARE n integer; con text;
BEGIN
 SELECT count(*) INTO n FROM "LineRebindRequest" WHERE "untilUsed";
 IF n<>2 THEN RAISE EXCEPTION 'Expected exactly 2 reviewed grants, got %',n; END IF;
 IF EXISTS(SELECT 1 FROM "LineRebindRequest" WHERE "untilUsed" AND id NOT LIKE '%_request_reviewed' AND id NOT LIKE '%_request_first-capture') THEN RAISE EXCEPTION 'Unreviewed or changed grant upgraded'; END IF;
 SELECT count(*) INTO n FROM "AuditLog" WHERE action='VERIFIED_LOGIN_RECOVERY_UNTIL_USED';
 IF n<>2 THEN RAISE EXCEPTION 'Expected exactly 2 policy audit rows, got %',n; END IF;
 BEGIN
   UPDATE "LineRebindRequest" SET "untilUsed"=true WHERE id LIKE '%_request_generic';
   RAISE EXCEPTION 'Generic indefinite grant unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS con=CONSTRAINT_NAME;
   IF con<>'line_rebind_until_used_verified_only' THEN RAISE; END IF;
 END;
 -- Same predicate used by Login selection: past deadline still permits exact grant.
 SELECT count(*) INTO n FROM "LineRebindRequest" WHERE "untilUsed" AND status='PENDING_CAPTURE' AND "consumedAt" IS NULL
   AND ("expiresAt">now() OR ("untilUsed" AND reason ~ '^LIFF_LOGIN_(CHANNEL_MIGRATION|FIRST_CAPTURE)_V1:verified:[a-f0-9]{64}$'));
 IF n<>2 THEN RAISE EXCEPTION 'Exact grants did not survive original deadlines'; END IF;
END $$;

-- Repeat backfill to verify idempotence.
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

DO $$
DECLARE n integer; con text;
BEGIN
 SELECT count(*) INTO n FROM "LineRebindRequest" WHERE "untilUsed";
 IF n<>2 THEN RAISE EXCEPTION 'Expected exactly 2 reviewed grants, got %',n; END IF;
 IF EXISTS(SELECT 1 FROM "LineRebindRequest" WHERE "untilUsed" AND id NOT LIKE '%_request_reviewed' AND id NOT LIKE '%_request_first-capture') THEN RAISE EXCEPTION 'Unreviewed or changed grant upgraded'; END IF;
 SELECT count(*) INTO n FROM "AuditLog" WHERE action='VERIFIED_LOGIN_RECOVERY_UNTIL_USED';
 IF n<>2 THEN RAISE EXCEPTION 'Expected exactly 2 policy audit rows, got %',n; END IF;
 BEGIN
   UPDATE "LineRebindRequest" SET "untilUsed"=true WHERE id LIKE '%_request_generic';
   RAISE EXCEPTION 'Generic indefinite grant unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS con=CONSTRAINT_NAME;
   IF con<>'line_rebind_until_used_verified_only' THEN RAISE; END IF;
 END;
 -- Same predicate used by Login selection: past deadline still permits exact grant.
 SELECT count(*) INTO n FROM "LineRebindRequest" WHERE "untilUsed" AND status='PENDING_CAPTURE' AND "consumedAt" IS NULL
   AND ("expiresAt">now() OR ("untilUsed" AND reason ~ '^LIFF_LOGIN_(CHANNEL_MIGRATION|FIRST_CAPTURE)_V1:verified:[a-f0-9]{64}$'));
 IF n<>2 THEN RAISE EXCEPTION 'Exact grants did not survive original deadlines'; END IF;
END $$;

DO $$
DECLARE n integer;
BEGIN
 UPDATE "LineRebindRequest" SET status='CONSUMED',"consumedAt"=now() WHERE "untilUsed" AND status='PENDING_CAPTURE' AND "consumedAt" IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>2 THEN RAISE EXCEPTION 'Expected 2 single-use consumptions, got %',n; END IF;
 UPDATE "LineRebindRequest" SET status='CONSUMED',"consumedAt"=now() WHERE "untilUsed" AND status='PENDING_CAPTURE' AND "consumedAt" IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Consumed grants replayed'; END IF;
END $$;
ROLLBACK;
SELECT jsonb_build_object('schema_backfill_cases',12,'store_phone_uniqueness','passed','eligible_grants',2,'idempotence','passed','generic_indefinite_constraint','passed','past_deadline_selection','passed','single_use_predicate','passed','fixtures_rolled_back',true,'remaining_requests',(SELECT count(*) FROM "LineRebindRequest"),'remaining_policy_audits',(SELECT count(*) FROM "AuditLog" WHERE action='VERIFIED_LOGIN_RECOVERY_UNTIL_USED')) AS preview_database_verification;
