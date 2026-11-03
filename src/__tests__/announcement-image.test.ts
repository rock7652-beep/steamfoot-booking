import { it, expect } from "vitest";
import sharp from "sharp";
import { normalizeAnnouncementImage } from "@/server/services/announcement-image";
it("rejects arbitrary bytes even with JPEG signatures", async () => {
  await expect(normalizeAnnouncementImage(new Uint8Array([255, 216, 255, 1, 2, 255, 217]))).rejects.toThrow("圖片格式有誤");
  await expect(normalizeAnnouncementImage(Buffer.from('<svg onload="alert(1)"/>'))).rejects.toThrow("圖片格式有誤");
});
it("normalizes real JPEGs, retaining the full aspect ratio", async () => {
  const source = await sharp({ create: { width: 320, height: 100, channels: 3, background: "white" } }).jpeg().toBuffer();
  const result = await normalizeAnnouncementImage(source);
  const metadata = await sharp(result).metadata();
  expect(metadata.format).toBe("jpeg"); expect(metadata.width).toBe(320); expect(metadata.height).toBe(100); expect(metadata.exif).toBeUndefined();
});
