import { prisma } from "@/lib/db";
import { getMarketingUsage } from "@/lib/marketing-usage-server";
import { buildHqBrandRegions } from "@/lib/hq-brand-regions";
import { HqBrandUsage } from "@/components/hq-brand-usage";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell } from "@/components/desktop";

export async function BrandOverviewContent() {
  const [usage, stores] = await Promise.all([
    getMarketingUsage(),
    prisma.store.findMany({
      // Same eligible-store definition as the public marketing aggregate.
      where: { isDemo: false, operatingStatus: "ACTIVE", plan: { not: "EXPERIENCE" } },
      select: { id: true, name: true, slug: true, shopConfig: { select: { address: true } } },
    }),
  ]);
  const regions = buildHqBrandRegions(stores);
  return <PageShell>
    <HqBrandUsage usage={usage} />
    <section aria-labelledby="hq-region-heading" className="overflow-hidden rounded-xl border border-earth-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-earth-200 px-4 py-3">
        <h2 id="hq-region-heading" className="text-sm font-semibold text-primary-900">台灣店家分布</h2>
        <span className="text-sm text-earth-500">目前正式使用 {stores.length} 間</span>
      </div>
      {process.env.VERCEL_ENV !== "production" && <p className="border-b border-earth-200 bg-earth-50 px-4 py-2 text-sm text-earth-600">上方沿用官網正式統計；下方為預覽資料庫的店家分布。</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {regions.map(region => <details key={region.county} className="border-b border-earth-100">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm marker:content-none hover:bg-primary-50">
            <span className="font-medium text-earth-900">{region.county}</span>
            <span className={region.count ? "font-semibold text-primary-700" : "text-earth-400"}>{region.count} 家 <span aria-hidden="true">⌄</span></span>
          </summary>
          <div className="border-t border-earth-100 bg-earth-50 px-4 py-2 text-sm">
            {region.districts.length ? region.districts.map(item => <div key={item.district} className="py-1">
              <div className="flex justify-between gap-2 font-medium text-earth-600"><span>{item.district}</span><span>{item.stores.length} 家</span></div>
              {item.stores.map(store => <Link key={store.id} href={`/hq/dashboard/stores/${store.id}`} className="flex min-h-11 items-center break-words text-primary-700 hover:underline">{store.name}</Link>)}
            </div>) : <p className="py-2 text-earth-500">尚無正式使用店家</p>}
          </div>
        </details>)}
      </div>
    </section>
  </PageShell>;
}
