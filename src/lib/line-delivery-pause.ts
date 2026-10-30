/** Owner-approved cutover. Missing/invalid timing remains paused; no toggle is overwritten. */
export function lineDeliveryResumeAt(env:Record<string,string|undefined>=process.env):Date|null {
 const value=env.LINE_DELIVERY_RESUME_AT;
 if(!value)return null;
 const date=new Date(value);
 return Number.isFinite(date.getTime())&&date.toISOString()===value?date:null;
}
export function isSystemLineDeliveryPaused(): boolean {
 const at=lineDeliveryResumeAt();
 return !at||Date.now()<at.getTime();
}
/** All asynchronous sends supply the original event time, never their retry time. */
export function isLineDeliveryEventCurrent(createdAt?:Date|number|string):boolean {
 const at=lineDeliveryResumeAt();
 if(!at)return true; // The pause above remains closed; also keeps isolated unit transports usable.
 if(createdAt===undefined)return false;
 const time=new Date(createdAt).getTime();
 return Number.isFinite(time)&&time>=at.getTime()&&time<=Date.now()+60_000;
}
