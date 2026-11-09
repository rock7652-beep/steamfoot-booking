import {expect,it} from 'vitest';
import type {AddOnGroup} from '@/lib/add-ons';
import {beautyServiceGoodsGroups,validateBeautyGoodsServices} from '@/lib/beauty/shared-goods';
const group=(id:string,subjectIds?:string[]):AddOnGroup=>({id,title:id,kind:'SHARED_GOODS',required:false,multiple:true,subjectIds,options:[]});
it('never treats an unassigned product group as global and unions party services once',()=>{
 const a=group('a',['massage']),b=group('b',['face']),both=group('both',['massage','face']);
 const groups=[a,b,both,group('unassigned'),{...a,id:'service',kind:'PERSON' as const}];
 expect(beautyServiceGoodsGroups(groups,[])).toEqual([]);
 expect(beautyServiceGoodsGroups(groups,['massage'])).toEqual([a,both]);
 expect(beautyServiceGoodsGroups(groups,['massage','face','massage'])).toEqual([a,b,both]);
});
it('rejects foreign services and new inactive bindings while preserving existing inactive bindings',()=>{
 const old=group('a',['retired']),services=[{id:'active',active:true},{id:'retired',active:false}];
 expect(()=>validateBeautyGoodsServices([group('a',['foreign'])],[old],services)).toThrow('不屬於本店');
 expect(()=>validateBeautyGoodsServices([group('new',['retired'])],[old],services)).toThrow('已停用');
 expect(()=>validateBeautyGoodsServices([old,group('new',['active'])],[old],services)).not.toThrow();
});
it('drops only incompatible cart selections and preserves quantities still applicable to another party member',async()=>{
 const {retainBeautyGoodsSelections}=await import('@/components/beauty/booking-shared-goods');
 const product=(id:string)=>({id,name:id,active:true,price:10,duration:0});
 const catalog={revision:1,groups:[{...group('a',['massage']),options:[product('tea')]},{...group('b',['face']),options:[product('water')]}]};
 const selections=[{id:'tea',quantity:2},{id:'water',quantity:3}];
 expect(retainBeautyGoodsSelections(catalog,selections,['face'])).toEqual([{id:'water',quantity:3}]);
 expect(retainBeautyGoodsSelections(catalog,selections,['massage','face'])).toBe(selections);
});
