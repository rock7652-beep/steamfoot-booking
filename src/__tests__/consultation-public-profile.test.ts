import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
import { payloadSchema } from "@/lib/consultation-lead";
const base={requestId:"f2170225-17f8-4ad7-8031-f305afba256f",storeName:"虛構店",contactName:"測試",industry:"服務",phone:"0000000000",needs:["預約"],replaceReason:[]};
describe("consultation optional public profile fields",()=>{
 it("uses separate optional public URLs without repurposing tracking fields or requiring email",()=>{
  const dom=new JSDOM(readFileSync("public/pricing/apply.html","utf8"));
  for(const name of ["websiteUrl","facebookUrl","instagramUrl"]){const field=dom.window.document.querySelector(`input[name=${name}]`) as HTMLInputElement;expect(field.type).toBe("url");expect(field.required).toBe(false);expect(field.maxLength).toBe(2000);}
  expect(dom.window.document.querySelector('input[name=email]')).toBeNull();dom.window.close();
 });
 it("leaves the existing source page independent from the supplied website",()=>{
  const parsed=payloadSchema.parse({...base,pageUrl:"https://www.steamfoot.com/apply?intent=trial",websiteUrl:"https://example.com/shop"});
  expect(parsed.pageUrl).not.toBe(parsed.websiteUrl);expect(parsed.websiteUrl).toBe("https://example.com/shop");
 });
 it("preserves the no-links consultation contract",()=>expect(payloadSchema.safeParse({...base,websiteUrl:"",facebookUrl:"",instagramUrl:""}).success).toBe(true));
});
