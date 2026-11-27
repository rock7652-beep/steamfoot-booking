import "server-only";
import { createHmac } from "node:crypto";
import { classifyDigitalButlerGlobalCommand } from "@/lib/digital-butler-global-command";
import type { DigitalButlerRuntimeResult } from "../services/digital-butler-runtime";
import type { AiOwnerRepository } from "./owner-repository";
import type { AiServiceResult } from "./service-core";
import type { AiOwnerRoutingRepository } from "./owner-routing-repository";
import type { AiRoutingResult } from "./routing-contract";
import { AI_HANDOFF_TEXT } from "./contracts";

export type AiRoutingPorts<S> = {
  authorize(scope: S): Promise<void>;
  original(text: string): Promise<DigitalButlerRuntimeResult>;
  originalReplyAllowed(result: DigitalButlerRuntimeResult): Promise<boolean>;
  ai(text: string, conversationRevision: number): Promise<AiServiceResult>;
  providerCalls(): number;
};
/** Shared coordinator returns intents to isolated callers. It has no channel sender. */
export interface AiRoutingReceipts<I> {
  claim(id: I, fingerprint: string, interrupt: boolean, now: Date): ReturnType<AiOwnerRoutingRepository["claim"]>;
  finish(id: I, revision: number, route: string, outcome: string, handoff: boolean, now: Date): Promise<boolean>;
  unknown(id: I, now: Date): Promise<void>;
}
export interface AiRoutingConversations<I> {
  handoff(id: I, value: boolean, now: Date): ReturnType<AiOwnerRepository["handoff"]>;
  conversationState(id: I): ReturnType<AiOwnerRepository["conversationState"]>;
}
export class AiRoutingCore<S extends { channel: import("./contracts").AiChannel }, I> {
  constructor(private readonly receipts: AiRoutingReceipts<I>, private readonly conversations: AiRoutingConversations<I>, private readonly secret: string, private readonly clock=()=>new Date(), private readonly channels: readonly import("./contracts").AiChannel[], private readonly adapter: { capture(scope: S): S; identity(scope: S, eventId: string, secret: string): I; namespace(scope: S): string }) {}
  async respond(scope: S, eventId: string, scenario: string, message: string, ports: AiRoutingPorts<S>): Promise<AiRoutingResult> {
    const result = (route: AiRoutingResult["route"], outcome: string, text="", originalOutcome: string|null=null): AiRoutingResult => ({ route,outcome,text,originalOutcome,providerCalls:ports.providerCalls() });
    let identity: I|undefined;
    let claimed=false;
    try {
      scope=this.adapter.capture(scope);
      if (!this.channels.includes(scope.channel)) return result("BLOCKED","TEST_ONLY");
      await ports.authorize(scope);
      identity=this.adapter.identity(scope,eventId,this.secret);
      const command=classifyDigitalButlerGlobalCommand(message);
      const fingerprint=createHmac("sha256",this.secret).update(JSON.stringify([this.adapter.namespace(scope),scenario,message])).digest("hex");
      const claim=await this.receipts.claim(identity,fingerprint,command==="HANDOFF",this.clock());
      if(claim.state!=="CLAIMED") return result(claim.state==="DUPLICATE"?"DUPLICATE":"BLOCKED",claim.state);
      claimed=true;
      const finish=async(route:AiRoutingResult["route"],outcome:string,text="",originalOutcome:string|null=null,revision=claim.revision,handoff=false)=>{
        await ports.authorize(scope);
        const allowed=await this.receipts.finish(identity!,revision,route,outcome,handoff,this.clock());
        claimed=false;
        return allowed?result(route,outcome,text,originalOutcome):result("SILENT","SCOPE_CHANGED","",originalOutcome);
      };
      if(claim.handoff) return finish("SILENT","HUMAN_ACTIVE","",null,claim.revision,true);
      if(command==="HANDOFF") {
        const revision=await this.conversations.handoff(identity,true,this.clock());
        return finish("HUMAN","HANDOFF_REQUESTED","已停止自動回覆，請由真人客服協助。",null,revision,true);
      }
      const original=await ports.original(message);
      if(original.handled) {
        if(original.outcome==="HANDOFF_REQUESTED") {
          const revision=await this.conversations.handoff(identity,true,this.clock());
          return finish("HUMAN","HANDOFF_REQUESTED",AI_HANDOFF_TEXT,original.outcome,revision,true);
        }
        if(!await ports.originalReplyAllowed(original)) return finish("SILENT","ORIGINAL_REPLY_STALE","",original.outcome);
        return finish("ORIGINAL",original.outcome,original.messages.filter(m=>m.type==="text").map(m=>m.text).join("\n"),original.outcome);
      }
      if(original.outcome!=="NO_MATCH" || original.messages.length) return finish("BLOCKED","ORIGINAL_NOT_ELIGIBLE","",original.outcome);
      if(command) return finish("ORIGINAL","COMMAND_WITHOUT_FLOW","",original.outcome);
      // Check again before entering AI; a human may have intervened during the original await.
      const before=await this.conversations.conversationState(identity);
      if(before.handoff || before.revision!==claim.revision) return finish("SILENT","SCOPE_CHANGED","",original.outcome);
      const answer=await ports.ai(message,claim.revision);
      if(answer.outcome==="ANSWER") return finish("AI","AI_ANSWER",answer.text,original.outcome);
      if(answer.outcome==="HANDOFF") return finish("HUMAN","AI_HANDOFF",answer.text,original.outcome,claim.revision+1,true);
      return finish(answer.outcome==="DUPLICATE"?"DUPLICATE":"BLOCKED",answer.outcome,"",original.outcome);
    } catch {
      if(claimed && identity) {
        await this.receipts.unknown(identity,this.clock()).catch(()=>undefined);
        await this.conversations.handoff(identity,true,this.clock()).catch(()=>undefined);
      }
      return result("BLOCKED","ROUTING_UNKNOWN");
    }
  }
}
