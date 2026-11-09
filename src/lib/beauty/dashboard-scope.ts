/** Calendar coordinates are client state, not a new financial workspace. */
export function beautyDashboardScope(storeId:string,tab:string,q:Record<string,string|undefined>) {
 return JSON.stringify([storeId,tab,q.customerId,q.action,q.preset,q.startDate,q.endDate]);
}
