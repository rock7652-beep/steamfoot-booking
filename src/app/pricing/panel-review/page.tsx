import { notFound } from "next/navigation";
import { PanelFixture, PanelDeviceReview, type PanelMode } from "./panel-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "共用視窗 RWD 驗收", robots: { index: false, follow: false } };

export default async function PanelReviewPage({ searchParams }: {
  searchParams: Promise<{ frame?: string; mode?: string }>;
}) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const modes: PanelMode[] = ["side", "centered", "compact", "fit", "settings"];
  const mode = modes.find(item => item === query.mode) ?? "settings";
  return query.frame === "1" ? <PanelFixture mode={mode} /> : <PanelDeviceReview mode={mode} />;
}
