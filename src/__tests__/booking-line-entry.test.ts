import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({store:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{store:{findFirst:m.store}}}));
import { resolveBookingLineEntry, resolveBookingLineStore } from "@/server/services/booking-line-entry";
import { GET } from "@/app/booking-line/route";
const a={storeId:"a",slug:"a",providerId:"901",loginChannelId:"902",messagingProviderId:"901",messagingChannelId:"903",liffId:"902-shared",basicId:"@shared",destination:"U"+"a".repeat(32),accessTokenEnv:"TEST_TOKEN",channelSecretEnv:"TEST_SECRET",sharedAccountKey:"shared"};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("STORE_LINE_CONFIG_JSON",JSON.stringify([a,{...a,storeId:"b",slug:"b"}]));vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON","");m.store.mockResolvedValue({id:"a"});});
afterEach(()=>vi.unstubAllEnvs());
it("retains the explicitly selected store when two branches share one LIFF",()=>{
  expect(resolveBookingLineEntry("b")?.url).toBe("https://liff.line.me/902-shared/public-trial?bookingStore=b");
  expect(resolveBookingLineStore("a","b")).toBe("b");
  expect(resolveBookingLineStore("a","unrelated")).toBeNull();
  expect(resolveBookingLineStore("a")).toBe("a");
});
it("never switches across separate LIFF apps even when the physical OA is shared",()=>{
  vi.stubEnv("STORE_LINE_CONFIG_JSON",JSON.stringify([a,{...a,storeId:"b",slug:"b",liffId:"902-another"}]));
  expect(resolveBookingLineStore("a","b")).toBeNull();
});
it("does not use a central fallback for unconfigured music or fitness stores",()=>{
  expect(resolveBookingLineEntry("unknown-course")).toBeNull();
  expect(resolveBookingLineEntry("zhubei")?.url).toMatch(/^https:\/\/liff.line.me\/2010761154-/);
});
it("redirects only from validated store metadata and ignores caller-supplied redirect URLs",async()=>{
  const response=await GET(new Request("https://example.test/booking-line?store=a&redirect=https://attacker.invalid"));
  expect(response.status).toBe(307);expect(response.headers.get("Location")).toBe(resolveBookingLineEntry("a")?.url);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(m.store).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"a",slug:"a",archivedAt:null,operatingStatus:{in:["ACTIVE","TRIAL"]}})}));
});
it("blocks missing configuration or unavailable stores without redirecting to another store",async()=>{
  expect((await GET(new Request("https://example.test/booking-line?store=unknown"))).status).toBe(404);
  expect(m.store).not.toHaveBeenCalled();m.store.mockResolvedValue(null);
  expect((await GET(new Request("https://example.test/booking-line?store=a"))).status).toBe(404);
});
