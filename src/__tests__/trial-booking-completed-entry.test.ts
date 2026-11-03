import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({find:vi.fn(),decrypt:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{trialBookingLink:{findUnique:m.find}}}));
vi.mock("@/lib/digital-butler-crypto",()=>({decryptDigitalButlerValue:m.decrypt,encryptDigitalButlerValue:vi.fn(),hashDigitalButlerSensitiveValue:vi.fn()}));
import { resolveTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
const now=new Date("2026-10-26T00:00:00Z");
const record={id:"entry",storeId:"s",channel:"LINE",tokenHash:createHash("sha256").update("secret").digest("hex"),expiresAt:new Date("2026-10-26T00:30:00Z"),consumedAt:now,identityCiphertext:Buffer.from("cipher"),identityIv:Buffer.from("iv"),identityAuthTag:Buffer.from("tag"),identityKeyVersion:"v1"};
beforeEach(()=>{vi.resetAllMocks();m.find.mockResolvedValue({...record});m.decrypt.mockReturnValue("verified-subject");});
it("keeps consumed and expired entries unusable for every ordinary booking read",async()=>{
  expect(await resolveTrialBookingChatLink("entry.secret",now)).toBeNull();expect(m.decrypt).not.toHaveBeenCalled();
});
it("allows recovery of an already committed reservation only with the original opaque secret",async()=>{
  expect(await resolveTrialBookingChatLink("entry.secret",now,true)).toMatchObject({linkId:"entry",storeId:"s",chatIdentity:"verified-subject"});
  m.decrypt.mockClear();expect(await resolveTrialBookingChatLink("entry.wrong",now,true)).toBeNull();expect(m.decrypt).not.toHaveBeenCalled();
});
it("does not use recovery mode for an unconsumed capability",async()=>{
  m.find.mockResolvedValue({...record,consumedAt:null});expect(await resolveTrialBookingChatLink("entry.secret",now,true)).toBeNull();expect(m.decrypt).not.toHaveBeenCalled();
});
it("never revives an expired capability when recovering a committed booking",async()=>{
  m.find.mockResolvedValue({...record,expiresAt:now});
  expect(await resolveTrialBookingChatLink("entry.secret",now,true)).toBeNull();expect(m.decrypt).not.toHaveBeenCalled();
});
it("fails closed if the stored identity cannot be authenticated/decrypted",async()=>{
  m.decrypt.mockImplementation(()=>{throw Error("authentication failed")});expect(await resolveTrialBookingChatLink("entry.secret",now,true)).toBeNull();
});
