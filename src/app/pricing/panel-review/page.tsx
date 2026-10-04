import "../../spa-admin.css";
import { notFound } from "next/navigation";
import { PanelFixture, PanelDeviceReview, type PanelMode } from "./panel-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "共用視窗 RWD 驗收", robots: { index: false, follow: false } };

export default async function PanelReviewPage({ searchParams }: {
  searchParams: Promise<{ frame?: string; mode?: string; theme?: string }>;
}) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const modes: PanelMode[] = ["side", "centered", "compact", "fit", "settings"];
  const mode = modes.find(item => item === query.mode) ?? "settings";
  const spa = query.theme === "spa";
  return query.frame === "1"
    ? <div data-spa-admin={spa ? "true" : undefined}><PanelFixture mode={mode} /></div>
    : <PanelDeviceReview mode={mode} spa={spa} />;
}
