import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({members:vi.fn(),work:vi.fn(),wallets:vi.fn(),bookings:vi.fn(),health:vi.fn(),referral:vi.fn()}));
vi.mock("@/server/actions/liff-member-stores",()=>({fetchLiffMemberStoreContext:m.members}));
vi.mock("@/server/actions/liff-staff-access",()=>({fetchLiffStaffAccess:m.work}));
vi.mock("@/server/actions/liff-my-wallets",()=>({fetchLiffWallets:m.wallets}));
vi.mock("@/server/actions/liff-my-bookings",()=>({fetchLiffBookings:m.bookings}));
vi.mock("@/server/actions/liff-health",()=>({fetchLiffHealthSummary:m.health}));
vi.mock("@/server/actions/liff-referral-share",()=>({fetchLiffReferralShareContext:m.referral}));
import { fetchLiffHomeAccess,fetchLiffHomeSummary } from "@/server/actions/liff-member-home";
beforeEach(()=>{vi.resetAllMocks();m.members.mockResolvedValue({status:"not_signed_in"});m.work.mockResolvedValue({status:"no_access"});m.wallets.mockResolvedValue({status:"no_customer"});m.bookings.mockResolvedValue({status:"no_customer"});m.health.mockResolvedValue({status:"service_unavailable"});m.referral.mockResolvedValue({status:"unavailable"});});
describe("batched native member home reads",()=>{
 it("starts all summary readers before any slow reader finishes",async()=>{
  let resolveWallets!:(value:unknown)=>void;m.wallets.mockReturnValue(new Promise(resolve=>{resolveWallets=resolve}));
  const result=fetchLiffHomeSummary(true);
  for(const reader of [m.wallets,m.bookings,m.health,m.referral])expect(reader).toHaveBeenCalledTimes(1);
  resolveWallets({status:"no_customer"});expect((await result).wallets.status).toBe("no_customer");
 });
 it("starts membership and work authorization in the same request",async()=>{
  let resolveMembers!:(value:unknown)=>void;m.members.mockReturnValue(new Promise(resolve=>{resolveMembers=resolve}));
  const result=fetchLiffHomeAccess();expect(m.work).toHaveBeenCalledTimes(1);resolveMembers({status:"not_signed_in"});
  expect(await result).toEqual({memberContext:{status:"not_signed_in"},workAccess:{status:"no_access"}});
 });
 it("keeps denied/unavailable results and skips unrequested health",async()=>{
  const result=await fetchLiffHomeSummary(false);expect(result.health).toBeNull();expect(m.health).not.toHaveBeenCalled();
  expect(result.wallets).toEqual({status:"no_customer"});expect(result.referralShare).toEqual({status:"unavailable"});
 });
 it("retains access fallbacks and summary failure behavior",async()=>{
  m.members.mockRejectedValue(new Error("private"));m.work.mockRejectedValue(new Error("private"));
  expect(await fetchLiffHomeAccess()).toEqual({memberContext:null,workAccess:{status:"no_access"}});
  m.wallets.mockRejectedValue(new Error("reader failed"));await expect(fetchLiffHomeSummary(false)).rejects.toThrow("reader failed");
 });
 it("does not reuse a previous account/store response",async()=>{
  m.members.mockResolvedValueOnce({status:"signed_in",currentStoreSlug:"a"}).mockResolvedValueOnce({status:"not_signed_in"});
  expect((await fetchLiffHomeAccess()).memberContext).toMatchObject({currentStoreSlug:"a"});
  expect((await fetchLiffHomeAccess()).memberContext).toEqual({status:"not_signed_in"});expect(m.members).toHaveBeenCalledTimes(2);
 });
});
