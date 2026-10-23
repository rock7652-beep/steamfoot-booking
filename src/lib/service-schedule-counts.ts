type ServiceScheduleRow={id:string;previewKind?:string;rentalId?:string;service?:{groupId?:string;status:string};bookings:{status:string}[];displayBookings?:{status:string}[]};
/** Booking groups, participants and rentals have different meanings in a service calendar. */
export function serviceScheduleTotals(rows:ServiceScheduleRow[]){
 const services=rows.filter(row=>row.service&&row.service.status!=='CANCELLED');
 return {groups:new Set(services.map(row=>row.service!.groupId??row.id)).size,people:services.reduce((n,row)=>n+(row.displayBookings??row.bookings).filter(b=>b.status!=='CANCELLED').length,0),rentals:rows.filter(row=>row.previewKind==='RENTAL'||!!row.rentalId).length};
}
