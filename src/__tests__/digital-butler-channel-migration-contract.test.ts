import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(root, "prisma/migrations/20260727090000_channel_neutral_digital_butler/migration.sql"),
  "utf8",
);

describe("Digital Butler channel-neutral migration", () => {
  it("preserves existing LINE hashes by renaming columns instead of rebuilding rows", () => {
    expect(migration).toContain('RENAME COLUMN "channelIdentity" TO "channelAccountId"');
    expect(migration).toContain('RENAME COLUMN "lineUserIdHash" TO "senderIdHash"');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"DigitalButlerConversation"/i);
    expect(migration).not.toMatch(/UPDATE\s+"DigitalButlerConversation".*senderId/i);
    expect(migration).toContain(`SET "eventKey" = 'line:' || "eventKey"`);
  });

  it("scopes active identities by store, provider, channel account, and sender hash", () => {
    expect(migration).toContain(
      'DROP INDEX IF EXISTS "DigitalButlerConversation_one_active_identity_key"',
    );
    expect(migration).toContain(
      'ON "DigitalButlerConversation"("storeId", "provider", "channelAccountId", "senderIdHash")',
    );
    expect(migration).toContain(`WHERE "status" IN ('IN_PROGRESS', 'WAITING_INPUT')`);
    expect(schema).toContain("@@index([storeId, provider, channelAccountId, senderIdHash, status])");
  });

  it("stores new sender IDs only as AES-GCM fields plus a lookup hash", () => {
    for (const field of [
      "senderIdHash",
      "senderIdCiphertext",
      "senderIdIv",
      "senderIdAuthTag",
      "senderIdKeyVersion",
    ]) {
      expect(schema).toContain(field);
    }
    expect(schema).not.toMatch(/\bsenderId\s+String/);
  });
});
