import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { assertBookingParticipantsProductionEnvironment } from "../../scripts/booking-participants-preview-readiness.mjs";
const production = {
 VERCEL:"1", VERCEL_ENV:"production", VERCEL_GIT_COMMIT_REF:"main",
 VERCEL_GIT_REPO_OWNER:"rock7652-beep", VERCEL_GIT_REPO_SLUG:"steamfoot-booking", BOOKING_PARTICIPANTS_ENABLED:"true",
 DATABASE_URL:"postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres",
 DIRECT_URL:"postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres",
};
describe("production participant readiness",()=>{
 it("rejects preview, conflicting provider and either wrong connection",()=>{
  expect(()=>assertBookingParticipantsProductionEnvironment(production)).not.toThrow();
  for(const patch of [{VERCEL_ENV:"preview"},{WORKERS_CI_BRANCH:"main"},{DATABASE_URL:production.DATABASE_URL.replace("qijlnhtpbintanzpxkvf","ttworfzgwejdeolegkxl")},{DIRECT_URL:production.DIRECT_URL+"?host=other.invalid"}])
   expect(()=>assertBookingParticipantsProductionEnvironment({...production,...patch})).toThrow();
 });
 it("creates protected empty schema once and enforces the personal session foreign key",async()=>{
  const db=new PGlite();
  try {
   await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE "Customer" (id TEXT PRIMARY KEY,"storeId" TEXT,UNIQUE(id,"storeId"));
    CREATE TABLE "Booking" (id TEXT PRIMARY KEY,"storeId" TEXT);
    CREATE TABLE "Transaction" (id TEXT PRIMARY KEY,"storeId" TEXT);
    CREATE TABLE "WalletSession" (id TEXT PRIMARY KEY);`);
   const sql=readFileSync("docs/sql/booking-participants-production-release.sql","utf8");
   await db.exec(sql);
   const result=await db.query<{n:number}>(`SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal`);
   expect(result.rows[0].n).toBe(5);
   const fk=await db.query(`SELECT 1 FROM pg_constraint WHERE conname='BookingParticipant_walletSessionId_fkey' AND contype='f'`);
   expect(fk.rows).toHaveLength(1);
   const rls=await db.query<{ok:boolean}>(`SELECT bool_and(relrowsecurity) ok FROM pg_class WHERE relname IN ('BookingParticipant','BookingParticipantGroup')`);
   expect(rls.rows[0].ok).toBe(true);
   await expect(db.exec(sql)).rejects.toThrow();
  } finally {await db.close();}
 });
});
