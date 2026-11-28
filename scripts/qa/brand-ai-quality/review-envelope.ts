// Private review delivery only: no provider Key or checkpoint Key is exported.
import { constants, createCipheriv, createDecipheriv, createPublicKey,
  publicEncrypt, privateDecrypt, randomBytes } from "node:crypto";

export function reviewRecipient(encodedPublicKey: string) {
  if (encodedPublicKey.length > 10000) throw Error("REVIEW_RECIPIENT_INVALID");
  const key = createPublicKey(Buffer.from(encodedPublicKey, "base64"));
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (key.asymmetricKeyType !== "rsa" || bits < 3072 || bits > 4096)
    throw Error("REVIEW_RECIPIENT_INVALID");
  return key;
}
export function sealReview(report: unknown, recipient: string, context: string) {
  const key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(JSON.stringify(report), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, context, iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64"),
    wrappedKey: publicEncrypt({ key: reviewRecipient(recipient),
      padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key).toString("base64") });
}
export function openReview(encrypted: string, privateKey: string, expectedContext: string) {
  const envelope = JSON.parse(encrypted);
  if (envelope.version !== 1 || envelope.context !== expectedContext)
    throw Error("REVIEW_CONTEXT_MISMATCH");
  const key = privateDecrypt({ key: privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
  Buffer.from(envelope.wrappedKey, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from(expectedContext));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final()]).toString("utf8"));
}
