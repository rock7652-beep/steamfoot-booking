SELECT
 c.relrowsecurity AS rls_enabled,
 obj_description(c.oid,'pg_class')=('sports-permanent-series:v1:' || md5(jsonb_build_object(
 'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'valid',k.convalidated) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)
)::text)) AS version_matches,
 NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS browser_blocked,
 has_schema_privilege(current_user,'public','USAGE') AND
 has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT') AND
 has_table_privilege(current_user,c.oid,'UPDATE') AND
 (pg_has_role(current_user,c.relowner,'USAGE') OR (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)
 OR (SELECT count(*)=3 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname IN
 ('sports_series_app_select','sports_series_app_insert','sports_series_app_update') AND
 (SELECT oid FROM pg_roles WHERE rolname=current_user)=ANY(p.polroles))) AS app_can_use,
 (SELECT count(*)=22 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AND
 (SELECT count(*)=22 FROM pg_attribute a JOIN (VALUES
 ('id','text',true),('storeId','text',true),('requestKey','text',true),('templateId','text',true),
 ('nameSnapshot','text',true),('roomId','text',true),('coachId','text',true),
 ('startsAt','timestamp with time zone',true),('endsAt','timestamp with time zone',true),
 ('pointCost','integer',true),('capacity','integer',true),('frequency','text',true),
 ('untilDate','date',false),('generatedThrough','date',true),('excludedDates','text[]',true),
 ('generationError','text',false),('cancelledAt','timestamp with time zone',false),('createdById','text',true),
 ('createdAt','timestamp with time zone',true),('updatedAt','timestamp with time zone',true),
 ('enrollmentMode','text',true),('learnerSnapshot','jsonb',true)
 ) expected(name,type,required) ON a.attname=expected.name AND format_type(a.atttypid,a.atttypmod)=expected.type
 AND a.attnotnull=expected.required WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns_match,
 EXISTS(SELECT FROM pg_index i WHERE i.indrelid=c.oid AND i.indisunique AND i.indisvalid AND i.indisready
 AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=2 AND i.indnatts=2
 AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ordinality)
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum)=ARRAY['storeId','requestKey']) AS unique_request,
 current_user AS application_role
 FROM pg_class c WHERE c.oid=to_regclass('public."SportsScheduleSeries"') AND c.relkind='r'