-- B7-5: Add isDemo to Store for Demo/Production distinction
ALTER TABLE "Store" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
