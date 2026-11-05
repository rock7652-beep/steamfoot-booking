-- Read-only review report. Run inside BEGIN READ ONLY; does not authorize installation.
WITH targets(name) AS (VALUES ('StoreSubscriptionReferralCode'),('StoreSubscriptionReferral'),
  ('StoreSubscriptionReferralPayment'),('StoreSubscriptionReferralRefundReview'),('StoreSubscriptionReferralReward')),
required(table_name,column_name,udt) AS (VALUES ('Store','id','text'),('StoreSubscription','id','text'),
  ('ConsultationLead','id','text'),('ConsultationLead','originalPayload','jsonb'),
  ('Store','planExpiresAt','timestamp'),('Store','currentSubscriptionId','text'),
  ('StoreSubscription','storeId','text'),('StoreSubscription','expiresAt','timestamp'),
  ('StoreSubscription','priceAmount','int4'),('StoreSubscription','updatedBy','text'),
  ('StorePlanChange','metadataJson','jsonb'),('StorePlanChange','operatorUserId','text')),
columns AS (SELECT r.*,c.udt_name=r.udt AS matches FROM required r LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name)
SELECT jsonb_build_object('database',current_database(),'actor',current_user,
  'readOnly',current_setting('transaction_read_only')='on',
  'newTablesAllAbsent',(SELECT bool_and(to_regclass(format('public.%I',name)) IS NULL) FROM targets),
  'requiredColumnsMatch',(SELECT bool_and(coalesce(matches,false)) FROM columns),
  'columnChecks',(SELECT jsonb_agg(to_jsonb(columns)) FROM columns),
  'canCreateInPublic',has_schema_privilege(current_user,'public','CREATE'),
  'canReferenceParents',has_table_privilege(current_user,'public."Store"','REFERENCES')
    AND has_table_privilege(current_user,'public."StoreSubscription"','REFERENCES')
    AND has_table_privilege(current_user,'public."ConsultationLead"','REFERENCES'),
  'unresolvedMigrations',(SELECT count(*) FROM public."_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL),
  'existingAppliedMigrationCount',(SELECT count(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)
) AS preflight;
