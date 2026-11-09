/** Disposable authenticated acceptance only; no remote database is accepted. */
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {PrismaClient} from '@prisma/client';
import {PrismaClient as CourseClient} from '../../generated/course-client';
import {hashSync} from 'bcryptjs';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const {Client}=createRequire(import.meta.url)('pg') as {Client:new(options:{connectionString:string|undefined})=>{connect():Promise<void>;query(text:string):Promise<unknown>;end():Promise<void>}};
const db=new PrismaClient(),course=new CourseClient(),sql=new Client({connectionString:process.env.DATABASE_URL});
async function main(){
 await sql.connect();
 if(await db.store.count())throw Error('Fresh empty local QA database required');
 const audit=readFileSync('prisma/migrations/20261007002000_verified_audit_actor/migration.sql','utf8').match(/CREATE TABLE public\."OperationAuditOutbox" \([\s\S]*?\n\);/)?.[0];
 if(!audit)throw Error('Missing outbox DDL');await sql.query(audit.replace('CREATE TABLE','CREATE TABLE IF NOT EXISTS'));
 const sports=readFileSync('supabase/migrations/20261018020054_sports_cancellation_ledger_and_schedule_rules.sql','utf8').match(/CREATE TABLE public\."SportsStagingSessionRule" \([\s\S]*?\n\);/)?.[0];
 if(!sports)throw Error('Missing sports DDL');await sql.query(sports);
 await sql.query('CREATE TABLE "SportsPreviewScheduleSeries" (LIKE "CourseScheduleSeries" INCLUDING ALL)');
 const music=readFileSync('scripts/music-production-expand.sql','utf8');
 for(const table of ['CourseMusicTuition','CourseMusicReceipt','CourseMusicLessonAssignment']){
  const ddl=music.match(new RegExp(`CREATE TABLE public\\."${table}" \\([\\s\\S]*?\\n\\);`))?.[0];if(!ddl)throw Error('Missing music DDL');await sql.query(ddl);
 }
 for(const role of ['anon','authenticated','service_role'])await sql.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
 await sql.query(readFileSync('supabase/migrations/20261002093141_course_coach_notifications.sql','utf8'));
 const teacherSettings=readFileSync('prisma/migrations/20260929042028_music_teacher_compensation_inheritance/migration.sql','utf8').match(/CREATE TABLE "CourseTeacherCompensationSetting" \([\s\S]*?\n\);/)?.[0];if(!teacherSettings)throw Error('Missing teacher settings DDL');await sql.query(teacherSettings);
 await sql.query(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
 await sql.query('ALTER TABLE "DigitalManagerNotice" ADD COLUMN "publishedAt" timestamptz DEFAULT now(), ADD COLUMN "readAt" timestamptz, ADD COLUMN "readById" text, ADD COLUMN "readByName" text');
 const accounts=[];
 for(const kind of ['music','sports']){
  const storeId=kind==='music'?'store-lubymusic':'sports-live-flow-store',slug=kind==='music'?'lubymusic':'sports-live-flow',label=kind==='music'?'音樂':'運動',id=`qa-mixed-local-${kind}`,userId=id+'-owner',staffId=id+'-staff',password=randomBytes(24).toString('hex'),email=id+'@example.invalid',subjectId=id+'-subject';
  const templateId=kind==='music'?'teaching:'+subjectId:'sports_item_'+createHash('sha256').update(JSON.stringify([storeId,subjectId])).digest('hex'),roomId=id+'-room';
  await db.store.create({data:{id:storeId,slug,name:`混合${label}隔離驗收店`,industryModule:'COURSE',plan:'ALLIANCE'}});
  await db.user.create({data:{id:userId,email,name:`${label}驗收店長`,role:'OWNER',passwordHash:hashSync(password,12)}});
  await db.staff.create({data:{id:staffId,userId,storeId,displayName:`混合${label}老師`,isOwner:true,courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:[templateId]}});
  await db.shopConfig.create({data:{storeId,shopName:`混合${label}隔離驗收店`,bookingWindowDays:2000}});
  for(const featureKey of ['basic_booking','customer_management','staff_management','transaction','plan_management','business.'+(kind==='music'?'music':'fitness')])await db.storeFeatureEntitlement.create({data:{storeId,featureKey,status:'ENABLED'}});
  for(let dayOfWeek=0;dayOfWeek<7;dayOfWeek++)await db.businessHours.create({data:{storeId,dayOfWeek,isOpen:true,openTime:'08:00',closeTime:'22:00',slotInterval:60,defaultCapacity:4,segments:[{openTime:'08:00',closeTime:'22:00',slotInterval:60,defaultCapacity:4}]}});
  await course.courseBookingRule.create({data:{storeId,selfBookingEnabled:true,assignedSchedulingEnabled:true,backendNoticesEnabled:false}});
  await course.musicSubject.create({data:{id:subjectId,storeId,name:`混合驗收${label}`}});
  await course.courseRoom.create({data:{id:roomId,storeId,name:`混合${label}教室`,capacity:4}});
  await course.courseTemplate.create({data:{id:templateId,storeId,name:`混合驗收${label}`,musicSubjectId:subjectId,durationMinutes:60,pointCost:1,capacity:4,defaultRoomId:roomId,classType:'GROUP'}});
  // Real stores already have fee settings. Regular scheduling must remain usable
  // when these exist, while trial pricing keeps its explicit selection rules.
  for(const mode of kind==='sports'?['OPEN','ASSIGNED']:['LEGACY'])await course.coursePointPlan.create({data:{id:id+'-fee-'+mode,storeId,name:`${label}單次收費 ${mode}`,unit:'SESSION',points:1,price:800,validDays:3650,templateIds:[templateId],sportsMode:mode,...(kind==='sports'?{sportsSubjectId:mode==='ASSIGNED'?subjectId:null,sportsCost:mode==='ASSIGNED'?1:null}:{musicTerms:1,musicTermSizes:[1]}),chargeSettings:{kind:'single',durationMinutes:90,trialPrice:300,trialDuration:30,providerIds:[staffId]}}});
  const customers=[];
  for(let n=0;n<3;n++){const cid=id+'-student-'+n,name=`${label}驗收學員${['甲','乙','丙'][n]}`,memberEmail=cid+'@example.invalid',memberPassword=randomBytes(24).toString('hex');await db.user.create({data:{id:cid+'-user',email:memberEmail,name,role:'CUSTOMER',passwordHash:hashSync(memberPassword,10)}});await db.customer.create({data:{id:cid,userId:cid+'-user',storeId,name,phone:'099900010'+n,assignedStaffId:staffId}});customers.push({id:cid,name,email:memberEmail,password:memberPassword});}
  accounts.push({kind,storeId,slug,userId,staffId,email,password,templateId,subjectId,subjectName:`混合驗收${label}`,roomId,roomName:`混合${label}教室`,teacherName:`混合${label}老師`,customers,date:'2030-11-04',time:'10:00'});
 }
 writeFileSync('/tmp/mixed-local-access.json',JSON.stringify({base:'http://localhost:3107',accounts}),{mode:0o600});
 console.log(JSON.stringify({isolated:true,modules:2,stores:accounts.map(a=>a.storeId),seeded:true}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Seed failed');process.exitCode=1;}).finally(async()=>{await sql.end();await db.$disconnect();await course.$disconnect();});
