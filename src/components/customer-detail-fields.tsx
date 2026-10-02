import type { ReactNode } from "react";

/** Shared read-only customer fields; only editing controls need boxes. */
export function CustomerDetailFields({items}:{items:{label:string;value:ReactNode;full?:boolean}[]}) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
    {items.map(({label,value,full})=><div key={label} className={`flex min-w-0 items-start gap-3 py-1.5 ${full?"sm:col-span-2":""}`}>
      <dt className="w-24 shrink-0 text-earth-500">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-earth-800">{value==null||value===""?<span className="text-earth-400">—</span>:value}</dd>
    </div>)}
  </dl>;
}
export function CustomerPhoneLink({phone}:{phone?:string|null}) {
  const number=phone?.trim();
  if(!number||number.startsWith("_"))return <span className="text-earth-400">—</span>;
  return <a href={`tel:${number}`} aria-label={`撥打 ${number}`} className="inline-flex min-h-11 items-center rounded px-1 tabular-nums text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-primary-600">☎ {number.replace(/^(09\d{2})(\d{3})(\d{3})$/,"$1-$2-$3")}</a>;
}
