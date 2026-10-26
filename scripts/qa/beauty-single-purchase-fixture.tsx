// Real purchase, reservation and collection components; synthetic transports only.
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {BeautyNativeCustomerWorkspace} from '../../src/components/beauty/native-customer-source';
import {toLocalDateStr} from '../../src/lib/date-utils';
import type {BeautyDashboardData} from '../../src/server/beauty/queries';
const service={id:'service',storeId:'synthetic',name:'按摩服務',category:'按摩',duration:60,trialDuration:30,buffer:15,price:1100,trialPrice:750,active:true,revision:1};
const data={storeId:'synthetic',date:toLocalDateStr(),now:Date.now(),policy:{revision:1},services:[service],plans:[{id:'plan',storeId:'synthetic',name:'按摩五次方案',sessions:5,price:5000,validDays:90,active:true,customerPurchasable:true,allowShared:false,serviceIds:['service'],revision:1,lowBalanceEnabled:false,lowBalanceThreshold:null}],planSaleCosts:{plan:1000},cards:[],assignmentStaff:[],techs:[{id:'tech',name:'合成技師',active:true,serviceIds:['service']}],locations:[{id:'room',name:'合成床位',isActive:true,capacity:1}],customers:[{id:'customer',name:'合成顧客',phone:'0900000001',lineName:null,_count:{sponsoredCustomers:0}}],access:{financeAccess:true,planAccess:true,customerAccess:true,writeAccess:true},manage:{card:true,collect:true,discount:true,members:true},customerHealthEnabled:false} as unknown as BeautyDashboardData;
const receipts=new Map<string,number>([['existing',1100]]);
window.qaCalls=[];
window.qaAction=async(name,...args)=>{
 window.qaCalls.push({name,args});
 if(name==='readBeautySlots')return {success:true,data:{slots:['09:00'],arrangement:[{technicianId:'tech',technicianName:'合成技師',locationId:'room',locationName:'合成床位'}]}};
 if(name==='bookBeautyParty'){const input=args[1] as {people:{isTrial:boolean;cardId:string|null;customerId:string}[]};if(input.people.length!==1||input.people[0].cardId||input.people[0].customerId!=='customer')throw Error('Unexpected booking identity');const id='new-service';receipts.set(id,input.people[0].isTrial?750:1100);return {success:true,data:{groupId:'group',ids:[id]}};}
 if(name==='readBeautyCollection')return {success:true,data:(args[0] as string[]).map(id=>{const price=receipts.get(id);if(price===undefined)throw Error('Wrong receipt');return {id,revision:1,personName:'合成顧客',serviceName:'按摩服務',price,discount:{kind:'AMOUNT',value:0},reduction:0,netPrice:price,collected:0,due:price};})};
 if(name==='collectBeautyPayment')return {success:true};
 throw Error('Unexpected synthetic action: '+name);
};
createRoot(document.getElementById('root')!).render(<OperationScope scope="qa:beauty:single-purchase"><main className="min-w-0 p-3"><BeautyNativeCustomerWorkspace data={data} customerId="customer" initialAction="assign" panelOnly/></main></OperationScope>);
