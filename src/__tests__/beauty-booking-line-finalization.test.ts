import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({command:vi.fn(),group:vi.fn(),entry:vi.fn(),connect:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
vi.mock("@/lib/beauty-db",()=>({beautyPrisma:{beautyCommand:{findUnique:m.command},beautyGroup:{findFirst:m.group}}}));
vi.mock("@/server/services/trial-booking-chat-link",()=>({resolveTrialBookingChatLink:m.entry}));
vi.mock("@/server/beauty/verified-booking-identity",()=>({connectVerifiedBeautyBooking:m.connect}));
import { finalizeBeautyBookingLine } from "@/server/services/beauty-booking-line-finalization";
const input={storeId:"s",groupId:"g",requestKey:"request",entryToken:"opaque-entry"};
beforeEach(()=>{
  vi.resetAllMocks();m.command.mockResolvedValue({actorKey:"entry:"+createHash("sha256").update(input.entryToken).digest("hex"),result:{groupId:"g",ids:["b"]}});
  m.entry.mockResolvedValue({linkId:"entry",storeId:"s",channel:"LINE",chatIdentity:"verified-subject"});m.group.mockResolvedValue({customerId:"c",contactName:"範例"});
  m.transaction.mockImplementation(async work=>work("PRIMARY_IDENTITY_TX"));
});
it("uses the primary identity transaction only after proving the committed booking and token owner",async()=>{
  expect(await finalizeBeautyBookingLine(input)).toEqual({status:"linked"});
  expect(m.entry).toHaveBeenCalledWith(input.entryToken,expect.any(Date),true);
  expect(m.connect).toHaveBeenCalledWith("PRIMARY_IDENTITY_TX",{storeId:"s",customerId:"c",lineUserId:"verified-subject",name:"範例"});
});
it.each([null,{actorKey:"someone-else",result:{groupId:"g"}},{actorKey:"entry:"+createHash("sha256").update(input.entryToken).digest("hex"),result:{groupId:"other"}}])("does not recover an entry without the exact committed command",async command=>{
  m.command.mockResolvedValue(command);expect(await finalizeBeautyBookingLine(input)).toEqual({status:"needs_help"});expect(m.entry).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();
});
it("keeps a cross-store consumed entry out of the identity transaction",async()=>{
  m.entry.mockResolvedValue({storeId:"other",channel:"LINE",chatIdentity:"other"});expect(await finalizeBeautyBookingLine(input)).toEqual({status:"needs_help"});expect(m.transaction).not.toHaveBeenCalled();
});
it("does not report success if the identity transaction fails, and safely retries the same reservation",async()=>{
  m.transaction.mockRejectedValueOnce(new Error("database temporarily unavailable"));
  expect(await finalizeBeautyBookingLine(input)).toEqual({status:"needs_help"});
  expect(await finalizeBeautyBookingLine(input)).toEqual({status:"linked"});expect(m.group).toHaveBeenCalledTimes(2);
});
it("does not derive identity ownership from a phone-only public reservation",async()=>{
  expect(await finalizeBeautyBookingLine({...input,entryToken:undefined})).toEqual({status:"needs_help"});expect(m.command).not.toHaveBeenCalled();expect(m.transaction).not.toHaveBeenCalled();
});
