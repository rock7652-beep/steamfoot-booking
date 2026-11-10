import type { Metadata } from "next";
import { marketingMetadata } from "@/lib/marketing-seo";
import { BookingStory } from "../booking-story";

export const metadata: Metadata = {
  ...marketingMetadata("/pricing/features/beauty"),
  title: "美業模組｜美容、美體、美甲、美睫、按摩與 SPA — 蒸管家",
  description: "顧客約哪位服務人員，要做哪些項目？適合美容、美體、美甲、美睫、按摩與 SPA，集中查看服務、人員安排與顧客預約。",
};

export default function BeautyFeaturesPage() {
  return <BookingStory kind="beauty" />;
}
