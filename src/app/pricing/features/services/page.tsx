import type { Metadata } from "next";
import { BookingStory } from "../booking-story";

export const metadata: Metadata = {
  title: "服務預約｜安排療程、人員與位置 — 蒸管家",
  description: "適合 SPA、美容與美體。依療程時長、人員專業、班表與服務位置安排預約，查看顧客預約及人員工作行程。",
};

export default function ServiceFeaturesPage() {
  return <BookingStory kind="services" />;
}
