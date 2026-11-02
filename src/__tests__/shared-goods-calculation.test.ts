import {expect,it} from 'vitest';
import {addOnSnapshots,addOnTotals,resolveAddOns,resolveSharedGoods} from '@/lib/add-ons';
const groups=[{id:'g',kind:'SHARED_GOODS',title:'飲品',multiple:true,required:false,options:[{id:'tea',name:'茶',price:80,duration:0,active:true},{id:'free',name:'迎賓茶',price:0,duration:0,active:true}]}];
it('charges quantities rather than party size, and counts free units',()=>{
 const one=resolveSharedGoods(groups,[{id:'tea',quantity:1}]);expect(addOnTotals(one)).toEqual({price:80,duration:0});
 const two=resolveSharedGoods(groups,[{id:'tea',quantity:2},{id:'free',quantity:3}]);expect(addOnTotals(two)).toEqual({price:160,duration:0});expect(two.reduce((n,i)=>n+i.quantity,0)).toBe(5);
 expect(two.every(i=>i.ownership==='RESERVATION')).toBe(true);
});
it.each([0,-1,1.5,10000,NaN,Infinity])('rejects invalid quantity %s',quantity=>expect(()=>resolveSharedGoods(groups,[{id:'tea',quantity}])).toThrow());
it('rejects duplicate, inactive, foreign, duration, required shared and overflow inputs',()=>{
 expect(()=>resolveSharedGoods(groups,[{id:'tea',quantity:1},{id:'tea',quantity:1}])).toThrow('重複');
 expect(()=>resolveSharedGoods(groups,[{id:'foreign',quantity:1}])).toThrow('不適用');
 expect(()=>resolveSharedGoods([{...groups[0],required:true}],[])).toThrow();
 expect(()=>resolveSharedGoods([{...groups[0],options:[{...groups[0].options[0],duration:1}]}],[])).toThrow();
 expect(()=>resolveSharedGoods([{...groups[0],options:[{...groups[0].options[0],price:10000000}]}],[{id:'tea',quantity:2}])).toThrow('總額');
});
it('personal items still only permit one unit and cannot consume shared goods',()=>{
 expect(()=>addOnSnapshots.parse([{id:'x',name:'x',price:0,duration:0,quantity:2,groupId:'g',groupTitle:'g'}])).toThrow();
 expect(()=>resolveAddOns(groups,['tea'])).toThrow('不適用');
});
