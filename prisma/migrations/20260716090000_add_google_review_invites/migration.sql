ALTER TABLE "Store" ADD COLUMN "googleReviewUrl" TEXT;

CREATE TABLE "GoogleReviewInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "staffId" TEXT,
    "source" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickedAt" TIMESTAMP(3),
    CONSTRAINT "GoogleReviewInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleReviewInvite_token_key" ON "GoogleReviewInvite"("token");
CREATE UNIQUE INDEX "GoogleReviewInvite_bookingId_key" ON "GoogleReviewInvite"("bookingId");
CREATE INDEX "GoogleReviewInvite_storeId_invitedAt_idx" ON "GoogleReviewInvite"("storeId", "invitedAt");
CREATE INDEX "GoogleReviewInvite_storeId_clickedAt_idx" ON "GoogleReviewInvite"("storeId", "clickedAt");
CREATE INDEX "GoogleReviewInvite_customerId_invitedAt_idx" ON "GoogleReviewInvite"("customerId", "invitedAt");

ALTER TABLE "GoogleReviewInvite" ADD CONSTRAINT "GoogleReviewInvite_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleReviewInvite" ADD CONSTRAINT "GoogleReviewInvite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleReviewInvite" ADD CONSTRAINT "GoogleReviewInvite_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoogleReviewInvite" ADD CONSTRAINT "GoogleReviewInvite_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
