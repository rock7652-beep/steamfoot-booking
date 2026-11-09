import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyTransaction:vi.fn()}));
vi.mock('@/server/services/digital-manager-notices',()=>({recordDigitalManagerNotice:vi.fn()}));
import {recordBeautyIncompleteNotices} from '@/server/beauty/digital-manager-reminders';
import type {Prisma} from '../../generated/beauty-client';

it('advances past previously notified bookings and remains scoped and idempotent',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY);INSERT INTO "Store" VALUES ('a'),('b');
   CREATE TABLE "BeautyAppointment"(id text PRIMARY KEY,"storeId" text,status text,"endsAt" timestamptz(3));
   INSERT INTO "BeautyAppointment" SELECT 'a-'||lpad(i::text,3,'0'),'a','RESERVED','2026-10-22T00:00:00.123Z'::timestamptz FROM generate_series(1,101) i;
   INSERT INTO "BeautyAppointment" VALUES ('other-store','b','RESERVED','2026-10-22T00:00:00.123Z'),('cancelled','a','CANCELLED','2026-10-22T00:00:00.123Z'),('future','a','RESERVED','2026-10-22T02:00:00Z');`);
  await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
  const tx={$executeRaw:async(strings:TemplateStringsArray,...args:unknown[])=>{let text=strings[0];for(let i=0;i<args.length;i++)text+=`$${i+1}${strings[i+1]}`;return (await db.query(text,args)).affectedRows??0;}} as unknown as Pick<Prisma.TransactionClient,'$executeRaw'>;
  const earliest=new Date('2026-10-21T00:00:00Z'),due=new Date('2026-10-22T01:00:00Z');
  expect(await recordBeautyIncompleteNotices(tx,'a',earliest,due)).toBe(100);
  await db.exec(`UPDATE "DigitalManagerNotice" SET "handledAt"=now() WHERE "targetId"='a-001'`);
  expect(await recordBeautyIncompleteNotices(tx,'a',earliest,due)).toBe(1);
  expect(await recordBeautyIncompleteNotices(tx,'a',earliest,due)).toBe(0);
  const result=await db.query<{count:number;key:string;handled:boolean}>(`SELECT count(*)::int AS count,min("eventKey") AS key,bool_or("handledAt" IS NOT NULL) AS handled FROM "DigitalManagerNotice" WHERE "storeId"='a'`);
  expect(result.rows[0]).toEqual({count:101,key:'beauty-incomplete:a-001:2026-10-22T00:00:00.123Z',handled:true});
  expect((await db.query(`SELECT id FROM "DigitalManagerNotice" WHERE "storeId"='b'`)).rows).toHaveLength(0);
 }finally{await db.close();}
},30000);
