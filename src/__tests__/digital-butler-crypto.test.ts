import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptDigitalButlerValue,
  DigitalButlerEncryptionUnavailableError,
  encryptDigitalButlerValue,
  hashDigitalButlerSensitiveValue,
} from "@/lib/digital-butler-crypto";

describe("Digital Butler sensitive value crypto", () => {
  beforeEach(() => {
    process.env.DIGITAL_BUTLER_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64url");
  });

  it("uses AES-256-GCM with a fresh IV and does not store plaintext", () => {
    const first = encryptDigitalButlerValue("0912345678");
    const second = encryptDigitalButlerValue("0912345678");

    expect(first.ciphertext.equals(Buffer.from("0912345678"))).toBe(false);
    expect(first.iv).toHaveLength(12);
    expect(first.authTag).toHaveLength(16);
    expect(second.iv.equals(first.iv)).toBe(false);
    expect(decryptDigitalButlerValue(first)).toBe("0912345678");
  });

  it("creates a deterministic keyed fingerprint without exposing the source value", () => {
    const hash = hashDigitalButlerSensitiveValue("0912345678");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashDigitalButlerSensitiveValue("0912345678"));
    expect(hash).not.toContain("0912345678");
  });

  it.each([undefined, Buffer.alloc(31, 9).toString("base64url"), "not-a-key"]) (
    "fails closed when the encryption key is unavailable or invalid",
    (key) => {
      if (key === undefined) delete process.env.DIGITAL_BUTLER_ENCRYPTION_KEY;
      else process.env.DIGITAL_BUTLER_ENCRYPTION_KEY = key;
      expect(() => encryptDigitalButlerValue("0912345678")).toThrow(
        DigitalButlerEncryptionUnavailableError,
      );
    },
  );
});
