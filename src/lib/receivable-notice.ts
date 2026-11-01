/** A quote is not a debt once the module has accepted a final negotiated receipt. */
export function outstandingAmount(agreed: number, received: number) {
 if(!Number.isSafeInteger(agreed)||!Number.isSafeInteger(received)||agreed<0||received<0)throw new Error('應收款資料待核對');
 return Math.max(0,agreed-received);
}
export const SILENT_STORE_NOTICE_KINDS = ['COMPLETE','NO_SHOW','RESTORE'] as const;
export function producesStoreNotice(kind:string){return !SILENT_STORE_NOTICE_KINDS.some(s=>s===kind);}
