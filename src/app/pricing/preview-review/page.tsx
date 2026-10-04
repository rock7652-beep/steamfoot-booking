import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";

export const dynamic = "force-dynamic";
export const metadata = { title: "官網裝置預覽", robots: { index: false, follow: false } };

const devices = [
  { id: "phone-small", label: "窄手機", width: 360, height: 800 },
  { id: "desktop", label: "桌機", width: 1366, height: 900 },
  { id: "phone", label: "手機", width: 390, height: 844 },
  { id: "ipad-portrait", label: "iPad 直向", width: 768, height: 1024 },
  { id: "ipad-landscape", label: "iPad 橫向", width: 1024, height: 768 },
] as const;

// Preview-only review aid: real iframe viewports exercise media queries without
// modifying the pricing page or exposing test controls on the public site.
export default async function PricingPreviewReview({ searchParams }: { searchParams: Promise<{ device?: string; page?: string; section?: string }> }) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const device = devices.find(item => item.id === query.device) ?? devices[2];
  const page = query.page === "guides" ? "guides" : query.page === "privacy" ? "privacy" : query.page === "fitness" ? "fitness" : query.page === "music" ? "music" : query.page === "services" ? "services" : query.page === "slots" ? "slots" : query.page === "login" ? "login" : query.page === "home" ? "home" : query.page === "cases" ? "cases" : query.page === "features" ? "features" : query.page === "apply-success" ? "apply-success" : query.page === "apply" ? "apply" : "pricing";
  const section = query.section === "trial" ? "trial" : query.section === "faq" ? "faq" : query.section === "hero" ? "hero-title" : query.section === "usage" ? "usage" : query.section === "how-it-works" ? "how-it-works" : "testimonials";
  const pageUrl = page === "guides" ? "/guides" : page === "privacy" ? "/privacy" : ["fitness", "music", "services", "slots"].includes(page) ? "/pricing/features/" + page : page === "login" ? "/hq/login" : page === "home" ? "/pricing/business#" + section : page === "cases" ? "/pricing/cases?store=nuanmu" : page === "features" ? "/pricing/features" : page === "apply" ? "/apply" : "/pricing";
  // Render the real success markup without scripts or sending a test application.
  const successPreview = page === "apply-success"
    ? (await readFile(process.cwd() + "/public/pricing/apply.html", "utf8"))
      .replace(/<script>[\s\S]*?<\/script>/g, "")
      .replace("</style>", "#formView{display:none}.success{display:block}</style>")
      .replace("我們已經大致了解你的店", "已收到您的需求")
    : undefined;
  return <main className="min-h-screen bg-[#F8F5EE] p-4 text-[#153B31]">
    <h1 className="text-xl font-semibold">官網裝置預覽</h1>
    <nav aria-label="裝置尺寸" className="my-3 flex flex-wrap gap-2">
      {devices.map(item => <a key={item.id} href={"?device=" + item.id + "&page=" + page + "&section=" + section} aria-current={device.id === item.id ? "page" : undefined} className={"rounded-lg border px-4 py-3 text-base " + (device.id === item.id ? "bg-[#123E32] text-white" : "bg-white")}>{item.label}</a>)}
      <a href="/pricing" className="rounded-lg border bg-white px-4 py-3 text-base">返回價格頁</a>
    </nav>
    <p className="mb-3 text-sm">{device.label}｜{device.width} × {device.height}</p>
    {successPreview && <p className="mb-3 text-sm">送出成功畫面預覽，未寄送任何申請。</p>}
    <div className="overflow-x-auto">
      <iframe title={device.label + (page === "features" ? "功能頁" : page.startsWith("apply") ? "需求問卷" : "價格頁")} src={successPreview ? undefined : pageUrl} srcDoc={successPreview} width={device.width} height={device.height} className="box-content block rounded-xl border bg-white" />
    </div>
  </main>;
}
