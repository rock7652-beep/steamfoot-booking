import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({slug:vi.fn(),presentation:vi.fn(),industry:vi.fn(),shell:vi.fn()}));
vi.mock("next/navigation",()=>({notFound:()=>{throw Error("NOT_FOUND")}}));
vi.mock("@/lib/store-resolver",()=>({resolveStoreSlugForLiff:m.slug,resolveStorePresentation:m.presentation}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.industry}));
vi.mock("@/app/(liff)/liff/liff-shell",()=>({LiffShell:m.shell}));
import Page from "@/app/(liff)/liff/public-trial/page";
const a={storeId:"a",slug:"a",providerId:"901",loginChannelId:"902",messagingProviderId:"901",messagingChannelId:"903",liffId:"902-shared",basicId:"@shared",destination:"U"+"a".repeat(32),accessTokenEnv:"TEST_TOKEN",channelSecretEnv:"TEST_SECRET",sharedAccountKey:"shared"};
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("STORE_LINE_CONFIG_JSON",JSON.stringify([a,{...a,storeId:"b",slug:"b"}]));vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON","");
  m.slug.mockResolvedValue("a");m.presentation.mockImplementation(async slug=>({id:slug,slug,name:slug,contactUrl:"https://line.me/R/ti/p/@shared"}));m.industry.mockResolvedValue("beauty");
});afterEach(()=>vi.unstubAllEnvs());
it("returns a verified beauty bridge to its own booking form",async()=>{
  const page=await Page({searchParams:Promise.resolve({})});expect(page.props).toMatchObject({storeSlug:"a",bookingPath:"/beauty-trial/a",liffId:"902-shared"});
});
it("uses existing course login and onboarding before opening the course schedule",async()=>{
  m.industry.mockResolvedValue("course");const page=await Page({searchParams:Promise.resolve({bookingStore:"b"})});
  expect(page.type).toBe(m.shell);expect(page.props).toMatchObject({storeSlug:"b",memberDataSource:"course",bookingIntent:true});
});
it("does not accept an unrelated store supplied through the query",async()=>{
  await expect(Page({searchParams:Promise.resolve({bookingStore:"other"})})).rejects.toThrow("NOT_FOUND");
  expect(m.presentation).not.toHaveBeenCalled();
});
it("rejects a configured ID/slug mismatch before rendering an identity form",async()=>{
  m.presentation.mockResolvedValue({id:"wrong",slug:"a",name:"wrong",contactUrl:""});
  await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow("NOT_FOUND");
});
