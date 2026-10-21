"use client";
export function CustomerPanelTabs({items,value,onSelect,ariaLabel="顧客詳細資料分區",disabled=false}:{ariaLabel?:string;disabled?:boolean;items:{id:string;label:string}[];value:string;onSelect:(id:string)=>void}){
 return <nav aria-label={ariaLabel} className="flex shrink-0 flex-wrap gap-1 border-b border-earth-200 bg-earth-50 px-4 py-2">{items.map(item=><button key={item.id} type="button" disabled={disabled} aria-pressed={value===item.id} className={`min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary-600 ${value===item.id?'bg-primary-50 font-semibold text-primary-800':'text-earth-600 hover:bg-primary-50'}`} onClick={()=>onSelect(item.id)}>{item.label}</button>)}</nav>;
}
