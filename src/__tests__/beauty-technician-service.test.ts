import {expect,it,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),command:vi.fn(),audit:vi.fn(),find:vi.fn(),update:vi.fn(),raw:vi.fn(),permission:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction,command:m.command,audit:m.audit}));
import {saveBeautyTechnicianService} from '@/server/actions/beauty-technician-service';
import {assertTechnicianCanComplete,readTechnicianServices} from '@/server/beauty/technician-service';
const booking={id:'booking',storeId:'store',revision:3,technicianId:'tech',status:'RESERVED'};
const tx={beautyAppointment:{findFirst:m.find,update:m.update},$queryRaw:m.raw};
const input={id:'booking',revision:3,technicianId:'tech',expectedStoreId:'store',requestKey:'00000000-0000-4000-8000-000000000001',status:'LEAVE',note:'技師備註',reason:'臨時請假'};
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue(undefined);m.manager.mockResolvedValue({storeId:'store',userId:'staff',manager:true});m.find.mockResolvedValue(booking);m.transaction.mockImplementation((_a,work)=>work(tx));m.command.mockImplementation((_tx,_a,_key,_intent,work)=>work());m.raw.mockResolvedValue([]);});
it('saves technician metadata under the original command and store transaction, preserving the reservation and finances',async()=>{
 expect(await saveBeautyTechnicianService(input)).toMatchObject({success:true,data:{id:'booking',revision:4,status:'LEAVE'}});
 expect(m.manager).toHaveBeenCalledWith('booking.update',true);expect(m.audit).toHaveBeenCalledWith(tx,expect.anything(),'TECHNICIAN_SERVICE',expect.stringContaining('臨時請假'),'booking');
 expect(m.update).toHaveBeenCalledExactlyOnceWith({where:{id:'booking'},data:{revision:{increment:1}}});expect(m.command).toHaveBeenCalledOnce();
});
it.each([{...booking,revision:4},{...booking,technicianId:'replacement'},{...booking,status:'COMPLETED'}])('rejects changed/completed assignments before writing: %j',async current=>{m.find.mockResolvedValue(current);expect(await saveBeautyTechnicianService(input)).toMatchObject({success:false});expect(m.audit).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();});
it('rejects cross-store and missing absence reasons',async()=>{expect(await saveBeautyTechnicianService({...input,expectedStoreId:'foreign'})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();expect(await saveBeautyTechnicianService({...input,reason:''})).toMatchObject({success:false});expect(m.audit).not.toHaveBeenCalled();});
it.each(['LEAVE','NO_SHOW'])('blocks completion or a deduction while the assigned technician is %s',async status=>{m.raw.mockResolvedValue([{appointmentId:'booking',kind:'TECHNICIAN_SERVICE',body:JSON.stringify({technicianId:'tech',status,note:'',reason:'原因'})}]);await expect(assertTechnicianCanComplete(tx,'store',booking)).rejects.toThrow('尚未扣次或計酬');});
it('allows an actual reassigned technician and an explicit restored status',async()=>{m.raw.mockResolvedValue([{appointmentId:'booking',kind:'TECHNICIAN_SERVICE',body:JSON.stringify({technicianId:'old-tech',status:'LEAVE',note:'',reason:'原因'})}]);await expect(assertTechnicianCanComplete(tx,'store',booking)).resolves.toBeUndefined();m.raw.mockResolvedValue([{appointmentId:'booking',kind:'TECHNICIAN_SERVICE',body:JSON.stringify({technicianId:'tech',status:'SCHEDULED',note:'',reason:''})}]);await expect(assertTechnicianCanComplete(tx,'store',booking)).resolves.toBeUndefined();});
it('fails closed on damaged technician metadata and scopes the exact read',async()=>{m.raw.mockResolvedValue([{appointmentId:'booking',kind:'TECHNICIAN_SERVICE',body:'invalid'}]);await expect(readTechnicianServices(tx,'store',['booking'])).rejects.toThrow('待核對');expect(m.raw.mock.calls[0].slice(1)).toEqual(['store',['booking']]);});

it("requires staff management permission before entering the mutation transaction",async()=>{m.permission.mockRejectedValueOnce(new Error("Forbidden"));expect(await saveBeautyTechnicianService(input)).toMatchObject({success:false});expect(m.permission).toHaveBeenCalledWith("staff.manage");expect(m.transaction).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();});
