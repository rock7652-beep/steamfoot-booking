/** Explicit form values only; a balance warning or opening a shop is not intent. */
export const RENEWAL_INTEREST_VALUES=['VIP_INTEREST','RENEWAL_INTEREST','續購需求','續購','VIP／續購方案'] as const;
export function isRenewalInterestRequest(value:unknown){return typeof value==='string'&&RENEWAL_INTEREST_VALUES.some(v=>v===value);}
