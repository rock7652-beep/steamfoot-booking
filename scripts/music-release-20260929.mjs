// Assemble reviewed SQL only; never connects or executes.
// Apply through the migration tool to qijlnhtpbintanzpxkvf after release checks.
import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const manifest=[
 ["20260928131000_music_flexible_lesson_count","1d72ff06f3aa7aaa1e9f4b09f86e82bc633b4b7b401bf7233af5ab6f0f6c1f0b"],
 ["20260928133000_music_purchase_terms","aebde5b75eafd4446fb72d25a269f02a0971086a18d52d8ceef311ef24e0e175"],
 ["20260928140000_music_subject_catalog","11070619ca5b67ddca61ec3ae6a4af609c651deae5f55b81ffa206163d1ebb74"],
 ["20260928161902_music_display_order","7369fabac26e4a34115a7805bb705913cebfa27420e270232cf47a995e0b981a"],
 ["20260928165221_music_plan_teacher_share","821ce3de7023e5dead8193b7eee2cdb0717e4eae7b1377d6c3168988c4ab043b"],
 ["20260929042028_music_teacher_compensation_inheritance","32f72101be57a0e91de5a40cc5a2a3426b32d5c7f3ff807b264e9dafd5989500"],
 ["20260929044152_music_teacher_finance_scope","affd0368e130d9b236a1343e4a4333271d22e3259ec19c895fa0f461a06c49ed"],
];
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const names=manifest.map(([name])=>quote(name)).join(",");
const tables=["MusicSubject","CourseDisplayOrder","CourseTeacherCompensationSetting","CourseTeacherFinanceScope"];
const chunks=[],ledger=[];
for(const [name,hash] of manifest){
 const source=readFileSync(resolve(root,"prisma/migrations",name,"migration.sql"),"utf8");
 if(createHash("sha256").update(source).digest("hex")!==hash)throw new Error("Source changed: "+name);
 const body=source.replace(/^BEGIN;\s*/m,"").replace(/^COMMIT;\s*/m,"");
 if(/^\s*(BEGIN|COMMIT);/m.test(body))throw new Error("Unexpected transaction boundary: "+name);
 chunks.push("-- "+name+"\n"+body);
 ledger.push("INSERT INTO public._prisma_migrations(id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES(gen_random_uuid()::text,"+quote(hash)+",clock_timestamp(),"+quote(name)+",'Exact source applied atomically by music-release-20260929',clock_timestamp(),1);");
 const supabase=resolve(root,"supabase/migrations",name+".sql");
 if(existsSync(supabase)){
  if(readFileSync(supabase,"utf8")!==source)throw new Error("Supabase counterpart differs: "+name);
  const i=name.indexOf("_"),version=name.slice(0,i),label=name.slice(i+1);
  ledger.push("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES("+quote(version)+","+quote(label)+",ARRAY["+quote(source)+"]::text[]);");
 }
}
const unchanged=["Store","Staff","Customer","Booking","SpaBooking","Transaction","CourseCompensationSnapshot","CourseFeePayment"];
const digest=table=>'SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY md5(to_jsonb(t)::text)),\'\')) FROM public."'+table+'" t';
const checks=unchanged.map(t=>"IF ("+digest(t)+") IS DISTINCT FROM (SELECT digest FROM music_release_guard WHERE name="+quote(t)+") THEN RAISE EXCEPTION 'Unexpected data change: "+t+"'; END IF;").join("\n");
const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(2026092907);
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Unresolved migration failure'; END IF;
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name IN (${names})) THEN RAISE EXCEPTION 'Release already applied or partial; do not replay'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN (${tables.map(quote).join(",")})) THEN RAISE EXCEPTION 'Release tables already exist'; END IF;
END $guard$;
CREATE TEMP TABLE music_release_guard(name text PRIMARY KEY,digest text) ON COMMIT DROP;
${unchanged.map(t=>"INSERT INTO music_release_guard VALUES("+quote(t)+",("+digest(t)+"));").join("\n")}
${chunks.join("\n")}
DO $verify$ BEGIN
${checks}
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN (${tables.map(quote).join(",")}) AND relrowsecurity)<>4 THEN RAISE EXCEPTION 'Release RLS missing'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.course_capture_compensation()'::regprocedure) THEN RAISE EXCEPTION 'Unexpected definer function'; END IF;
END $verify$;
${ledger.join("\n")}
COMMIT;
`;
console.log(JSON.stringify({project:"qijlnhtpbintanzpxkvf",manifest,sql}));
