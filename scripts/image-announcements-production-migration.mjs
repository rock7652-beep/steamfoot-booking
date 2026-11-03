import {createHash} from 'node:crypto';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
export const IMAGE_ANNOUNCEMENTS_MIGRATION='20261020100000_image_announcements';
export const IMAGE_ANNOUNCEMENTS_MIGRATION_FILE=`prisma/migrations/${IMAGE_ANNOUNCEMENTS_MIGRATION}/migration.sql`;
export const IMAGE_ANNOUNCEMENTS_CHECKSUM='eae83871df1395a42918bf55b28e1df6f6da11d8580cb4029d435494a5f0246f';
const tables=['ImageAnnouncementAsset','ImageAnnouncementSet'];
const expectedColumns=[
 ['ImageAnnouncementAsset','id','text',false,null],['ImageAnnouncementAsset','storeId','text',false,null],['ImageAnnouncementAsset','content','bytea',false,null],['ImageAnnouncementAsset','mimeType','text',false,null],
 ['ImageAnnouncementSet','storeId','text',false,null],['ImageAnnouncementSet','revision','integer',false,'0'],['ImageAnnouncementSet','items','jsonb',false,"'[]'::jsonb"],
];
function reject(code){throw new Error(`image_announcements_${code}`);}
export function verifyImageAnnouncementsChecksum(){
 if(createHash('sha256').update(readFileSync(IMAGE_ANNOUNCEMENTS_MIGRATION_FILE)).digest('hex')!==IMAGE_ANNOUNCEMENTS_CHECKSUM)reject('checksum_mismatch');
}
export async function readImageAnnouncementsSnapshot(db){
 const [relations,columns,constraints,indexes,ledger,failed]=await Promise.all([
 db.$queryRawUnsafe(`SELECT c.relname AS name, c.relkind::text AS kind, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
 (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS "publicAccess",
 EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS "clientAccess"
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('ImageAnnouncementSet','ImageAnnouncementAsset') ORDER BY c.relname`),
 db.$queryRawUnsafe(`SELECT table_name AS "table",column_name AS name,data_type AS type,is_nullable='YES' AS nullable,column_default AS "default" FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ImageAnnouncementSet','ImageAnnouncementAsset') ORDER BY table_name,ordinal_position`),
 db.$queryRawUnsafe(`SELECT t.relname AS "table",c.conname AS name,c.contype::text AS type,pg_get_constraintdef(c.oid) AS definition,c.convalidated AS validated FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype<>'n' AND t.relname IN ('ImageAnnouncementSet','ImageAnnouncementAsset') ORDER BY t.relname,c.conname`),
 db.$queryRawUnsafe(`SELECT t.relname AS "table",i.relname AS name,pg_get_indexdef(i.oid) AS definition,x.indisvalid AS valid,x.indisready AS ready FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('ImageAnnouncementSet','ImageAnnouncementAsset') ORDER BY t.relname,i.relname`),
 db.$queryRawUnsafe(`SELECT checksum,finished_at AS "finishedAt",rolled_back_at AS "rolledBackAt",applied_steps_count AS steps FROM public._prisma_migrations WHERE migration_name=$1 ORDER BY started_at`,IMAGE_ANNOUNCEMENTS_MIGRATION),
 db.$queryRawUnsafe(`SELECT migration_name AS name FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`),
 ]);
 return{relations,columns,constraints,indexes,ledger,failed};
}
export function hasExpectedImageAnnouncementsSchema(s){
 if(s.relations.length!==2||s.relations.some((r,i)=>r.name!==tables[i]||r.kind!=='r'||!r.rls||r.forced||r.policies!==0||r.publicAccess||r.clientAccess))return false;
 if(JSON.stringify(s.columns.map(c=>[c.table,c.name,c.type,c.nullable,c.default]))!==JSON.stringify(expectedColumns))return false;
 const expectedConstraints=[
 ['ImageAnnouncementAsset','ImageAnnouncementAsset_pkey','p','PRIMARY KEY (id)'],
 ['ImageAnnouncementAsset','ImageAnnouncementAsset_storeId_fkey','f','FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE'],
 ['ImageAnnouncementSet','ImageAnnouncementSet_pkey','p','PRIMARY KEY ("storeId")'],
 ['ImageAnnouncementSet','ImageAnnouncementSet_storeId_fkey','f','FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE'],
 ];
 if(s.constraints.some(c=>!c.validated)||JSON.stringify(s.constraints.map(c=>[c.table,c.name,c.type,c.definition]))!==JSON.stringify(expectedConstraints))return false;
 const expectedIndexes=[
 ['ImageAnnouncementAsset','ImageAnnouncementAsset_pkey','CREATE UNIQUE INDEX "ImageAnnouncementAsset_pkey" ON public."ImageAnnouncementAsset" USING btree (id)'],
 ['ImageAnnouncementAsset','ImageAnnouncementAsset_storeId_idx','CREATE INDEX "ImageAnnouncementAsset_storeId_idx" ON public."ImageAnnouncementAsset" USING btree ("storeId")'],
 ['ImageAnnouncementSet','ImageAnnouncementSet_pkey','CREATE UNIQUE INDEX "ImageAnnouncementSet_pkey" ON public."ImageAnnouncementSet" USING btree ("storeId")'],
 ];
 return !s.indexes.some(i=>!i.valid||!i.ready)&&JSON.stringify(s.indexes.map(i=>[i.table,i.name,i.definition]))===JSON.stringify(expectedIndexes);
}
export function imageAnnouncementsLedgerApplied(s){
 const active=s.ledger.filter(r=>r.rolledBackAt===null);
 return s.failed.length===0&&active.length===1&&active[0].checksum===IMAGE_ANNOUNCEMENTS_CHECKSUM&&active[0].finishedAt!==null&&active[0].steps===1;
}
/** Give Prisma exactly one migration file. Historical pending migrations are
 * neither copied, applied nor marked resolved. Uses the guarded DIRECT_URL.
 */
