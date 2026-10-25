import {expect,it,vi} from 'vitest';
import {readBeautyChargeCosts,readBeautyServiceCost} from '@/server/beauty/charge-finance';
it('reads only scoped requested configurations and uses the highest immutable revision',async()=>{const findMany=vi.fn().mockResolvedValue([{body:JSON.stringify({id:'p',kind:'plan',revision:1,storeCost:100})},{body:JSON.stringify({id:'p',kind:'plan',revision:3,storeCost:300})},{body:JSON.stringify({id:'foreign',kind:'plan',revision:99,storeCost:999})},{body:'malformed'}]);const result=await readBeautyChargeCosts({beautyEvent:{findMany}} as never,'store',[{id:'p',kind:'plan'},{id:'missing',kind:'single'}]);expect(result.get('plan:p')).toBe(300);expect(result.get('single:missing')).toBeNull();expect(result.has('plan:foreign')).toBe(false);expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'store',kind:'CHARGE_SETTING',status:'AUDIT'})}));});
it('keeps the service booking cost frozen and does not fall back to current catalog settings',async()=>{const findFirst=vi.fn().mockResolvedValue({body:JSON.stringify({storeCost:300})}),tx={beautyEvent:{findFirst}};expect(await readBeautyServiceCost(tx as never,'store','booking')).toBe(300);expect(findFirst).toHaveBeenCalledWith({where:{storeId:'store',appointmentId:'booking',status:'AUDIT',kind:'SERVICE_FINANCE_RULE'},select:{body:true},orderBy:[{createdAt:'asc'},{id:'asc'}]});findFirst.mockResolvedValue(null);expect(await readBeautyServiceCost(tx as never,'store','old-booking')).toBeNull();});

it('reads trial overrides from the latest revision, preserving zero and clearing an old override',async()=>{
 const {readBeautyChargeFinance}=await import('@/server/beauty/charge-finance');
 const findMany=vi.fn().mockResolvedValue([
  {body:JSON.stringify({id:'s',kind:'single',revision:1,storeCost:300,trialStoreCost:150})},
  {body:JSON.stringify({id:'s',kind:'single',revision:2,storeCost:400,trialStoreCost:0})},
 ]);
 expect((await readBeautyChargeFinance({beautyEvent:{findMany}} as never,'store',[{id:'s',kind:'single'}])).get('single:s')).toEqual({storeCost:400,trialStoreCost:0});
 findMany.mockResolvedValue([{body:JSON.stringify({id:'s',kind:'single',revision:3,storeCost:400,trialStoreCost:null})},{body:JSON.stringify({id:'s',kind:'single',revision:2,storeCost:300,trialStoreCost:150})}]);
 expect((await readBeautyChargeFinance({beautyEvent:{findMany}} as never,'store',[{id:'s',kind:'single'}])).get('single:s')).toEqual({storeCost:400,trialStoreCost:null});
});
