import { notFound } from "next/navigation";
import { customerReviewConfig } from "@/lib/customer-review-access";
import { customerReviewTarget, type CustomerReviewModule } from "@/lib/customer-review-targets";
import { CustomerReviewEntry } from "./review-entry";

export const dynamic = "force-dynamic";
export const metadata = { title: "#1310 暫時驗收", robots: { index: false, follow: false } };

export default async function CustomerReviewPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  if (!customerReviewConfig()) notFound();
  const params = await searchParams;
  const reviewModule = params.module ?? "spa";
  if (!customerReviewTarget(reviewModule)) notFound();
  return <CustomerReviewEntry initialModule={reviewModule as CustomerReviewModule}/>;
}
