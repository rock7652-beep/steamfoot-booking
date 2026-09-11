import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLiffStoreShareMessages } from "@/lib/liff/store-share-message";

describe("LIFF store share message", () => {
  it("builds one store-specific Flex card without duplicating the URL in body", () => {
    const referralUrl =
      "https://example.com/s/hsinchu/line-entry?ref=ABC234&destination=public-trial&source=liff-store-share";
    const messages = buildLiffStoreShareMessages({
      storeName: "以斯帖蒸足坊",
      referralUrl,
      shareTemplate: null,
      address: "新竹市測試路 1 號",
      mapUrl: "https://maps.google.com/hsinchu",
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "flex",
      contents: {
        body: {
          contents: expect.arrayContaining([
            expect.objectContaining({ text: "以斯帖蒸足坊" }),
          ]),
        },
        footer: {
          contents: expect.arrayContaining([
            expect.objectContaining({
              action: expect.objectContaining({
                label: "預約體驗",
                uri: referralUrl,
              }),
            }),
            expect.objectContaining({
              action: expect.objectContaining({
                label: "Google Maps 導航",
                uri: "https://maps.google.com/hsinchu",
              }),
            }),
          ]),
        },
      },
    });
    expect(JSON.stringify(messages).split(referralUrl)).toHaveLength(2);
  });

  it("opens LINE share directly when the native target picker is unavailable", () => {
    const card = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(liff)/liff/liff-store-share-card.tsx",
      ),
      "utf8",
    );

    expect(card).toContain("buildLineShareUrl");
    expect(card).toContain("window.location.assign");
    expect(card).not.toContain("copyToClipboard");
    expect(card).not.toContain("分享連結已複製");
  });
});
