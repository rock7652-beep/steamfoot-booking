CREATE TYPE "CentralMemberLinkReviewType" AS ENUM ('NOT_MY_MEMBERSHIP', 'UNLINK_REQUEST');
CREATE TYPE "CentralMemberLinkReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "CentralMemberLinkReviewRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "identityLinkId" TEXT NOT NULL,
    "type" "CentralMemberLinkReviewType" NOT NULL,
    "status" "CentralMemberLinkReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CentralMemberLinkReviewRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CentralMemberLinkReviewRequest_userId_status_createdAt_idx" ON "CentralMemberLinkReviewRequest"("userId", "status", "createdAt");
CREATE INDEX "CentralMemberLinkReviewRequest_storeId_status_createdAt_idx" ON "CentralMemberLinkReviewRequest"("storeId", "status", "createdAt");
CREATE INDEX "CentralMemberLinkReviewRequest_identityLinkId_status_idx" ON "CentralMemberLinkReviewRequest"("identityLinkId", "status");
CREATE UNIQUE INDEX "uq_central_member_pending_review_per_store" ON "CentralMemberLinkReviewRequest"("userId", "storeId") WHERE "status" = 'PENDING';

ALTER TABLE "CentralMemberLinkReviewRequest" ADD CONSTRAINT "CentralMemberLinkReviewRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CentralMemberLinkReviewRequest" ADD CONSTRAINT "CentralMemberLinkReviewRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CentralMemberLinkReviewRequest" ADD CONSTRAINT "CentralMemberLinkReviewRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CentralMemberLinkReviewRequest" ADD CONSTRAINT "CentralMemberLinkReviewRequest_identityLinkId_fkey" FOREIGN KEY ("identityLinkId") REFERENCES "CustomerIdentityLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
