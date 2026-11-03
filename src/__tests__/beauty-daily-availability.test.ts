import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),allocate:vi.fn(),trial:vi.fn(),rooms:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.rooms}}));
vi.mock('@/server/beauty/booking',()=>({loadAvailability:m.load,findAllocation:m.allocate}));
vi.mock('@/server/beauty/trial-eligibility',()=>({assertBeautyTrialEligibility:m.trial}));
import {beautySlotsForActor} from '@/server/beauty/availability';
import {AppError} from '@/lib/errors';
const intent={requestKey:'00000000-0000-4000-8000-000000000001',date:'2099-01-01',time:'11:00',contactName:'測試',phone:'0900000000',policyRevision:0,isTrial:false,people:[{customerId:'customer',name:'測試',phone:'0900000000',pendingIdentity:false,serviceId:'service',serviceRevision:0,preference:'ANY',specifiedTechnicianId:null,specifiedLocationId:null,cardId:null,notes:''}]};
beforeEach(()=>{vi.resetAllMocks();m.load.mockResolvedValue({slots:['08:00','09:00','10:00','11:00','12:00','13:00','14:00'],memberSlots:['08:00','09:00','10:00','11:00','12:00','13:00','14:00'],technicians:[{id:'t',name:'技師'}]});m.rooms.mockResolvedValue([{id:'r',name:'位置'}]);m.allocate.mockResolvedValue({result:[{technicianId:'t',locationId:'r'}]});});
it('validates only the selected time for a manager and returns its authorized arrangement',async()=>{
 const result=await beautySlotsForActor('manager',intent,{storeId:'store',userId:'actor',manager:true});
 expect(m.load).toHaveBeenCalledOnce();expect(m.allocate).toHaveBeenCalledOnce();expect(m.allocate.mock.calls[0][2]).toEqual(intent);
 expect(result).toEqual({slots:['11:00'],arrangement:[{technicianId:'t',technicianName:'技師',locationId:'r',locationName:'位置'}]});
});
it('validates the three nearest alternatives only after a selected-time conflict',async()=>{
 m.allocate.mockImplementation(async(_tx,_actor,d)=>{if(d.time==='11:00')throw new AppError('CONFLICT','已被預約');return {result:[{technicianId:'t',locationId:'r'}]};});
 const result=await beautySlotsForActor('manager',intent,{storeId:'store',userId:'actor',manager:true});
 expect(m.allocate).toHaveBeenCalledTimes(4);expect(result).toEqual({slots:['09:00','10:00','12:00'],arrangement:null,arrangementError:'已被預約'});expect(m.rooms).not.toHaveBeenCalled();
});
it('does not turn an unexpected database error into available alternatives',async()=>{
 m.allocate.mockRejectedValue(Error('database disconnected'));await expect(beautySlotsForActor('manager',intent,{storeId:'store',manager:true,userId:'actor'})).rejects.toThrow('database disconnected');expect(m.allocate).toHaveBeenCalledOnce();
});
it('retains the complete public trial catalog and never exposes resource names',async()=>{
 const result=await beautySlotsForActor('public',{...intent,isTrial:true},{storeId:'store',userId:null});expect(m.allocate).toHaveBeenCalledTimes(7);expect(result).toEqual({slots:['08:00','09:00','10:00','11:00','12:00','13:00','14:00']});expect(m.rooms).not.toHaveBeenCalled();expect(m.trial).toHaveBeenCalled();
});
