import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaClient as CourseClient } from "../../generated/course-client";
import { hashSync } from "bcryptjs";
import { assertSportsLiveFlowQaEnvironment } from "../sports-live-flow-qa-scope.mjs";
assertSportsLiveFlowQaEnvironment(process.env);
const db=new PrismaClient(), course=new CourseClient();
async function main(){
  const found=await db.$queryRaw<Array<{present:string|null}>>`SELECT to_regclass('public."Store"')::text AS present`;
  if(found[0]?.present)throw Error("Requires a new empty disposable database; existing tables will not be replaced");
  for(const schema of ["prisma/schema.prisma","course-prisma/schema.prisma"]){
    const sql=execFileSync("node_modules/.bin/prisma",["migrate","diff","--from-empty","--to-schema-datamodel",schema,"--script"],{encoding:"utf8"});
    execFileSync("node_modules/.bin/prisma",["db","execute","--url",process.env.DATABASE_URL!,"--stdin"],{input:sql,stdio:["pipe","pipe","pipe"]});
  }
  const roles=["anon","authenticated","service_role"].map(role=>`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`).join("\n");
  execFileSync("node_modules/.bin/prisma",["db","execute","--url",process.env.DATABASE_URL!,"--stdin"],{input:roles+"\n"+readFileSync("supabase/migrations/20261002093141_course_coach_notifications.sql","utf8"),stdio:["pipe","pipe","pipe"]});
  const storeId="sports-live-flow-store",userId="sports-live-flow-owner";
  await db.store.create({data:{id:storeId,slug:"sports-live-flow",name:"YoungSky 隔離整合測試店",industryModule:"COURSE",plan:"EXPERIENCE"}});
  await db.user.create({data:{id:userId,name:"隔離驗收店長",email:"sports-owner@example.invalid",role:"OWNER",passwordHash:hashSync("isolated-sports-test-only",10)}});
  await db.staff.create({data:{id:"sports-live-flow-staff",storeId,userId,displayName:"隔離驗收店長",isOwner:true}});
  await db.shopConfig.create({data:{storeId,shopName:"YoungSky 隔離整合測試店",trialEnabled:true,trialDefaultPrice:300,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:1000}});
  for(const featureKey of ["business.fitness","course_waitlist"])await db.storeFeatureEntitlement.create({data:{storeId,featureKey,status:"ENABLED"}});
  await course.courseBookingRule.create({data:{storeId,bookingLeadMinutes:60,cancellationLeadMinutes:120}});
  await course.courseWaitlistSetting.create({data:{storeId,enabled:true,defaultLimit:3,autoPromoteStopMinutes:240}});
  console.log(JSON.stringify({isolated:true,store:"sports-live-flow",realCustomers:0,created:true}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"seed failed");process.exitCode=1}).finally(async()=>{await db.$disconnect();await course.$disconnect()});
