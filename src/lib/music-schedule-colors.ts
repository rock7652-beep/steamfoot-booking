type Card={isTrial?:boolean;isFixed?:boolean;isBiweekly?:boolean;previewKind?:string;previewFaded?:string;rescheduledFromStartsAt?:string|null;rescheduleKind?:string|null};
export function musicScheduleColors(card:Card){
 if(card.previewKind==="RENTAL")return {fill:"border-pink-300 bg-pink-100 text-pink-950",dot:"bg-pink-500"};
 if(card.isTrial)return {fill:"border-orange-300 bg-orange-100 text-orange-950",dot:"bg-orange-500"};
 if(card.isFixed&&!(card.rescheduledFromStartsAt&&card.rescheduleKind==="SINGLE"&&!card.previewFaded))return card.isBiweekly?{fill:"border-violet-300 bg-violet-100 text-violet-950",dot:"bg-violet-600"}:{fill:"border-blue-300 bg-blue-100 text-blue-950",dot:"bg-blue-600"};
 return {fill:"border-emerald-300 bg-emerald-100 text-emerald-950",dot:"bg-emerald-600"};
}
