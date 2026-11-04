import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect } from "vitest";

// Local disposable PostgreSQL only. No env, Prisma, network or production connection.
describe("subscription referral review schema", () => {
  it("enforces attribution, receipt and reward uniqueness, date math and private access", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE "Store" (id text PRIMARY KEY); CREATE TABLE "StoreSubscription" (id text PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; INSERT INTO "Store" VALUES ('a'),('b'),('c'); INSERT INTO "StoreSubscription" VALUES ('sub-a'),('sub-b');`);
      await db.exec(readFileSync("docs/marketing/subscription-referral-schema.sql", "utf8"));
      await db.exec(`INSERT INTO "StoreSubscriptionReferralCode" ("storeId",code,"createdBy") VALUES ('a','SB-ABCDEFGH','hq');
        INSERT INTO "StoreSubscriptionReferral" (id,"referrerStoreId","referredStoreId",code,"boundAt","createdBy") VALUES ('relation','a','b','SB-ABCDEFGH','2026-10-01','hq');
        INSERT INTO "StoreSubscriptionReferralPayment" VALUES ('payment','relation','sub-b','receipt-1','2026-10-02','2026-10-02','hq','2026-10-02');
        INSERT INTO "StoreSubscriptionReferralRefundReview" VALUES ('review','payment','2026-11-01',false,'hq','check-1');`);
      const rewardSql=`INSERT INTO "StoreSubscriptionReferralReward" (id,"referralId","referrerStoreId","referredStoreId","beneficiaryStoreId","refundReviewId",days) VALUES ($1,'relation','a','b',$2,'review',$3)`;
      await db.query(rewardSql,['award-a','a',30]);await db.query(rewardSql,['award-b','b',30]);
      await expect(db.query(rewardSql,['duplicate','a',30])).rejects.toThrow(/unique/i);
      await expect(db.query(rewardSql,['outside','c',30])).rejects.toThrow(/check/i);
      await expect(db.query(rewardSql,['wrong-days','a',31])).rejects.toThrow();
      await expect(db.exec(`INSERT INTO "StoreSubscriptionReferral" (id,"referrerStoreId","referredStoreId",code,"boundAt","createdBy") VALUES ('self','a','a','SB-ABCDEFGH',now(),'hq')`)).rejects.toThrow(/check/i);
      await expect(db.exec(`INSERT INTO "StoreSubscriptionReferral" (id,"referrerStoreId","referredStoreId",code,"boundAt","createdBy") VALUES ('duplicate','a','b','SB-ABCDEFGH',now(),'hq')`)).rejects.toThrow(/unique/i);
      await expect(db.exec(`INSERT INTO "StoreSubscriptionReferral" (id,"referrerStoreId","referredStoreId",code,"boundAt","createdBy") VALUES ('bad-code-owner','b','c','SB-ABCDEFGH',now(),'hq')`)).rejects.toThrow(/foreign key/i);
      await expect(db.exec(`UPDATE "StoreSubscriptionReferralReward" SET state='APPLIED' WHERE id='award-a'`)).rejects.toThrow(/check/i);
      await db.exec(`BEGIN; UPDATE "StoreSubscriptionReferralReward" SET state='APPLIED',"appliedSubscriptionId"='sub-a',"previousExpiresOn"='2026-12-31',"freeFromOn"='2027-01-01',"newExpiresOn"='2027-01-30',"appliedBy"='hq',"appliedAt"=now() WHERE id='award-a'; ROLLBACK;`);
      expect((await db.query<{state:string}>(`SELECT state FROM "StoreSubscriptionReferralReward" WHERE id='award-a'`)).rows[0].state).toBe('READY');
      const { rows }=await db.query<{relrowsecurity:boolean}>(`SELECT relrowsecurity FROM pg_class WHERE relname LIKE 'StoreSubscriptionReferral%' AND relkind='r'`);
      expect(rows).toHaveLength(5);expect(rows.every(row=>row.relrowsecurity)).toBe(true);
      for(const role of ['anon','authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await expect(db.exec(`SELECT * FROM "StoreSubscriptionReferralReward"`)).rejects.toThrow(/permission denied/i);
        await expect(db.query(rewardSql,['forbidden','a',30])).rejects.toThrow(/permission denied/i);
        await db.exec('RESET ROLE');
      }
    } finally { await db.close(); }
  }, 30000);
});
