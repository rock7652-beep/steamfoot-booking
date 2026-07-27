-- Preserve existing LINE identity data while making the runtime channel-neutral.
CREATE TYPE "DigitalButlerProvider" AS ENUM ('LINE', 'MESSENGER', 'INSTAGRAM');

ALTER TABLE "DigitalButlerConversation"
  RENAME COLUMN "channelIdentity" TO "channelAccountId";

ALTER TABLE "DigitalButlerConversation"
  RENAME COLUMN "lineUserIdHash" TO "senderIdHash";

ALTER TABLE "DigitalButlerConversation"
  ADD COLUMN "provider" "DigitalButlerProvider" NOT NULL DEFAULT 'LINE',
  ADD COLUMN "senderIdCiphertext" BYTEA,
  ADD COLUMN "senderIdIv" BYTEA,
  ADD COLUMN "senderIdAuthTag" BYTEA,
  ADD COLUMN "senderIdKeyVersion" TEXT;

ALTER TABLE "DigitalButlerExecutionLog"
  ADD COLUMN "provider" "DigitalButlerProvider" NOT NULL DEFAULT 'LINE';

-- Keep fallback redelivery keys stable across this deployment while adding the
-- provider namespace used by the channel-neutral runtime.
UPDATE "DigitalButlerExecutionLog"
  SET "eventKey" = 'line:' || "eventKey"
  WHERE "eventKey" LIKE 'fallback:%';

DROP INDEX IF EXISTS "DigitalButlerConversation_storeId_channelIdentity_lineUserIdHash_status_idx";
DROP INDEX IF EXISTS "DigitalButlerConversation_one_active_identity_key";

CREATE INDEX "DigitalButlerConversation_store_provider_account_sender_status_idx"
  ON "DigitalButlerConversation"("storeId", "provider", "channelAccountId", "senderIdHash", "status");

CREATE UNIQUE INDEX "DigitalButlerConversation_one_active_identity_key"
  ON "DigitalButlerConversation"("storeId", "provider", "channelAccountId", "senderIdHash")
  WHERE "status" IN ('IN_PROGRESS', 'WAITING_INPUT');

-- Existing rows retain their one-way sender hash. New conversations also store
-- AES-GCM ciphertext and key version; legacy plaintext cannot be reconstructed.
