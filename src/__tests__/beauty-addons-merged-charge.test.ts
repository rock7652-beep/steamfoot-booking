import {expect,it,vi} from 'vitest';
vi.mock('@/server/beauty/transaction-revisions',()=>({beautyPaymentVisibility:async()=>({})}));
import {serviceCharges} from '@/server/beauty/service-charges';
import type {Tx} from '@/server/beauty/booking';
const item={id:'appointment',revision:1,personName:'test',serviceName:'service',price:1000,addOnItems:[{id:'addon',groupId:'group',groupTitle:'加做',quantity:1,name:'加做',price:200,duration:15}]};
function tx(body:string|null){return {beautyEvent:{findMany:async()=>body?[{appointmentId:item.id,body}]:[]}} as unknown as Tx;}
it('charges only add-ons when a plan covers the base service and retains receipts',async()=>{
 const [r]=await serviceCharges(tx(null),'store',[{...item,cardId:'card'}],[{appointmentId:item.id,amount:80}]);
 expect(r).toMatchObject({basePrice:1000,baseCovered:true,price:200,netPrice:200,collected:80,due:120});
});
it('applies the validated discount to the base plus add-ons without rewriting list price',async()=>{
 const [r]=await serviceCharges(tx(JSON.stringify({kind:'AMOUNT',value:100,price:1200})),'store',[item],[]);
 expect(r).toMatchObject({basePrice:1000,baseCovered:false,price:1200,netPrice:1100,due:1100});
});
it('rejects a discount snapshot for a different chargeable total',async()=>{
 await expect(serviceCharges(tx(JSON.stringify({kind:'AMOUNT',value:100,price:1000})),'store',[item],[])).rejects.toThrow('優惠紀錄待核對');
});
