import { LiffMemberFrame } from "@/components/liff-member-frame";
import { LiffBottomNav } from "./liff-bottom-nav";
import { resolveStoreSlugForLiff } from "@/lib/store-resolver";
import { readLiffPublicContext } from "@/server/queries/liff-public-context";
import { LiffBrandHeader } from "./liff-brand-header";
import BuildFooter from "@/components/build-footer";

/**
 * LIFF customer experience 2.0 layout — 故意 *不* 沿用 (customer) layout，因為：
 *   1. (customer) layout 會 getCurrentUser() 後 redirect，不允許未登入訪問
 *   2. LIFF 入口必須允許未登入（PR-A 階段不接 NextAuth 流程）
 *
 * 故另開 (liff) route group，避免被 customer auth gate 擋下。
 */
export default async function LiffLayout({ children }: { children: React.ReactNode }) {
  const slug = await resolveStoreSlugForLiff();
  const context = slug ? await readLiffPublicContext(slug) : null;
  const store = context?.store;
  const healthEnabled = context?.healthEnabled ?? false;
  return (
    <LiffMemberFrame>
      <LiffBrandHeader storeSlug={store?.slug} />
      <main className="flex-1">{children}</main>
      <BuildFooter />
      {store && <LiffBottomNav storeSlug={store.slug} healthAssessmentEnabled={healthEnabled} />}
    </LiffMemberFrame>
  );
}

