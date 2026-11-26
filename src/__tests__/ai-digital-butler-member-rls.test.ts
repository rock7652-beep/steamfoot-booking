import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("fixture reads exclude unrelated customers, expose revocation status and do not grant writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE steamfoot_ai_preview_20261125 NOINHERIT NOBYPASSRLS CONNECTION LIMIT 8;
      CREATE TABLE "Store"(id text,"isDemo" boolean,"industryModule" text);INSERT INTO "Store" VALUES ('ai-preview-steamfoot',true,'STEAMFOOT'),('ai-preview-beauty',true,'BEAUTY');
      CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','SUSPENDED','DELETED');
      CREATE TABLE "User"(id text,name text,email text,role text,status "UserStatus","updatedAt" timestamptz);
      CREATE TABLE "Customer"(id text,"userId" text,"storeId" text,name text,phone text,email text,birthday date,"selfBookingEnabled" boolean,"updatedAt" timestamptz);
      CREATE TABLE "Booking"(id text,"customerId" text,"storeId" text,"bookingDate" date,"slotTime" text,people int,"bookedByType" text,"bookingType" text,"bookingStatus" text,"expectedAmount" int,notes text,"updatedAt" timestamptz);
      CREATE TABLE "CentralMemberLinkReviewRequest"("userId" text,"storeId" text);
      ALTER TABLE "User" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY; ALTER TABLE "CentralMemberLinkReviewRequest" ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON "User","Customer","Booking","CentralMemberLinkReviewRequest" TO steamfoot_ai_preview_20261125;
      CREATE POLICY existing_steam_read ON "Booking" FOR SELECT TO steamfoot_ai_preview_20261125 USING ("storeId"='ai-preview-steamfoot');`);
    const sql = readFileSync('scripts/sql/ai-digital-butler/preview-member-bookings.sql','utf8'); await db.exec(sql);
    await db.exec(`INSERT INTO "User" VALUES ('unrelated','other','other@example.invalid','CUSTOMER','ACTIVE',CURRENT_TIMESTAMP);
      INSERT INTO "Customer" VALUES ('unrelated','unrelated','foreign-store','other','0900000999',NULL,NULL,true,CURRENT_TIMESTAMP);
      INSERT INTO "Booking" (id,"customerId","storeId","slotTime") VALUES ('foreign-booking','unrelated','foreign-store','15:00');
      SET ROLE steamfoot_ai_preview_20261125;`);
    expect((await db.query('SELECT id FROM "Customer"')).rows).toHaveLength(3);
    expect((await db.query('SELECT id FROM "User" ORDER BY id')).rows).toHaveLength(3);
    await expect(db.exec('UPDATE "User" SET status=\'ACTIVE\'')).rejects.toThrow(/permission denied/);
    await expect(db.exec('DELETE FROM "Booking"')).rejects.toThrow(/permission denied/);
    await db.exec(`RESET ROLE; UPDATE "User" SET status='ACTIVE' WHERE id='ai-preview-member-user-a'; SET ROLE steamfoot_ai_preview_20261125;`);
    expect((await db.query('SELECT id FROM "Customer" WHERE id=\'ai-preview-member-customer-a\'')).rows).toEqual([{ id: 'ai-preview-member-customer-a' }]);
    expect((await db.query('SELECT id FROM "Customer" WHERE id=\'unrelated\'')).rows).toEqual([]);
    // The application must add the confirmed customer filter to the existing
    // shared-store Booking read policy; the registry cannot take it from input.
    expect((await db.query('SELECT "slotTime" FROM "Booking" WHERE "storeId"=$1 AND "customerId"=$2', ['ai-preview-steamfoot','ai-preview-member-customer-a'])).rows).toEqual([{ slotTime: '10:00' }]);
    expect((await db.query('SELECT id FROM "Booking" WHERE "storeId"=\'foreign-store\'')).rows).toEqual([]);
    await db.exec(`RESET ROLE; UPDATE "User" SET status='SUSPENDED' WHERE id='ai-preview-member-user-a'; SET ROLE steamfoot_ai_preview_20261125;`);
    expect((await db.query('SELECT status FROM "User" WHERE id=\'ai-preview-member-user-a\'')).rows).toEqual([{ status: 'SUSPENDED' }]);
    // Customer rows remain visible to the trusted server role, so booking
    // foreign-key joins do not break after test-account cleanup. The strict
    // session resolver rechecks this current User status before every read.
    expect((await db.query('SELECT id FROM "Customer" WHERE id=\'unrelated\'')).rows).toEqual([]);
  } finally { await db.close(); }
}, 30_000);
