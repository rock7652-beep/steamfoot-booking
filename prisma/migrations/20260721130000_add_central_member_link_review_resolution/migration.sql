ALTER TABLE "CentralMemberLinkReviewRequest"
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewNote" TEXT,
  ALTER COLUMN "identityLinkId" DROP NOT NULL;

ALTER TABLE "CentralMemberLinkReviewRequest"
  DROP CONSTRAINT "CentralMemberLinkReviewRequest_identityLinkId_fkey";

ALTER TABLE "CentralMemberLinkReviewRequest"
  ADD CONSTRAINT "CentralMemberLinkReviewRequest_identityLinkId_fkey"
  FOREIGN KEY ("identityLinkId") REFERENCES "CustomerIdentityLink"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
