type SportsCalendarRow = {isFixed?:boolean;isBiweekly?:boolean;isTrial?:boolean|null;rentalId?:string;previewKind?:string};
export const sportsScheduleKinds = [
  {kind:"WEEKLY",label:"固定每週",dot:"bg-blue-500",card:"border-blue-300 bg-blue-100 text-blue-950 hover:bg-blue-200"},
  {kind:"BIWEEKLY",label:"固定隔週",dot:"bg-violet-500",card:"border-violet-300 bg-violet-100 text-violet-950 hover:bg-violet-200"},
  {kind:"SINGLE",label:"單次",dot:"bg-emerald-500",card:"border-emerald-300 bg-emerald-100 text-emerald-950 hover:bg-emerald-200"},
  {kind:"TRIAL",label:"體驗",dot:"bg-orange-500",card:"border-orange-300 bg-orange-100 text-orange-950 hover:bg-orange-200"},
  {kind:"RENTAL",label:"空間出租",dot:"bg-pink-500",card:"border-pink-300 bg-pink-100 text-pink-950 hover:bg-pink-200"},
] as const;
export function sportsCalendarPresentation(row:SportsCalendarRow){
 const kind=row.rentalId||row.previewKind==="RENTAL"?"RENTAL":row.isTrial?"TRIAL":row.isFixed?row.isBiweekly?"BIWEEKLY":"WEEKLY":"SINGLE";
 return sportsScheduleKinds.find(item=>item.kind===kind)!;
}
export function sportsCalendarMatches(row:SportsCalendarRow,filter:string){return filter==="all"||sportsCalendarPresentation(row).kind===filter;}
