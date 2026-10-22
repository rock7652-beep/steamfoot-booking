type Card={closedAt:string|null;expiresAt:string;remaining:number;held:number};
type Plan={lowBalanceEnabled?:boolean;lowBalanceThreshold?:number|null};
export function beautyCareCardMatches(card:Card,plan:Plan|undefined,now:number,kind:'low'|'expiring'){
 const expiry=Date.parse(card.expiresAt);
 if(card.closedAt||expiry<=now)return false;
 if(kind==='expiring')return card.remaining>0&&expiry<=now+14*86400000;
 return !!plan?.lowBalanceEnabled&&Math.max(0,card.remaining-card.held)<=(plan.lowBalanceThreshold??0);
}
