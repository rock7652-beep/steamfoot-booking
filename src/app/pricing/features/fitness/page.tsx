import { marketingMetadata } from "@/lib/marketing-seo";
import type { Metadata } from "next";
import { BookingStory } from "../booking-story";

export const metadata: Metadata = {
  ...marketingMetadata("/pricing/features/fitness"),
  title: "運動教室｜課表、學員預約與出席 — 蒸管家",
  description: "適合運動教室、瑜珈與皮拉提斯。集中管理課表、課程名額、學員預約與出席，讓教練核對授課行程。",
};

export default function FitnessFeaturesPage() {
  return <BookingStory kind="fitness" />;
}
