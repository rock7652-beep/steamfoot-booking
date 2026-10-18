/** Ledger rows are positive magnitudes. Reversals must balance per booking AND card. */
export function hasEffectiveCourseDebit(entries: {bookingId:string|null;cardId:string;kind:string;points:number}[]) {
  const balances=new Map<string,number>();
  for(const entry of entries){
    let delta=0;
    if(/^DEBIT(?::|$)/.test(entry.kind))delta=entry.points;
    else if(/^CORRECT:/.test(entry.kind)){
      const [,from,to]=entry.kind.split(":");
      if(!["RESERVED","ATTENDED","NO_SHOW","CANCELLED"].includes(from)||!["RESERVED","ATTENDED","NO_SHOW","CANCELLED"].includes(to))return true;
      delta=(Number(["ATTENDED","NO_SHOW"].includes(to))-Number(["ATTENDED","NO_SHOW"].includes(from)))*entry.points;
    }else if(!/^(RESERVE|RELEASE)(?::|$)/.test(entry.kind))return true;
    const key=JSON.stringify([entry.bookingId,entry.cardId]);
    balances.set(key,(balances.get(key)??0)+delta);
  }
  return [...balances.values()].some(balance=>balance!==0);
}
