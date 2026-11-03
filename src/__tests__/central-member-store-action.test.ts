import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),memberships:vi.fn(),set:vi.fn(),redirect:vi.fn((url:string):never=>{throw new Error(`REDIRECT:${url}`);})}));
vi.mock("@/lib/session",()=>({requireSession:m.session}));
vi.mock("@/server/services/central-member-resolver",()=>({resolveCentralMembershipsForUser:m.memberships}));
vi.mock("next/headers",()=>({cookies:async()=>({set:m.set})}));
vi.mock("next/navigation",()=>({redirect:m.redirect}));
import { selectCentralMemberStoreAction } from "@/server/actions/central-member-store";
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({id:"verified-user",role:"CUSTOMER"});m.memberships.mockResolvedValue({memberships:[{storeSlug:"fitness-member-store"},{storeSlug:"steamfoot-member-store"}]});});
function form(slug:string){const data=new FormData();data.set("storeSlug",slug);return data;}
it("switches only to a current server-verified membership and keeps the fixed return route",async()=>{
  await expect(selectCentralMemberStoreAction(form("steamfoot-member-store"))).rejects.toThrow("REDIRECT:/s/steamfoot-member-store/book?storeSwitched=1");
  expect(m.memberships).toHaveBeenCalledWith("verified-user");
  expect(m.set).toHaveBeenCalledWith("store-slug","steamfoot-member-store",expect.objectContaining({httpOnly:true,path:"/",sameSite:"lax"}));
});
it("rejects a removed or forged store without writing the selected store cookie",async()=>{
  await expect(selectCentralMemberStoreAction(form("unclaimed-store"))).rejects.toThrow("REDIRECT:/store-select");
  expect(m.set).not.toHaveBeenCalled();
});
it("does not offer customer switching to a non-customer session",async()=>{
  m.session.mockResolvedValue({id:"staff",role:"STAFF"});
  await expect(selectCentralMemberStoreAction(form("fitness-member-store"))).rejects.toThrow("REDIRECT:/");
  expect(m.memberships).not.toHaveBeenCalled();expect(m.set).not.toHaveBeenCalled();
});
it("returns LINE-origin course members to the selected store's LIFF shell",async()=>{
  const data=form("steamfoot-member-store");data.set("memberEntry","liff");
  await expect(selectCentralMemberStoreAction(data)).rejects.toThrow("REDIRECT:/s/steamfoot-member-store/liff?storeSwitched=1");
});
it("does not accept a client-provided external redirect as the entry mode",async()=>{
  const data=form("fitness-member-store");data.set("memberEntry","https://evil.example");
  await expect(selectCentralMemberStoreAction(data)).rejects.toThrow("REDIRECT:/s/fitness-member-store/book?storeSwitched=1");
});
