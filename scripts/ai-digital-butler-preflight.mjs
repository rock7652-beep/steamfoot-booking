import { claimsAiPreview, assertAiPreview } from './ai-digital-butler-preview-scope.mjs';
if (claimsAiPreview()) {
  assertAiPreview();
  console.info('[ai-preview] exact_branch=true isolated_connections=true delivery_blocked=true');
}
