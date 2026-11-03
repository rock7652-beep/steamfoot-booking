/** Service-mode palette shares the native calendar; course/music palettes stay intact. */
export function serviceCalendarPresentation(trial=false,rental=false,completed=false){
 if(rental)return {label:'空間租借',dot:'bg-pink-500',card:'border-pink-300 bg-pink-50 hover:bg-pink-100'};
 if(trial)return {label:'體驗',dot:'bg-orange-500',card:completed?'border-orange-200 bg-orange-50/60':'border-orange-300 bg-orange-100 hover:bg-orange-200/70'};
 return {label:'一般服務',dot:'bg-emerald-600',card:completed?'border-emerald-200 bg-emerald-50/60':'border-emerald-300 bg-emerald-100 hover:bg-emerald-200/70'};
}
