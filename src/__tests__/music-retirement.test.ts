import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Prisma } from "../../generated/course-client";
import { PGlite } from "@electric-sql/pglite";
import { musicRetirementEnabled, loadRetirementRegistry, retirementReadArgs, musicRetirementWhere } from "@/lib/music-retirement";
import { musicRetirementSql } from "@/server/services/music-retirement-sql";
const registry={CourseSession:["synthetic-session"],CourseBooking:["synthetic-booking"],CoursePointCard:["synthetic-card"]};
const preview={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feat/music-opening-state-20261007",VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",DATABASE_URL:"postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",DIRECT_URL:"postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",WORKERS_CI_BRANCH:"",CF_PAGES_BRANCH:""};
function env(){Object.entries(preview).forEach(([k,v])=>vi.stubEnv(k,v));}
afterEach(()=>vi.unstubAllEnvs());
it("ships only expected counts, never private identity lists",()=>{
 const manifest=JSON.parse(readFileSync("src/lib/music-retirement-manifest.json","utf8"));
 expect(manifest.expectedCounts).toEqual({Customer:16,CourseSession:40,CourseBooking:61,CoursePointCard:26,CashbookEntry:28});expect(manifest.groups).toBeUndefined();
});
it("fails closed when the private sealed registry is incomplete",async()=>{
 await expect(loadRetirementRegistry({$queryRaw:vi.fn().mockResolvedValue([])})).rejects.toThrow("readiness mismatch");
 const registry=Object.entries({Customer:16,CourseSession:40,CourseBooking:61,CoursePointCard:26,CashbookEntry:28}).map(([entityType,count])=>({entityType,ids:Array.from({length:count},(_,i)=>`synthetic-${entityType}-${i}`)}));
 const result=await loadRetirementRegistry({$queryRaw:vi.fn().mockResolvedValue(registry)});expect(result.Customer).toHaveLength(16);expect(Object.isFrozen(result)).toBe(true);
});
it.each([{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},{DIRECT_URL:"postgresql://postgres:x@db.other.supabase.co/postgres"},{VERCEL:"0"}])("never enables the boundary in another deployment: %j",override=>expect(musicRetirementEnabled({...preview,...override})).toBe(false));
it("preserves caller filters, unique identities, nested roster filters and counts",()=>{
 const args=retirementReadArgs("CourseSession",{where:{id:"native",storeId:"store-lubymusic",AND:[{cancelledAt:null}]},include:{bookings:{where:{status:"RESERVED"}},_count:{select:{bookings:true}}}},Prisma.dmmf.datamodel.models,registry);
 expect(args.where.id).toBe("native");expect(args.where.AND[0]).toEqual({cancelledAt:null});expect(args.where.AND[1]).toEqual(musicRetirementWhere("CourseSession",registry));
 expect(args.include.bookings.where.status).toBe("RESERVED");expect(args.include.bookings.where.AND[0]).toEqual(musicRetirementWhere("CourseBooking",registry));expect(args.include._count.select.bookings.where.AND[1]).toEqual(musicRetirementWhere("CourseBooking",registry));
});
it("keeps an existing multi-condition AND flat for Prisma validation",()=>{
 const conditions=[{OR:[{roomId:"native-room"},{coachId:"native-coach"}]},{OR:[{startsAt:{lt:new Date()}},{endsAt:{gt:new Date()}}]}];
 const result=retirementReadArgs("CourseSession",{where:{storeId:"store-lubymusic",AND:conditions}},Prisma.dmmf.datamodel.models,registry);
 expect(result.where.AND.slice(0,2)).toEqual(conditions);expect(result.where.AND.every((item:unknown)=>!Array.isArray(item))).toBe(true);expect(result.where.AND[2]).toEqual(musicRetirementWhere("CourseSession",registry));
});
it("keeps SQL filters bound and preserves other stores",()=>{
 env();expect(musicRetirementSql("other","CourseSession").text).toBe("");const sql=musicRetirementSql("store-lubymusic","CourseSession","s.id");expect(sql.text).toContain('"MusicOperationalArchive"');expect(sql.values).toEqual(["store-lubymusic","music-operational-retirement-20261023","CourseSession"]);expect(sql.text).toContain('"rowKey"=s.id');
 expect(()=>musicRetirementSql("store-lubymusic","CourseSession","id;DELETE")).toThrow();
});
it("SQL guard blocks legacy updates and new operational references while allowing retained people and other stores",async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "MusicOperationalArchive"("storeId" text,"entityType" text,"rowKey" text,payload jsonb);CREATE TABLE "Customer"(id text,"storeId" text,name text);CREATE TABLE "CourseBooking"(id text,"storeId" text,"customerId" text);INSERT INTO "MusicOperationalArchive" VALUES('store-lubymusic','Customer','retired','{}');INSERT INTO "Customer" VALUES('retired','store-lubymusic','original'),('native','store-lubymusic','native'),('retired','other','other');`);
 const sql=readFileSync("scripts/music-retirement-framework.sql","utf8");const start=sql.indexOf("CREATE FUNCTION music_retirement_write_guard()");const end=sql.indexOf("REVOKE ALL ON FUNCTION music_retirement_write_guard",start);await db.exec(sql.slice(start,end));
 await db.exec(`CREATE TRIGGER guard BEFORE INSERT OR UPDATE OR DELETE ON "Customer" FOR EACH ROW EXECUTE FUNCTION music_retirement_write_guard();CREATE TRIGGER guard BEFORE INSERT OR UPDATE OR DELETE ON "CourseBooking" FOR EACH ROW EXECUTE FUNCTION music_retirement_write_guard();`);
 await expect(db.exec(`UPDATE "Customer" SET name='changed' WHERE id='retired' AND "storeId"='store-lubymusic'`)).rejects.toThrow(/MUSIC_RECORD_ARCHIVED/);
 await expect(db.exec(`INSERT INTO "CourseBooking" VALUES('bad','store-lubymusic','retired')`)).rejects.toThrow(/MUSIC_RECORD_ARCHIVED/);
 await db.exec(`UPDATE "Customer" SET name='allowed' WHERE id='native' OR "storeId"='other';INSERT INTO "CourseBooking" VALUES('good','store-lubymusic','native');`);
 expect((await db.query<{name:string}>(`SELECT name FROM "Customer" WHERE id='retired' AND "storeId"='store-lubymusic'`)).rows[0].name).toBe("original");
 const immutableStart=sql.indexOf('CREATE FUNCTION music_retirement_archive_immutable()');await db.exec(sql.slice(immutableStart,sql.indexOf('CREATE OR REPLACE FUNCTION public.course_space_occupancy_guard',immutableStart)).replace(/REVOKE ALL[^;]+;/g,''));
 await expect(db.exec(`DELETE FROM "MusicOperationalArchive"`)).rejects.toThrow(/immutable/);
 }finally{await db.close();}
});
