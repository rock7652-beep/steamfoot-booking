import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { payloadSchema } from "@/lib/consultation-lead";

const { JSDOM } = createRequire(import.meta.url)("jsdom");
const base = {
  requestId: "f2170225-17f8-4ad7-8031-f305afba256f", storeName: "虛構店",
  contactName: "測試", industry: "服務", phone: "0000000000",
  needs: ["預約"], replaceReason: [],
};

describe("consultation optional public profile fields", () => {
  it("shows all three optional links immediately without an expandable or hidden ancestor", () => {
    const dom = new JSDOM(readFileSync("public/pricing/apply.html", "utf8"));
    const doc = dom.window.document as Document;
    expect(doc.querySelector(".public-profile legend")?.textContent).toBe("官網／社群連結（選填）");
    for (const name of ["websiteUrl", "facebookUrl", "instagramUrl"]) {
      const field = doc.querySelector<HTMLInputElement>(`input[name=${name}]`)!;
      expect(field.type).toBe("url");
      expect(field.required).toBe(false);
      expect(field.disabled).toBe(false);
      expect(field.maxLength).toBe(2000);
      expect(field.closest("details, [hidden], [aria-hidden=true]")).toBeNull();
      expect(field.form?.id).toBe("storeForm");
      expect(field.labels).toHaveLength(1);
      expect(field.getAttribute("aria-describedby")).toBe("public-profile-hint");
    }
    expect(doc.querySelector('input[name=email]')).toBeNull();
    dom.window.close();
  });

  it("leaves the existing source page independent from the supplied website", () => {
    const parsed = payloadSchema.parse({ ...base, pageUrl: "https://www.steamfoot.com/apply?intent=trial", websiteUrl: "https://example.com/shop" });
    expect(parsed.pageUrl).not.toBe(parsed.websiteUrl);
    expect(parsed.websiteUrl).toBe("https://example.com/shop");
  });

  it.each([{}, { websiteUrl: "", facebookUrl: "", instagramUrl: "" }])(
    "preserves older submissions and the no-links consultation contract",
    (links) => expect(payloadSchema.safeParse({ ...base, ...links }).success).toBe(true),
  );
});
