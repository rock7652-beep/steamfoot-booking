import { z } from "zod";
import type { AiSetting } from "./contracts";
import type { AiKnowledgeDocument } from "./knowledge-document";
import type { AiHandoffPage } from "./handoff-contract";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";
export const BRAND_PREVIEW_SERVICE = "ai-preview-brand-steamfoot";
export const brandOperationSchema = z.enum(["save", "publish", "withdraw", "setting", "handoff", "resume", "test"]);
export type BrandOperation = z.infer<typeof brandOperationSchema>;
export type BrandManagementSnapshot = {
  serviceId: typeof BRAND_PREVIEW_SERVICE; name: string; viewKey: string;
  grant: FeaturePresentationState; effectiveGrant: FeaturePresentationState; globalStopped: boolean;
  setting: AiSetting; revision: number; document: AiKnowledgeDocument;
  usage: { requests: string; reservedMicros: string; budgetMicros: number; alerts: number[] };
  handoffs: AiHandoffPage; synthetic: { handoff: boolean; revision: number };
  capabilities: Record<BrandOperation, boolean>;
};
