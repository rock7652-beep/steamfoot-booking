import {describe,it,expect} from 'vitest';
import {moduleAddOnGroups,resolveModuleAddOns} from '@/lib/add-ons';
import {resolveAddOns as beautyResolve} from '@/lib/beauty/add-ons';
const groups=[{id:'g',title:'加購',required:false,multiple:true,options:[{id:'tea',name:'養生茶',price:80,duration:0,active:true},{id:'free',name:'迎賓茶',price:0,duration:0,active:true}]}];
describe('跨模組附加項目',()=>{
 it.each(['STEAMFOOT','FITNESS','MUSIC'] as const)('%s accepts no selection and free items but rejects added duration',module=>{
  expect(resolveModuleAddOns(module,groups,[])).toEqual([]);
  expect(resolveModuleAddOns(module,groups,['free'])[0]).toMatchObject({price:0,duration:0,quantity:1});
  expect(()=>moduleAddOnGroups(module,[{...groups[0],options:[{...groups[0].options[0],duration:1}]}])).toThrow('不得增加時間');
 });
 it('keeps Beauty time-aware rules through its compatibility export',()=>{
  const g=[{...groups[0],options:[{...groups[0].options[0],duration:20}]}];
  expect(resolveModuleAddOns('BEAUTY',g,['tea'])[0].duration).toBe(20);
  expect(beautyResolve(g,['tea'])[0].duration).toBe(20);
 });
});
