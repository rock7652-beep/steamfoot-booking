import {describe,it,expect} from 'vitest';
import {resolveAddOns,addOnTotals,bookingAddOnGroups} from '@/lib/beauty/add-ons';
import {baseServiceCollected} from '@/lib/beauty/add-on-finance';
const option=(id:string,price=0,duration=0)=>({id,name:id,price,duration,active:true});
const group=(required=false,multiple=true)=>[{id:'extras',title:'額外加做',required,multiple,options:[option('tea',80),option('head',300,20),option('free')]}];
describe('附加項目',()=>{
 it('允許不選、免費及零分鐘，每項固定一份',()=>{
  expect(resolveAddOns(group(),[])).toEqual([]);
  const items=resolveAddOns(group(),['tea','head','free']);
  expect(items.every(i=>i.quantity===1)).toBe(true);
  expect(addOnTotals(items)).toEqual({price:380,duration:20});
 });
 it('必選與單選在伺服器計算時檢查',()=>{
  expect(()=>resolveAddOns(group(true),[])).toThrow('請選擇');
  expect(()=>resolveAddOns(group(false,false),['tea','head'])).toThrow('最多');
 });
 it('拒絕重複、跨服務及停用項目',()=>{
  expect(()=>resolveAddOns(group(),['tea','tea'])).toThrow('重複');
  expect(()=>resolveAddOns(group(),['unknown'])).toThrow('不適用');
  const groups=group();groups[0].options[0].active=false;
  expect(()=>resolveAddOns(groups,['tea'])).toThrow('停用');
 });
 it('價格來自目錄、快照不受後續改價影響',()=>{
  const groups=group(),saved=resolveAddOns(groups,['tea']);groups[0].options[0].price=200;
  expect(saved[0].price).toBe(80);
 });
 it('附加收款不擴大主服務抽成，無附加項目維持既有行為',()=>{
  expect(baseServiceCollected(900,1200,resolveAddOns(group(),['head']))).toBe(900);
  expect(baseServiceCollected(900,600,resolveAddOns(group(),['head']))).toBe(600);
  expect(baseServiceCollected(900,1000,[])).toBe(1000);
 });
});

it('retains booked prices and retired selections while allowing their removal',()=>{
 const saved=resolveAddOns(group(),['tea']);
 const catalog=group();catalog[0].options[0].active=false;catalog[0].options[0].price=200;
 const editable=bookingAddOnGroups(catalog,saved);
 expect(resolveAddOns(editable,['tea'])[0].price).toBe(80);
 expect(resolveAddOns(editable,[])).toEqual([]);
 expect(bookingAddOnGroups([],saved)[0].options[0].price).toBe(80);
});
