import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "價格頁裝置預覽", robots: { index: false, follow: false } };

const devices = [
  { id: "phone", label: "手機", width: 390, height: 844 },
  { id: "ipad-portrait", label: "iPad 直向", width: 768, height: 1024 },
  { id: "ipad-landscape", label: "iPad 橫向", width: 1024, height: 768 },
] as const;

// Preview-only review aid: real iframe viewports exercise media queries without
// modifying the pricing page or exposing test controls on the public site.
export default async function PricingPreviewReview({ searchParams }: { searchParams: Promise<{ device?: string; page?: string }> }) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const device = devices.find(item => item.id === query.device) ?? devices[0];
  const page = query.page === "features" ? "features" : "pricing";
  const pageUrl = page === "features" ? "/pricing/features" : "/pricing";
  return <main className="min-h-screen bg-[#F8F5EE] p-4 text-[#153B31]">
    <h1 className="text-xl font-semibold">價格頁裝置預覽</h1>
    <nav aria-label="裝置尺寸" className="my-3 flex flex-wrap gap-2">
      {devices.map(item => <a key={item.id} href={"?device=" + item.id + "&page=" + page} aria-current={device.id === item.id ? "page" : undefined} className={"rounded-lg border px-4 py-3 text-base " + (device.id === item.id ? "bg-[#123E32] text-white" : "bg-white")}>{item.label}</a>)}
      <a href="/pricing" className="rounded-lg border bg-white px-4 py-3 text-base">返回價格頁</a>
    </nav>
    <p className="mb-3 text-sm">{device.label}｜{device.width} × {device.height}</p>
    <div className="overflow-x-auto">
      <iframe title={device.label + (page === "features" ? "功能頁" : "價格頁")} src={pageUrl} width={device.width} height={device.height} className="block rounded-xl border bg-white" />
    </div>
  </main>;
}
