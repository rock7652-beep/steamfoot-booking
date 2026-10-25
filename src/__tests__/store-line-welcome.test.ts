import { expect, it } from "vitest";
import { buildStoreLineWelcome } from "@/lib/store-line-welcome";
const store = { name: "音樂教室", slug: "music", shopConfig: { shopPhone: "02-00000000", address: "本店地址", mapUrl: null } };
it("uses each store's own name/contact and address-derived Google navigation", () => {
  const messages = buildStoreLineWelcome([store], "https://booking.example");
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ type: "text", text: expect.stringContaining("歡迎加入音樂教室") });
  expect(JSON.stringify(messages)).toContain(encodeURIComponent("本店地址"));
  expect(JSON.stringify(messages)).toContain("首次連結");
  expect(JSON.stringify(messages)).toContain("已完成本店連結者可直接沿用");
});
it("omits missing contact fields and never falls back to another store", () => {
  const text = JSON.stringify(buildStoreLineWelcome([{ name: "運動教室", slug: "fitness" }], "https://booking.example"));
  expect(text).not.toContain("地址："); expect(text).not.toContain("聯絡電話："); expect(text).not.toContain("Google 地圖");
  expect(text).not.toContain("蒸足");
});
it.each(["javascript:alert(1)", "https://google.com.evil.example/maps", "https://user:pass@maps.google.com/maps"])("does not send unsafe map %s", mapUrl => {
  const text = JSON.stringify(buildStoreLineWelcome([{ ...store, shopConfig: { ...store.shopConfig, mapUrl } }], "https://booking.example"));
  expect(text).not.toContain(mapUrl); expect(text).toContain("google.com/maps/dir/");
});
it("keeps shared-account branches explicit and does not expose member data", () => {
  const text = JSON.stringify(buildStoreLineWelcome([store, { name: "運動教室", slug: "fitness" }], "https://booking.example"));
  expect(text).toContain("member-connect?store=music"); expect(text).toContain("member-connect?store=fitness");
  expect(text).not.toContain("綁定成功"); expect(text).not.toContain("預約成功");
});