export function createImageAnnouncementsMigrationScope(){
 verifyImageAnnouncementsChecksum();
 const directory=mkdtempSync(join(tmpdir(),'image-announcements-release-'));
 try{
  const migrations=join(directory,'migrations');
  mkdirSync(join(migrations,IMAGE_ANNOUNCEMENTS_MIGRATION),{recursive:true});
  const sql=readFileSync(IMAGE_ANNOUNCEMENTS_MIGRATION_FILE);
  if(createHash('sha256').update(sql).digest('hex')!==IMAGE_ANNOUNCEMENTS_CHECKSUM)reject('checksum_mismatch');
  writeFileSync(join(migrations,IMAGE_ANNOUNCEMENTS_MIGRATION,'migration.sql'),sql);
  writeFileSync(join(migrations,'migration_lock.toml'),'provider = "postgresql"\n');
  const schema=join(directory,'schema.prisma');
  writeFileSync(schema,'datasource db {\n provider = "postgresql"\n url = env("DIRECT_URL")\n}\n');
  return{directory,schema,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
 }catch(error){rmSync(directory,{recursive:true,force:true});throw error;}
}
async function otherHistoryFingerprint(db){
 const rows=await db.$queryRawUnsafe(`SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]'::jsonb) AS entries FROM public._prisma_migrations m WHERE migration_name<>$1`,IMAGE_ANNOUNCEMENTS_MIGRATION);
 return createHash('sha256').update(JSON.stringify(rows[0].entries)).digest('hex');
}
/** Called only after ci-migrate's production/project/target guards.
 * The CLI records the real application; never resolves unrelated history.
 */
export async function runImageAnnouncementsMigration(prisma,runPrisma,log=()=>{}){
 verifyImageAnnouncementsChecksum();
 return prisma.$transaction(async tx=>{
  const lock=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(2026102010::bigint) AS locked');
  if(lock[0]?.locked!==true)reject('lock_unavailable');
  const before=await readImageAnnouncementsSnapshot(tx);
  if(before.failed.length)reject('failed_history_rejected');
  if(before.ledger.length){
   if(!hasExpectedImageAnnouncementsSchema(before)||!imageAnnouncementsLedgerApplied(before))reject('applied_state_rejected');
   log('image_announcements_already_applied_verified');return 'already-applied';
  }
  if(before.relations.length||before.columns.length||before.constraints.length||before.indexes.length)reject('preflight_rejected');
  const history=await otherHistoryFingerprint(tx);
  const scope=createImageAnnouncementsMigrationScope();
  try{
   log('image_announcements_preflight_verified');
   if(runPrisma(['migrate','deploy','--schema',scope.schema]).exitCode!==0)reject('deploy_failed');
   const after=await readImageAnnouncementsSnapshot(tx);
   if(!hasExpectedImageAnnouncementsSchema(after)||!imageAnnouncementsLedgerApplied(after))reject('final_schema_rejected');
   if(await otherHistoryFingerprint(tx)!==history)reject('unrelated_history_changed');
   log('image_announcements_unrelated_history_unchanged');
   log('image_announcements_final_schema_verified');return 'applied';
  }finally{scope.cleanup();}
 },{maxWait:5000,timeout:180000,isolationLevel:'ReadCommitted'});
}
