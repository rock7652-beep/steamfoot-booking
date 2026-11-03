import {expect,it} from 'vitest';
import {validateBeautyCharge,assertChargePersistence} from '@/lib/beauty/charge-editor';
import {beautyOpeningSteps} from '@/lib/beauty/opening-guide';
const services=[{id:'s',name:'按摩',active:true,duration:60,buffer:15}];
const technicians=[{id:'t',name:'雅婷',active:true,serviceIds:['s']}];
const single={expectedStoreId:'store',kind:'single',serviceId:'s',name:'按摩',price:1000,sessions:1,trialPrice:null,trialMinutes:null,technicianIds:['t']};
it('retains zero trial and inherits duration without changing buffer',()=>{expect(validateBeautyCharge({...single,trialPrice:0},'store',services,technicians)).toMatchObject({amount:1000,buffer:15,trial:{price:0,duration:60}});expect(validateBeautyCharge({...single,trialPrice:500,trialMinutes:45},'store',services,technicians).trial).toEqual({price:500,duration:45});expect(validateBeautyCharge(single,'store',services,technicians).trial).toBeNull();});
it('never multiplies plan price or accepts trial fields in a plan',()=>{const plan={expectedStoreId:'store',kind:'plan',serviceId:'s',name:'5次',price:4500,sessions:5,validDays:90,allowShared:false,technicianIds:['t']};expect(validateBeautyCharge(plan,'store',services,technicians)).toMatchObject({amount:4500,trial:null});expect(()=>validateBeautyCharge({...plan,trialPrice:100},'store',services,technicians)).toThrow();});
it('rejects other stores, unqualified/inactive/duplicate technicians and stale services',()=>{expect(()=>validateBeautyCharge(single,'other',services,technicians)).toThrow('門市');for(const techs of [[],[{...technicians[0],active:false}],[{...technicians[0],serviceIds:[]}]])expect(()=>validateBeautyCharge(single,'store',services,techs)).toThrow();expect(()=>validateBeautyCharge({...single,technicianIds:['t','t']},'store',services,technicians)).toThrow();expect(()=>validateBeautyCharge(single,'store',[{...services[0],active:false}],technicians)).toThrow();});
it('blocks unavailable persistence instead of changing shared qualifications',()=>{expect(()=>assertChargePersistence({perChargeTechnicians:false})).toThrow('未儲存');});
it('orders eight opening steps and never equates data existence with verified readiness',()=>{const steps=beautyOpeningSteps({services,technicians,locations:[{isActive:true}],plans:[],canReadPlans:true,canReadTechnicians:true});expect(steps.map(s=>s.id)).toEqual(['store','hours','locations','services','technicians','charges','staff','review']);expect(steps.at(-1)?.status).toBe('review');expect(steps.find(s=>s.id==='technicians')?.status).toBe('present');expect(beautyOpeningSteps({services,technicians:[],locations:[],plans:[],canReadPlans:false,canReadTechnicians:false})[4].status).toBe('review');});

it('validates explicit trial costs and retains zero or inherited fees without changing plan rules',()=>{
 expect(validateBeautyCharge({...single,storeCost:300,trialPrice:750,trialStoreCost:0},'store',services,technicians).draft).toMatchObject({trialStoreCost:0,storeCost:300});
 expect(validateBeautyCharge({...single,storeCost:300,trialPrice:750,trialStoreCost:null},'store',services,technicians).draft).toMatchObject({trialStoreCost:null});
 expect(()=>validateBeautyCharge({...single,trialPrice:750,trialStoreCost:751},'store',services,technicians)).toThrow('體驗店家費用不可超過體驗價格');
 expect(()=>validateBeautyCharge({...single,trialStoreCost:100},'store',services,technicians)).toThrow('請先設定體驗價格');
 expect(()=>validateBeautyCharge({...single,trialPrice:750,trialStoreCost:-1},'store',services,technicians)).toThrow();
 expect(()=>validateBeautyCharge({expectedStoreId:'store',kind:'plan',serviceId:'s',name:'五次',price:4500,sessions:5,validDays:90,allowShared:false,technicianIds:['t'],trialStoreCost:0},'store',services,technicians)).toThrow();
});
