import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({audit:vi.fn(),service:vi.fn(),defaults:vi.fn(),count:vi.fn(),save:vi.fn(),technician:vi.fn(),inheritors:vi.fn(),appointments:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({audit:m.audit}));
import {persistBeautyCatalog} from '@/server/beauty/catalog';
const a={storeId:'a',userId:'owner',manager:true};
const service={id:'s',revision:2,name:'保養',price:1000,trialPrice:null,duration:60,buffer:0,active:true,defaultRate:{mode:'FIXED',value:300}};
const tx={beautyService:{findFirst:m.service,findMany:m.defaults,count:m.count,update:m.save},beautyTechnician:{findFirst:m.technician,findMany:m.inheritors,update:m.save},beautyAppointment:{findMany:m.appointments}};
beforeEach(()=>{vi.clearAllMocks();m.service.mockResolvedValue(service);m.defaults.mockResolvedValue([{id:'s',defaultRate:service.defaultRate}]);m.count.mockResolvedValue(1);m.technician.mockResolvedValue({id:'t'});m.inheritors.mockResolvedValue([{rates:{}}]);m.appointments.mockResolvedValue([]);m.save.mockResolvedValue({id:'saved'});});
it('validates inherited rates against authoritative same-store service defaults',async()=>{
 await persistBeautyCatalog(tx as never,a,'technician',{id:'t',revision:1,name:'技師',gender:'FEMALE',serviceIds:['s'],rates:{}});
 expect(m.defaults).toHaveBeenCalledWith({where:{storeId:'a',id:{in:['s']}},select:{id:true,defaultRate:true}});expect(m.save).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({rates:{}})}));
 m.save.mockClear();m.defaults.mockResolvedValue([]);await expect(persistBeautyCatalog(tx as never,a,'technician',{id:'t',revision:1,name:'技師',gender:'FEMALE',serviceIds:['s'],rates:{}})).rejects.toThrow('每項可服務項目');expect(m.save).not.toHaveBeenCalled();
});
it('blocks default removal while qualified technicians still inherit, then permits it after individual overrides exist',async()=>{
 await expect(persistBeautyCatalog(tx as never,a,'service',{...service,defaultRate:null})).rejects.toThrow('仍有技師沿用');expect(m.save).not.toHaveBeenCalled();
 m.inheritors.mockResolvedValue([{rates:{s:{mode:'FIXED',value:400}}}]);await persistBeautyCatalog(tx as never,a,'service',{...service,defaultRate:null});expect(m.save).toHaveBeenCalledOnce();
});
it('preserves defaults on legacy partial edits that omit the field',async()=>{
 const {defaultRate,...input}=service;expect(defaultRate).toBeDefined();await persistBeautyCatalog(tx as never,a,'service',input);expect(m.save.mock.calls[0][0].data).not.toHaveProperty('defaultRate');expect(m.inheritors).not.toHaveBeenCalled();
});
