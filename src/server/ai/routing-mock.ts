import "server-only";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { DigitalButlerRuntime, matchesDigitalButlerTriggerKeyword, type DigitalButlerRuntimeIdentityCodec } from "../services/digital-butler-runtime";
import type { TrustedAiScope } from "./service";
import type { AiRoutingScenario } from "./routing-contract";

type Repository=NonNullable<ConstructorParameters<typeof DigitalButlerRuntime>[0]>;
type Conversation=NonNullable<Awaited<ReturnType<Repository["findActiveConversation"]>>>;
/** Request-local synthetic data only. Never reads a real flow or creates a lead. */
export function createOriginalRoutingMock(scope:TrustedAiScope,eventId:string,scenario:AiRoutingScenario,secret:string) {
  if(scope.channel!=="TEST" || !/^ai-preview-(steamfoot|beauty|fitness|music)$/.test(scope.storeId) || secret.length<32) throw new Error("AI_TEST_ONLY");
  const key=createHmac("sha256",secret).update("original-runtime-mock-only").digest();
  const codec:DigitalButlerRuntimeIdentityCodec={
    hash:value=>createHmac("sha256",key).update(value).digest("hex"),
    encrypt:value=>{const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);return {ciphertext:Buffer.concat([cipher.update(value,"utf8"),cipher.final()]),iv,authTag:cipher.getAuthTag(),keyVersion:"v1"};},
  };
  const steps:Conversation["flowVersion"]["steps"]=[{id:"mock-text",stepKey:"text",position:0,type:"TEXT",config:{text:`這是${scope.module}合成原流程回覆。`},required:false},{id:"mock-end",stepKey:"end",position:1,type:"COMPLETE_FLOW",config:{},required:false}];
  let active:Conversation|null=scenario==="active"?{id:"mock-active",storeId:scope.storeId,provider:"INSTAGRAM",flowId:"mock-flow",flowVersionId:"mock-version",currentStepKey:"phone",expiresAt:new Date(Date.now()+60_000),flowVersion:{steps:[{id:"mock-phone",stepKey:"phone",position:0,type:"TAIWAN_MOBILE",required:true,config:{prompt:"合成流程等待電話欄位；本測試不輸入電話。"}}]},answers:[]}:null;
  const repository:Repository={
    claimEvent:async()=>true,setEventOutcome:async()=>undefined,findActiveConversation:async()=>active,
    expireConversation:async()=>{active=null;},cancelConversation:async()=>{active=null;return true;},hasPreviousValidationFailure:async()=>false,
    findTriggeredFlow:async(_store,text)=>matchesDigitalButlerTriggerKeyword(["合成流程入口"],text)?{id:"mock-flow",currentPublishedVersionId:"mock-version",publishedVersion:{definition:{trigger:{keywords:["合成流程入口"]}},steps},startStepKey:null}:null,
    createConversation:async input=>{active={id:"mock-new",storeId:input.storeId,provider:input.provider,flowId:input.flowId,flowVersionId:input.flowVersionId,currentStepKey:input.currentStepKey,expiresAt:input.expiresAt,flowVersion:{steps},answers:[]};return active;},
    saveAnswer:async()=>{throw new Error("AI_MOCK_BUSINESS_WRITE_BLOCKED");},
    advanceConversation:async input=>{if(active){active.currentStepKey=input.currentStepKey;if(input.status==="COMPLETED")active=null;return true;}return false;},
    createLead:async()=>{throw new Error("AI_MOCK_BUSINESS_WRITE_BLOCKED");},
    deliverReplyIfActive:async(_store,id,deliver)=>{if(active?.id!==id)return false;await deliver();return true;},
  };
  const runtime=new DigitalButlerRuntime(repository,async()=>{if(scenario==="inactive")throw new Error("MOCK_INACTIVE");},codec);
  return {
    handle:(text:string)=>runtime.handleText({storeId:scope.storeId,provider:"INSTAGRAM",channelAccountId:"mock-original-only",senderId:codec.hash(scope.actorId),messageId:eventId,webhookEventId:eventId,occurredAt:new Date(),text}),
    allowReply:async(result:Awaited<ReturnType<typeof runtime.handleText>>)=>!result.replyGuard || runtime.deliverReplyIfActive(scope.storeId,result.replyGuard.conversationId,async()=>undefined),
  };
}
export const aiRoutingMessages:Record<AiRoutingScenario,string>={original:"合成流程入口",active:"今天的營業時間？",known:"有哪些服務？",unknown:"明天會下雨嗎？",handoff:"轉真人",inactive:"有哪些服務？",cancel:"停止"};
