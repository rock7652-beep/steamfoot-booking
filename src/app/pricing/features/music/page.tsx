import type { Metadata } from "next";
import { BookingStory } from "../booking-story";

export const metadata: Metadata = {
  title: "音樂教室｜固定課、調課補課與老師鐘點 — 蒸管家",
  description: "適合音樂教室、樂器教學與才藝課程。集中管理固定課表、調課補課、學員進度與續報，核對老師授課明細。",
};

export default function MusicFeaturesPage() {
  return <BookingStory kind="music" />;
}
