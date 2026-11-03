import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { assertImageAnnouncementsAcceptance, IMAGE_ACCEPTANCE_DATABASE } from "../image-announcements-acceptance-scope.mjs";
assertImageAnnouncementsAcceptance(process.env);
const db = new PrismaClient({ datasourceUrl: IMAGE_ACCEPTANCE_DATABASE });
async function main() {
  const existing = await db.$queryRaw<Array<{present:string|null}>>`SELECT to_regclass('public."Store"')::text AS present`;
  if (existing[0]?.present) throw Error("Seed requires an empty dedicated acceptance database; existing data will not be overwritten");
  const temp=mkdtempSync('/tmp/image-announcement-schema-');
  const schema=join(temp,'schema.prisma');
  writeFileSync(schema,execFileSync('git',['show','8d717d5d:prisma/schema.prisma']));
  const sql=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel',schema,'--script'],{encoding:'utf8'});
  execFileSync('node_modules/.bin/prisma',['db','execute','--url',IMAGE_ACCEPTANCE_DATABASE,'--stdin'],{input:sql,stdio:['pipe','pipe','pipe']});
  await db.$executeRawUnsafe('CREATE ROLE anon NOLOGIN');
  await db.$executeRawUnsafe('CREATE ROLE authenticated NOLOGIN');
  await db.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated');
  // Apply the exact candidate migration, rather than db push of the new models.
  execFileSync('node_modules/.bin/prisma',['db','execute','--url',IMAGE_ACCEPTANCE_DATABASE,'--stdin'],{input:readFileSync('prisma/migrations/20261020100000_image_announcements/migration.sql'),stdio:['pipe','pipe','pipe']});
  await db.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM anon, authenticated');
  const course=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','course-prisma/schema.prisma','--script'],{encoding:'utf8'});
  execFileSync('node_modules/.bin/prisma',['db','execute','--url',IMAGE_ACCEPTANCE_DATABASE,'--stdin'],{input:course,stdio:['pipe','pipe','pipe']});
  for (const key of ['a','b']) {
    const storeId=`image-qa-${key}`, userId=`image-qa-owner-${key}`;
    await db.store.create({data:{id:storeId,slug:storeId,name:`圖片驗收 ${key.toUpperCase()} 店`,industryModule:'STEAMFOOT',plan:'EXPERIENCE'}});
    await db.user.create({data:{id:userId,name:`驗收店長 ${key}`,email:`image-owner-${key}@example.invalid`,role:'OWNER',passwordHash:hashSync('image-qa-only-password',10)}});
    await db.staff.create({data:{id:`image-qa-staff-${key}`,storeId,userId,displayName:`驗收店長 ${key}`,isOwner:true}});
    await db.shopConfig.create({data:{storeId,shopName:`圖片驗收 ${key.toUpperCase()} 店`}});
    await db.user.create({data:{id:`image-qa-member-${key}`,name:`驗收顧客 ${key}`,phone:key==='a'?'0900000301':'0900000302',role:'CUSTOMER',passwordHash:hashSync('image-qa-only-password',10)}});
    await db.customer.create({data:{id:`image-qa-customer-${key}`,storeId,userId:`image-qa-member-${key}`,name:`驗收顧客 ${key}`,phone:key==='a'?'0900000301':'0900000302',assignedStaffId:`image-qa-staff-${key}`}});
  }
  console.log(JSON.stringify({isolated:true,exactMigrationApplied:true,stores:2,owners:2,members:2,externalCredentials:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
