import type {ItemBalance} from '@/lib/item-entitlement';

export function ItemBalanceSummary({balance}:{balance?: (ItemBalance&{byUnit?:ItemBalance[]})|null}){
 if(!balance)return <div><strong className="block">無適用方案</strong><span className="block text-sm text-amber-800">需繳費／購買方案</span></div>;
 const units=balance.byUnit??[balance];
 return <div className="space-y-1">{units.map(row=><div key={row.unit}><strong className="block">{row.remaining} {row.unit==='POINT'?'點':'堂'}</strong><span className="block text-sm text-earth-600">可用 {row.available} {row.unit==='POINT'?'點':'堂'}</span></div>)}{units.every(row=>row.available<row.cost)&&<span className="block text-sm text-amber-800">需繳費／購買方案</span>}</div>;
}
