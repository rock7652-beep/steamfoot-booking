import { notFound } from "next/navigation";
import { isSinglePricingUiPreview } from "../../../scripts/guide-ui-preview-scope.mjs";
import PricingPreview from "./pricing-preview";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default function Page() {
  if (!isSinglePricingUiPreview()) notFound();
  return <PricingPreview />;
}
