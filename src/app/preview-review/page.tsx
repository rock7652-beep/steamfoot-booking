import { notFound } from "next/navigation";
import { customerReviewConfig } from "@/lib/customer-review-access";
import { CustomerReviewEntry } from "./review-entry";

export const dynamic = "force-dynamic";
export const metadata = { title: "#1310 暫時驗收", robots: { index: false, follow: false } };

export default function CustomerReviewPage() {
  if (!customerReviewConfig()) notFound();
  return <CustomerReviewEntry />;
}
