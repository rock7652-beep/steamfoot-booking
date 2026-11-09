import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {assertBeautySharedPagesLocalQaEnvironment} from '../../beauty-shared-pages-local-qa-scope.mjs';
const require=createRequire(import.meta.url);
Object.assign(process.env,JSON.parse(readFileSync('/tmp/monthly-live-env.json','utf8')));
assertBeautySharedPagesLocalQaEnvironment(process.env);
const {Client}=require('pg'),{PrismaClient}=require('@prisma/client');
const {PrismaClient:Course}=require('../../../generated/course-client');
const {PrismaClient:Beauty}=require('../../../generated/beauty-client');
const {hashSync}=require('bcryptjs');
const sql=new Client({connectionString:process.env.DATABASE_URL});await sql.connect();
if((await sql.query(`SELECT to_regclass('public."Store"') AS present`)).rows[0].present)throw Error('Requires an empty, disposable database; existing data is never replaced.');
for(const schema of ['prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma']){
 const ddl=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel',schema,'--script'],{encoding:'utf8'});
 await sql.query(ddl);
}
// In this empty, local database only: replace generated placeholders with the exact candidate migration.
await sql.query('DROP TABLE "StaffMonthlyAdjustment", "StaffAdjustmentMonth"');
await sql.query(readFileSync('prisma/migrations/20261104120000_staff_monthly_adjustments/migration.sql','utf8'));
await sql.query(readFileSync('prisma/migrations/20260929044152_music_teacher_finance_scope/migration.sql','utf8'));
// Raw-SQL prerequisite used by the existing backend notification reader.
await sql.query(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
await sql.query('ALTER TABLE "DigitalManagerNotice" ADD COLUMN "publishedAt" timestamptz(3) NOT NULL DEFAULT now(), ADD COLUMN "readAt" timestamptz(3), ADD COLUMN "readById" text, ADD COLUMN "readByName" text');
const db=new PrismaClient(),course=new Course(),beauty=new Beauty();
const password=randomBytes(24).toString('base64url'),passwordHash=hashSync(password,10),accounts=[];
for(const [kind,module,label] of [['steam','STEAMFOOT','技師'],['fitness','COURSE','教練'],['music','COURSE','老師'],['beauty','BEAUTY','美業技師']]){
 const storeId=`monthly-live-${kind}`,ownerId=`${storeId}-owner`,ownerStaff=`${storeId}-owner-staff`,staffId=`${storeId}-person`,email=`${kind}@monthly-qa.example.invalid`;
 await db.store.create({data:{id:storeId,name:`月結本機隔離驗收・${label}`,slug:storeId,industryModule:module,plan:'EXPERIENCE'}});
 await db.user.create({data:{id:ownerId,name:'本次合成店長',email,role:'OWNER',passwordHash}});
 await db.staff.create({data:{id:ownerStaff,userId:ownerId,storeId,displayName:'本次合成店長',isOwner:true}});
 await db.user.create({data:{id:`${storeId}-worker`,name:`驗收${label}`,role:'STAFF'}});
 await db.staff.create({data:{id:staffId,userId:`${storeId}-worker`,storeId,displayName:`驗收${label}`,courseCoachEnabled:module==='COURSE'}});
 await db.shopConfig.create({data:{storeId,shopName:`月結隔離驗收・${label}`}});
 for(const featureKey of ['basic_booking','staff_management','service_fee_calculator','transaction_management',...(kind==='fitness'?['business.fitness']:kind==='music'?['business.music']:[])])await db.storeFeatureEntitlement.create({data:{storeId,featureKey,status:'ENABLED'}});
 if(module==='COURSE'){
  await course.courseBookingRule.create({data:{storeId}});
  await course.courseRoom.create({data:{id:`${storeId}-room`,storeId,name:'合成教室'}});
  await course.courseTemplate.create({data:{id:`${storeId}-template`,storeId,name:'合成課程',durationMinutes:60,pointCost:1,capacity:1}});
  await course.courseSession.create({data:{id:`${storeId}-session`,storeId,templateId:`${storeId}-template`,roomId:`${storeId}-room`,coachId:staffId,nameSnapshot:'本月原授課費',teacherAttendance:'ATTENDED',startsAt:new Date('2026-11-02T01:00:00Z'),endsAt:new Date('2026-11-02T02:00:00Z'),pointCost:1,capacity:1,requestKey:'monthly-synthetic',requestIndex:0,createdById:ownerId}});
  await course.courseCompensationSnapshot.create({data:{sessionId:`${storeId}-session`,storeId,staffId,rule:{mode:'CLASS',value:30000},revision:1,durationMinutes:60}});
 }
 let personId=staffId;
 if(kind==='beauty'){
  personId=`${storeId}-technician`;
  await beauty.beautySetting.create({data:{storeId}});
  await beauty.beautyTechnician.create({data:{id:personId,storeId,name:'驗收美業技師',gender:'FEMALE',weekly:[],serviceIds:[]}});
  await beauty.beautyGroup.create({data:{id:`${storeId}-group`,storeId,contactName:'合成顧客',phone:'0900000000',startsAt:new Date('2026-11-02T01:00:00Z')}});
  await beauty.beautyAppointment.create({data:{id:`${storeId}-appointment`,storeId,groupId:`${storeId}-group`,personName:'合成顧客',personPhone:'0900000000',serviceId:'synthetic-service',serviceName:'本月原服務費',technicianId:personId,locationId:'synthetic-location',preference:'ANY',startsAt:new Date('2026-11-02T01:00:00Z'),endsAt:new Date('2026-11-02T02:00:00Z'),occupiedEndsAt:new Date('2026-11-02T02:00:00Z'),duration:60,buffer:0,price:30000,isTrial:false,status:'COMPLETED',rate:{mode:'FIXED',value:30000},cancelDeduct:false,noShowDeduct:false,fee:30000}});
 }
 accounts.push({kind,email,storeId,personId,name:`驗收${label}`,base:kind==='steam'?0:30000});
}
writeFileSync('/tmp/monthly-live-login.json',JSON.stringify({password,accounts}),{mode:0o600});
console.log(JSON.stringify({isolated:true,exactMigration:true,syntheticStores:accounts.length,postgres:(await sql.query('SHOW server_version')).rows[0].server_version,appRole:(await sql.query('SELECT current_user')).rows[0].current_user,remoteWrites:false}));
await Promise.all([db.$disconnect(),course.$disconnect(),beauty.$disconnect(),sql.end()]);
