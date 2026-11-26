import { createHmac, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createAiLineFixture, readAiLineFixture } from "@/server/ai/line-synthetic";
import { AI_LINE_SYNTHETIC_ACCOUNT } from "@/server/ai/line-synthetic-contract";
import type { TrustedAiScope } from "@/server/ai/service";
vi.mock("@/lib/line-config",()=>({getLineSecretForStore:()=>{throw new Error("OA_CREDENTIAL_LOOKUP_FORBIDDEN");}}));
vi.mock("@/lib/digital-butler-entitlement",()=>({requireDigitalButlerConversationActivation:vi.fn()}));
const scope: TrustedAiScope = { storeId:"ai-preview-steamfoot", module:"STEAMFOOT", actorId:"verified-operator", channel:"TEST", channelAccountId:AI_LINE_SYNTHETIC_ACCOUNT };
it.each(["steamfoot","beauty","fitness","music"])("admits a signed %s fixture in its operator TEST scope", kind => {
  const s={...scope,storeId:`ai-preview-${kind}`,module:kind.toUpperCase() as TrustedAiScope["module"]};
  const id=randomUUID(),f=createAiLineFixture(s,id,"known");
  expect(readAiLineFixture(s,f.rawBody,f.signature)).toEqual({eventId:id,message:"營業時間？"});
});
it.each([{storeId:"real-store"},{module:"MUSIC"},{channel:"LINE"},{actorId:""},{channelAccountId:"real-oa"}])("rejects non-fixture scope %j", extra => {
  expect(()=>createAiLineFixture({...scope,...extra} as TrustedAiScope,randomUUID(),"known")).toThrow();
});
it("binds signature to bytes and destination without looking up OA credentials",()=>{
  const f=createAiLineFixture(scope,randomUUID(),"known");
  expect(()=>readAiLineFixture(scope,f.rawBody+" ",f.signature)).toThrow();
  expect(()=>readAiLineFixture(scope,f.rawBody,"wrong")).toThrow();
  expect(()=>readAiLineFixture({...scope,storeId:"ai-preview-beauty",module:"BEAUTY"},f.rawBody,f.signature)).toThrow();
});
it.each(["extra-store","group","other-actor","two-events","wrong-event-id"])("rejects signed malformed fixture %s", mode=>{
  const f=createAiLineFixture(scope,randomUUID(),"known"),body=JSON.parse(f.rawBody);
  if(mode==="extra-store")body.storeId="foreign";
  if(mode==="group")body.events[0].source.type="group";
  if(mode==="other-actor")body.events[0].source.userId="real-customer";
  if(mode==="two-events")body.events.push(body.events[0]);
  if(mode==="wrong-event-id")body.events[0].message.id=randomUUID();
  const raw=JSON.stringify(body),sig=createHmac("sha256","steamfoot-signed-line-fixture-only-not-an-oa-secret").update(raw).digest("base64");
  expect(()=>readAiLineFixture(scope,raw,sig)).toThrow();
});
