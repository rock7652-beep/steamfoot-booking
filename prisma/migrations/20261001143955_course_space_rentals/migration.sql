-- AlterTable
ALTER TABLE "CourseRoom" ADD COLUMN     "rentalBufferMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rentalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rentalHourlyRate" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CourseRental" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "occupiedStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "occupiedEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "hourlyRateSnapshot" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "cancelledAt" TIMESTAMPTZ(3),
    "requestKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseRental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRentalPayment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "requestKey" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CourseRentalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseRental_storeId_startsAt_idx" ON "CourseRental"("storeId", "startsAt");

-- CreateIndex
CREATE INDEX "CourseRental_storeId_roomId_occupiedStartsAt_idx" ON "CourseRental"("storeId", "roomId", "occupiedStartsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRental_id_storeId_key" ON "CourseRental"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRental_storeId_requestKey_key" ON "CourseRental"("storeId", "requestKey");

-- CreateIndex
CREATE INDEX "CourseRentalPayment_storeId_rentalId_idx" ON "CourseRentalPayment"("storeId", "rentalId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRentalPayment_storeId_requestKey_key" ON "CourseRentalPayment"("storeId", "requestKey");

-- AddForeignKey
ALTER TABLE "CourseRental" ADD CONSTRAINT "CourseRental_roomId_storeId_fkey" FOREIGN KEY ("roomId", "storeId") REFERENCES "CourseRoom"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRentalPayment" ADD CONSTRAINT "CourseRentalPayment_rentalId_storeId_fkey" FOREIGN KEY ("rentalId", "storeId") REFERENCES "CourseRental"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CourseRental" ADD CONSTRAINT "CourseRental_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id);
ALTER TABLE "CourseRental" ADD CONSTRAINT "CourseRental_customer_fkey" FOREIGN KEY ("storeId","customerId") REFERENCES "Customer"("storeId",id);
ALTER TABLE "CourseRental" ADD CONSTRAINT "CourseRental_amount_check" CHECK (amount >= 0 AND "hourlyRateSnapshot" >= 0 AND "endsAt" > "startsAt" AND "occupiedStartsAt" <= "startsAt" AND "occupiedEndsAt" >= "endsAt");
ALTER TABLE "CourseRentalPayment" ADD CONSTRAINT "CourseRentalPayment_amount_check" CHECK (amount >= 0 AND status IN ('SUCCESS','VOIDED') AND "paymentMethod" IN ('CASH','OTHER'));
CREATE UNIQUE INDEX "CourseRentalPayment_one_active" ON "CourseRentalPayment"("rentalId") WHERE status='SUCCESS';
ALTER TABLE "CourseRental" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseRentalPayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseRental", "CourseRentalPayment" FROM anon, authenticated;
-- Serializes every class/rental write, including older scheduling entry points.
CREATE FUNCTION course_space_occupancy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM "Store" WHERE id=NEW."storeId" FOR UPDATE;
  IF TG_TABLE_NAME='CourseRental' THEN
    IF NEW."cancelledAt" IS NULL AND (
      EXISTS(SELECT 1 FROM "CourseSession" s WHERE s."storeId"=NEW."storeId" AND s."roomId"=NEW."roomId" AND s."cancelledAt" IS NULL AND s."releasedAt" IS NULL AND s."startsAt"<NEW."occupiedEndsAt" AND s."endsAt">NEW."occupiedStartsAt") OR
      EXISTS(SELECT 1 FROM "CourseRental" r WHERE r."storeId"=NEW."storeId" AND r."roomId"=NEW."roomId" AND r.id<>NEW.id AND r."cancelledAt" IS NULL AND r."occupiedStartsAt"<NEW."occupiedEndsAt" AND r."occupiedEndsAt">NEW."occupiedStartsAt")
    ) THEN RAISE EXCEPTION 'SPACE_RENTAL_CONFLICT' USING ERRCODE='P0001'; END IF;
  ELSE
    IF NEW."cancelledAt" IS NULL AND NEW."releasedAt" IS NULL AND EXISTS(SELECT 1 FROM "CourseRental" r WHERE r."storeId"=NEW."storeId" AND r."roomId"=NEW."roomId" AND r."cancelledAt" IS NULL AND r."occupiedStartsAt"<NEW."endsAt" AND r."occupiedEndsAt">NEW."startsAt") THEN
      RAISE EXCEPTION 'SPACE_RENTAL_CONFLICT' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_space_occupancy_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER course_rental_occupancy BEFORE INSERT OR UPDATE OF "startsAt","endsAt","roomId","cancelledAt","occupiedStartsAt","occupiedEndsAt" ON "CourseRental" FOR EACH ROW EXECUTE FUNCTION course_space_occupancy_guard();
CREATE TRIGGER course_session_rental_occupancy BEFORE INSERT OR UPDATE OF "startsAt","endsAt","roomId","cancelledAt","releasedAt" ON "CourseSession" FOR EACH ROW EXECUTE FUNCTION course_space_occupancy_guard();

ALTER TABLE "CourseSession" ADD COLUMN "isTrial" BOOLEAN NOT NULL DEFAULT false;
CREATE FUNCTION course_space_disable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT NEW."isActive" AND EXISTS(SELECT 1 FROM "CourseRental" WHERE "storeId"=NEW."storeId" AND "roomId"=NEW.id AND "cancelledAt" IS NULL AND "endsAt">NOW()) THEN RAISE EXCEPTION 'SPACE_RENTAL_USAGE' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_space_disable_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER course_space_disable BEFORE UPDATE OF "isActive" ON "CourseRoom" FOR EACH ROW EXECUTE FUNCTION course_space_disable_guard();
