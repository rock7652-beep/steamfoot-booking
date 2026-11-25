import "server-only";
import { z } from "zod";
import type { TrustedAiScope } from "./service";
import type { AiModule } from "./contracts";

export type AiBusinessTool = {
  name: string; module: AiModule; mode: "READ" | "WRITE";
  parameters: z.ZodTypeAny;
  authorize: (scope: TrustedAiScope) => Promise<void>;
  execute: (scope: TrustedAiScope, parameters: unknown) => Promise<unknown>;
};
/** Future adapters call existing services. No model-supplied scope or direct DB access. */
export class AiToolRegistry {
  private readonly tools = new Map<string, AiBusinessTool>();
  register(tool: AiBusinessTool) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(tool.name) || this.tools.has(tool.name)) throw new Error("AI_TOOL_REGISTRATION_INVALID");
    this.tools.set(tool.name, tool);
  }
  async invoke(scope: TrustedAiScope, proposal: unknown, phase: "KNOWLEDGE" | "READ_ONLY") {
    const request = z.object({ name: z.string(), arguments: z.record(z.unknown()) }).strict().parse(proposal);
    if (phase === "KNOWLEDGE") throw new Error("AI_TOOLS_DISABLED");
    const tool = this.tools.get(request.name);
    if (!scope.storeId || scope.storeId === "__all__" || !tool || tool.module !== scope.module || tool.mode !== "READ") throw new Error("AI_TOOL_NOT_AUTHORIZED");
    if (["storeId", "userId", "customerId", "actorId"].some(key => key in request.arguments)) throw new Error("AI_TOOL_SCOPE_FORBIDDEN");
    const parameters = tool.parameters.parse(request.arguments);
    await tool.authorize(scope);
    return tool.execute(Object.freeze({ ...scope }), parameters);
  }
}
