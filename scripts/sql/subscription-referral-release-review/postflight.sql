-- Read-only report after separately approved installation; never enables the campaign.
WITH targets(name) AS (VALUES ('StoreSubscriptionReferralCode'),('StoreSubscriptionReferral'),
  ('StoreSubscriptionReferralPayment'),('StoreSubscriptionReferralRefundReview'),('StoreSubscriptionReferralReward')),
tables AS (SELECT t.name,c.oid,c.relrowsecurity FROM targets t LEFT JOIN pg_class c ON c.oid=to_regclass(format('public.%I',t.name))),
access AS (SELECT t.name,r.rolname,CASE WHEN t.oid IS NULL THEN true ELSE
  has_table_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END AS allowed
  FROM tables t CROSS JOIN pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')),
constraints AS (SELECT contype,count(*) AS count FROM pg_constraint WHERE conrelid IN (SELECT oid FROM tables) GROUP BY contype)
SELECT jsonb_build_object('database',current_database(),'actor',current_user,
  'readOnly',current_setting('transaction_read_only')='on',
  'allFivePresent',(SELECT count(oid)=5 FROM tables),
  'allFiveRls',(SELECT bool_and(oid IS NOT NULL AND relrowsecurity) FROM tables),
  'apiRolesHaveNoPrivileges',(SELECT NOT coalesce(bool_or(allowed),false) FROM access),
  'apiAccessChecks',(SELECT jsonb_agg(to_jsonb(access)) FROM access),
  'publicHasNoPrivileges',NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL
    aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid IN (SELECT oid FROM tables) AND a.grantee=0),
  'constraints',(SELECT jsonb_object_agg(contype,count) FROM constraints),
  'migration',(SELECT jsonb_build_object('checksum',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL)
    FROM public."_prisma_migrations" WHERE migration_name='20261104235300_subscription_referral_private_core'
    ORDER BY started_at DESC LIMIT 1)
) AS postflight;
