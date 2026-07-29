import {
  DigitalButlerRuntime as CoreDigitalButlerRuntime,
  type DigitalButlerRuntimeResult,
} from "@/server/services/digital-butler-runtime-core";
import type { DigitalButlerInboundTextMessage } from "@/server/services/digital-butler-channel";
import { recordHumanSupportHandoff } from "@/server/services/human-support-handoff";

export type { DigitalButlerRuntimeResult } from "@/server/services/digital-butler-runtime-core";
export { topLevelChoiceEntryStepKey } from "./digital-butler-runtime";

export class DigitalButlerRuntime extends CoreDigitalButlerRuntime {
  override async handleText(input: DigitalButlerInboundTextMessage): Promise<DigitalButlerRuntimeResult> {
    const result = await super.handleText(input);
    if (result.outcome === "HANDOFF_REQUESTED") {
      await recordHumanSupportHandoff(input);
    }
    return result;
  }
}
