import {afterEach,afterAll,beforeAll,expect,it,vi} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {Prisma} from "@prisma/client";
import {musicPurchaseWhere,musicTrialBookingWhere,musicReceiptScopeSql,LEGACY_MUSIC_PURCHASE_IDS} from "@/server/services/music-finance-scope";
import {LEGACY_MUSIC_SESSION_IDS,LEGACY_MUSIC_CUSTOMER_IDS} from "@/server/services/music-data-scope";
const env={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feat/music-opening-state-20261007",VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",DATABASE_URL:"postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",DIRECT_URL:"postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",WORKERS_CI_BRANCH:"",CF_PAGES_BRANCH:""};
function preview(){for(const [k,v]of Object.entries(env))vi.stubEnv(k,v);}
afterEach(()=>vi.unstubAllEnvs());
const db=new PGlite();
beforeAll(async()=>{
 await db.exec('CREATE TABLE "CourseBooking"(id text,"storeId" text,"sessionId" text,"customerId" text);CREATE TABLE receipts(id text,"purchaseId" text,"bookingId" text,amount int);');
 await db.query('INSERT INTO "CourseBooking" VALUES ($1,$2,$3,$4),($5,$2,$6,NULL),($7,$2,$8,NULL)', ['old','store-lubymusic',LEGACY_MUSIC_SESSION_IDS[0],LEGACY_MUSIC_CUSTOMER_IDS[0],'native','new-native-session','import','yjy-pilot-session:real']);
 await db.query('INSERT INTO receipts VALUES ($1,$1,$2,100),($3,$3,$4,200),($5,$5,$6,300)',[LEGACY_MUSIC_PURCHASE_IDS[0],'old','unknown-order','native','source-order','import']);
});
afterAll(()=>db.close());
it.each(["purchase","refund","trial"] as const)("partitions %s receipts without loss, including unknown/null-customer rows",async kind=>{
 preview();const read=async(value?:string)=>{const q=Prisma.sql`SELECT SUM(amount)::int AS amount FROM receipts WHERE true ${musicReceiptScopeSql("store-lubymusic",kind,value)}`;return (await db.query<{amount:number}>(q.text,q.values)).rows[0].amount;};
 expect(await read()).toBe(500);expect(await read("legacy")).toBe(100);
 vi.stubEnv("VERCEL_ENV","production");expect(await read("legacy")).toBe(600);
});
it("retains unknown purchases and scopes both trial session/customer evidence",()=>{preview();expect(musicPurchaseWhere("store-lubymusic")).toEqual({id:{notIn:LEGACY_MUSIC_PURCHASE_IDS}});expect(musicTrialBookingWhere("store-lubymusic","legacy")).toEqual({OR:[{sessionId:{in:LEGACY_MUSIC_SESSION_IDS}},{customerId:{in:LEGACY_MUSIC_CUSTOMER_IDS}}]});expect(musicPurchaseWhere("other","legacy")).toEqual({});});
