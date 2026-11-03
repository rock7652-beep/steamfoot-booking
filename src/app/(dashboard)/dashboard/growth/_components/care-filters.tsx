import { DashboardLink as Link } from "@/components/dashboard-link";
import type { CareReason } from "@/lib/customer-care-lifecycle";

/** The same classification and birthday-month controls for course and beauty. */
export function CareFilters({month,selected,counts,baseHref="/dashboard/growth",query={},reasons}:{month:string;selected:CareReason|null;counts:Partial<Record<CareReason,number>>;baseHref?:string;query?:Record<string,string>;reasons?:CareReason[]}) {
  const href=(kind?:CareReason)=>baseHref+"?"+new URLSearchParams({...query,month,...(kind?{segment:kind}:{})}).toString();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="關懷分類" className="flex flex-wrap gap-1">
        <Link aria-current={!selected ? "page" : undefined} href={href()} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-earth-600 hover:bg-earth-100 aria-[current=page]:bg-primary-100 aria-[current=page]:text-primary-900">全部</Link>
        {([['birthday','本月生日'],['inactive','好久不見'],['low','額度快用完'],['expiring','方案快到期'],['trial','體驗未購買方案']] as const).filter(([kind])=>!reasons||reasons.includes(kind)).map(([kind,label]) => <Link key={kind} aria-current={selected === kind ? "page" : undefined} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-earth-600 hover:bg-earth-100 aria-[current=page]:bg-primary-100 aria-[current=page]:text-primary-900" href={href(kind)}>{label} <span className="tabular-nums">{counts[kind] ?? 0} 位</span></Link>)}
      </nav>
      <details className="min-w-0">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-earth-600">生日月份 · {month}</summary>
        <form data-settings-panel-filter className="flex flex-wrap items-center gap-2 pb-2">{Object.entries(query).map(([name,value]) => <input key={name} type="hidden" name={name} value={value}/>)}{selected && <input type="hidden" name="segment" value={selected}/>}<input className="min-h-11 max-w-full rounded border border-earth-200 p-2 text-sm" aria-label="生日月份" type="month" name="month" defaultValue={month}/><button className="min-h-11 rounded border border-earth-200 px-3 text-sm">套用</button></form>
      </details>
    </div>
  );
}
