-- Stores only the minimum staff-facing handoff summary. The message preview is
-- encrypted by the application; no sender identifier is added to this table.
ALTER TABLE "DigitalButlerLead"
  ADD COLUMN "customerDisplayName" TEXT,
  ADD COLUMN "customerAvatarUrl" TEXT,
  ADD COLUMN "customerReference" TEXT,
  ADD COLUMN "lastMessageCiphertext" BYTEA,
  ADD COLUMN "lastMessageIv" BYTEA,
  ADD COLUMN "lastMessageAuthTag" BYTEA,
  ADD COLUMN "lastMessageAt" TIMESTAMP(3);

CREATE INDEX "DigitalButlerLead_handoff_lookup_idx"
  ON "DigitalButlerLead"("storeId", "completionActionKey", "assignedStaffId");
