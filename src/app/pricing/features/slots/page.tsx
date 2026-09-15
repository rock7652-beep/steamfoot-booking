import type { Metadata } from "next";
import { BookingStory } from "../booking-story";

export const metadata: Metadata = {
  title: "時段預約｜管理時間與接待名額 — 蒸管家",
  description: "適合蒸足與固定場次體驗。顧客自行選時段，店長查看名單與剩餘名額，彈性調整當日安排。",
};

export default function SlotFeaturesPage() {
  return <BookingStory kind="slots" />;
}
