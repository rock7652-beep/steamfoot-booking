import type { FeatureKey } from "./feature-flags";
import type { PermissionCode } from "./permissions";

export interface GuideAccess {
  module: "steamfoot" | "spa";
  permissions: readonly string[];
  features: Partial<Record<FeatureKey, boolean>>;
}
export interface GuideCategory { id: string; label: string; routes: string[] }
export interface OperationGuide {
  id: string; category: string; title: string; summary: string; keywords: string;
  path: string; steps: readonly string[]; important: string; success: string; details: readonly string[];
  modules: readonly GuideAccess["module"][]; permission: PermissionCode | ""; feature: FeatureKey | null;
  sources: readonly string[]; verification: "source-reviewed";
}
