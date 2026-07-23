import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const ENCRYPTION_KEY_ENV = "DIGITAL_BUTLER_ENCRYPTION_KEY";
const KEY_VERSION = "v1";

export type EncryptedDigitalButlerValue = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: typeof KEY_VERSION;
};

/** Thrown before persistence when the server cannot safely protect PII. */
export class DigitalButlerEncryptionUnavailableError extends Error {
  constructor() {
    super("DIGITAL_BUTLER_ENCRYPTION_UNAVAILABLE");
  }
}

function encryptionKey(): Buffer {
  const encoded = process.env[ENCRYPTION_KEY_ENV];
  if (!encoded) throw new DigitalButlerEncryptionUnavailableError();

  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new DigitalButlerEncryptionUnavailableError();
  return key;
}

/** Encrypts sensitive values with a fresh AES-256-GCM IV for every record. */
export function encryptDigitalButlerValue(value: string): EncryptedDigitalButlerValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: KEY_VERSION };
}

/** Server-only. Do not pass its result to logs, actions, or client components. */
export function decryptDigitalButlerValue(input: EncryptedDigitalButlerValue): string {
  if (input.keyVersion !== KEY_VERSION) throw new DigitalButlerEncryptionUnavailableError();
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), input.iv);
  decipher.setAuthTag(input.authTag);
  return Buffer.concat([decipher.update(input.ciphertext), decipher.final()]).toString("utf8");
}

/** A keyed, deterministic lookup fingerprint. It never stores the raw value. */
export function hashDigitalButlerSensitiveValue(value: string): string {
  return createHmac("sha256", encryptionKey()).update(value, "utf8").digest("hex");
}
