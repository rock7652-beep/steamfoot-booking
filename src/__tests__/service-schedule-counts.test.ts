import {expect,it} from 'vitest';
import {serviceScheduleTotals} from '@/lib/service-schedule-counts';
it('counts a shared booking once, each person once, and rentals separately',()=>{
 const row={id:'a',service:{groupId:'group',status:'RESERVED'},bookings:[{status:'RESERVED'}]};
 expect(serviceScheduleTotals([row,{...row,id:'b'}, {...row,id:'c',service:{groupId:'cancelled',status:'CANCELLED'}},{id:'rent',rentalId:'r',previewKind:'RENTAL',bookings:[]}])).toEqual({groups:1,people:2,rentals:1});
});
it('retains completed and no-show people, and respects an assigned-manager display filter',()=>{
 expect(serviceScheduleTotals([{id:'a',service:{status:'COMPLETED'},bookings:[{status:'ATTENDED'},{status:'CANCELLED'}]},{id:'b',service:{status:'NO_SHOW'},bookings:[{status:'NO_SHOW'}]},{id:'filtered',service:{groupId:'g',status:'RESERVED'},bookings:[{status:'RESERVED'},{status:'RESERVED'}],displayBookings:[{status:'RESERVED'}]}])).toEqual({groups:3,people:3,rentals:0});
});
