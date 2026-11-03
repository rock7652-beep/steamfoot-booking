type ServiceScheduleRow={id:string;previewKind?:string;rentalId?:string;service?:{groupId?:string;status:string};bookings:{status:string;customerId?:string|null}[];displayBookings?:{status:string;customerId?:string|null}[]};
/** Identified members count once per booking; unidentified companions remain separate. */
export function serviceScheduleTotals(rows:ServiceScheduleRow[]){
 const services=rows.filter(row=>row.service&&row.service.status!=='CANCELLED');
 const participants=new Set<string>();
 for(const row of services){
  for(const [index,booking] of (row.displayBookings??row.bookings).entries()){
   if(booking.status==='CANCELLED')continue;
   participants.add(JSON.stringify(booking.customerId?[row.service!.groupId??row.id,'customer',booking.customerId]:['unidentified',row.id,index]));
  }
 }
 return {groups:new Set(services.map(row=>row.service!.groupId??row.id)).size,people:participants.size,rentals:rows.filter(row=>row.previewKind==='RENTAL'||!!row.rentalId).length};
}
