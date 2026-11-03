import sharp from "sharp";
import { AppError } from "@/lib/app-error";

/** Decode and re-encode untrusted uploads; strip metadata and reject animations. */
export async function normalizeAnnouncementImage(input: Uint8Array) {
  try {
    const image = sharp(input, { limitInputPixels: 50_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== "jpeg" || (metadata.pages ?? 1) !== 1) throw Error("format");
    return new Uint8Array(await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer());
  } catch { throw new AppError("VALIDATION", "圖片格式有誤，請重新上傳 JPG 或 PNG"); }
}
