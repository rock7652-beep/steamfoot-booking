import { loadCustomerLabels } from "@/server/actions/customer-labels";
import { EMPTY_LABELS, type LabelSnapshot } from "@/lib/customer-labels";
import { AppError } from "@/lib/errors";

/** Labels travel with the authorized month DTO, before any day roster mounts. */
export async function loadBookingRosterLabels(days: Array<{bookings:Array<{customer?:{id?:string}}>}>,storeId:string|null):Promise<LabelSnapshot> {
  if(!storeId)return EMPTY_LABELS;
  const ids=[...new Set(days.flatMap(day=>day.bookings.flatMap(booking=>booking.customer?.id?[booking.customer.id]:[])))];
  try {
    const batches=await Promise.all(Array.from({length:Math.max(1,Math.ceil(ids.length/500))},(_,i)=>loadCustomerLabels(ids.slice(i*500,(i+1)*500),storeId)));
    return {...batches[0],assignments:Object.assign({},...batches.map(batch=>batch.assignments))};
  } catch(error) {
    // A role lacking customer.read may still have booking.read. Do not expose labels.
    if(error instanceof AppError&&(error.code==="FORBIDDEN"||error.code==="UNAUTHORIZED"))return EMPTY_LABELS;
    throw error;
  }
}
