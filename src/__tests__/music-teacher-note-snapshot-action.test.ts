import {beforeEach,expect,it,vi} from 'vitest';
import {preparedRoster} from './fixtures/prepared-roster';
const m=vi.hoisted(()=>({access:vi.fn(),write:vi.fn(),current:vi.fn(),detail:vi.fn(),music:vi.fn(),readMusic:vi.fn(),sports:vi.fn(),refresh:vi.fn(),events:[] as string[]}));
vi.mock('@/lib/auth',()=>({auth:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseSession:{updateMany:m.write,findFirst:m.current}}}));
vi.mock('next/server',()=>({after:vi.fn()}));
vi.mock('next/cache',()=>({unstable_cache:(f:unknown)=>f,revalidatePath:m.refresh}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.access,courseMember:vi.fn(),courseAccount:vi.fn(),courseTransaction:vi.fn()}));
vi.mock('@/server/services/course-booking',()=>({reserveCourse:vi.fn(),settleCourseBooking:vi.fn()}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStore:m.music,isMusicCourseStoreFromEntitlements:vi.fn()}));
vi.mock('@/server/queries/course-detail-music-store',()=>({readCourseDetailMusicStore:m.readMusic}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:m.sports}));
vi.mock('@/server/queries/authorized-course-session-detail',()=>({readAuthorizedCourseSessionDetail:m.detail}));
import {saveMusicTeacherNoteWithRoster} from '@/server/actions/course-members';
import {isReadRequestMemoActive,withReadRequestMemo} from '@/server/services/read-request-memo';
import {AppError} from '@/lib/errors';
const actor={storeId:'store-a',user:{id:'manager-a',role:'OWNER',staffId:'staff-a'}},input={sessionId:'session-a',note:'  新備註  ',expectedNote:'舊備註'};
beforeEach(()=>{
 vi.resetAllMocks();m.events.length=0;m.access.mockResolvedValue(actor);m.music.mockResolvedValue(true);m.readMusic.mockResolvedValue(true);m.sports.mockResolvedValue(false);
 m.write.mockImplementation(async()=>{expect(isReadRequestMemoActive()).toBe(false);m.events.push('commit');return {count:1};});
 m.detail.mockImplementation(async()=>{expect(isReadRequestMemoActive()).toBe(true);m.events.push('read');return {success:true,data:preparedRoster()};});
});
it('writes with CAS and only then reads the full authorized roster in a fresh read-only scope',async()=>{
 const result=await saveMusicTeacherNoteWithRoster(input);
 expect(result).toEqual({success:true,sync:{state:'ready',snapshot:{sessionId:'session-a',data:preparedRoster()}}});
 expect(m.write).toHaveBeenCalledExactlyOnceWith({where:{id:'session-a',storeId:'store-a',cancelledAt:null,teacherNote:'舊備註'},data:{teacherNote:'新備註'}});
 expect(m.access.mock.calls).toEqual([['booking.update'],['booking.read']]);expect(m.detail).toHaveBeenCalledExactlyOnceWith(actor,'session-a',true,false);expect(m.events).toEqual(['commit','read']);expect(m.refresh).not.toHaveBeenCalled();expect(isReadRequestMemoActive()).toBe(false);
});
it('does not read while commit is still pending',async()=>{
 let done!:(v:{count:number})=>void,started!:()=>void;const begin=new Promise<void>(r=>started=r);m.write.mockImplementation(()=>{started();return new Promise(r=>done=r);});
 const pending=saveMusicTeacherNoteWithRoster(input);await begin;expect(m.detail).not.toHaveBeenCalled();expect(m.access).toHaveBeenCalledOnce();done({count:1});expect(await pending).toMatchObject({success:true,sync:{state:'ready'}});
});
it('rejects an inherited read memo before any write',async()=>{
 expect(await withReadRequestMemo(()=>saveMusicTeacherNoteWithRoster(input))).toMatchObject({success:false});expect(m.access).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});
it.each(['write-permission','non-music','native-sports'])('rejects %s before writing or reading',async kind=>{
 if(kind==='write-permission')m.access.mockRejectedValue(new AppError('FORBIDDEN','denied'));if(kind==='non-music')m.music.mockResolvedValue(false);if(kind==='native-sports')m.sports.mockResolvedValue(true);
 expect(await saveMusicTeacherNoteWithRoster(input)).toMatchObject({success:false});expect(m.write).not.toHaveBeenCalled();expect(m.detail).not.toHaveBeenCalled();
});
it.each([{sessionId:'session-a',note:'x'}, {...input,bookingId:'booking-a'}, {...input,storeId:'foreign'}, {...input,note:'字'.repeat(1001)}])('validates the teacher-only input before authorization: %j',async value=>{
 expect(await saveMusicTeacherNoteWithRoster(value)).toMatchObject({success:false});expect(m.access).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});
it('retains the exact expected whitespace while allowing an empty normalized note',async()=>{
 await saveMusicTeacherNoteWithRoster({...input,expectedNote:' old ',note:'  '});expect(m.write).toHaveBeenCalledWith({where:{id:'session-a',storeId:'store-a',cancelledAt:null,teacherNote:' old '},data:{teacherNote:''}});
});
it('keeps a conflict distinct from a saved write and never returns a roster',async()=>{
 m.write.mockResolvedValue({count:0});m.current.mockResolvedValue({teacherNote:'同事的備註'});const result=await saveMusicTeacherNoteWithRoster(input);
 expect(result).toMatchObject({success:false,currentValue:'同事的備註'});expect(result).not.toHaveProperty('sync');expect(m.detail).not.toHaveBeenCalled();
 expect(m.current).toHaveBeenCalledExactlyOnceWith({where:{id:'session-a',storeId:'store-a',cancelledAt:null},select:{teacherNote:true}});
});
it('does not disclose another store or cancelled/missing session',async()=>{
 m.write.mockResolvedValue({count:0});m.current.mockResolvedValue(null);const result=await saveMusicTeacherNoteWithRoster(input);expect(result).toMatchObject({success:false});expect(result).not.toHaveProperty('currentValue');expect(m.detail).not.toHaveBeenCalled();
});
it('recognizes a prior committed value without a second update',async()=>{
 m.write.mockResolvedValue({count:0});m.current.mockResolvedValue({teacherNote:'新備註'});expect(await saveMusicTeacherNoteWithRoster(input)).toMatchObject({success:true,sync:{state:'ready'}});expect(m.write).toHaveBeenCalledOnce();expect(m.detail).toHaveBeenCalledOnce();
});
it.each(['read-permission','store','identity','music-revoked','read-failure'])('keeps the confirmed write saved after %s and discloses no partial DTO',async kind=>{
 if(kind==='read-permission')m.access.mockResolvedValueOnce(actor).mockRejectedValueOnce(new AppError('FORBIDDEN','denied'));
 if(kind==='store')m.access.mockResolvedValueOnce(actor).mockResolvedValueOnce({...actor,storeId:'foreign'});
 if(kind==='identity')m.access.mockResolvedValueOnce(actor).mockResolvedValueOnce({...actor,user:{...actor.user,id:'other'}});
 if(kind==='music-revoked')m.readMusic.mockResolvedValue(false);if(kind==='read-failure')m.detail.mockRejectedValue(Error('offline'));
 const result=await saveMusicTeacherNoteWithRoster(input);expect(result).toMatchObject({success:true,sync:{state:'failed'}});expect(result).not.toHaveProperty('sync.snapshot');expect(m.write).toHaveBeenCalledOnce();expect(m.refresh).not.toHaveBeenCalled();if(kind!=='read-failure')expect(m.detail).not.toHaveBeenCalled();
});
it('marks a database connection loss as uncertain instead of confirming that nothing was saved',async()=>{
 m.write.mockRejectedValue(Error('connection lost after possible commit'));expect(await saveMusicTeacherNoteWithRoster(input)).toMatchObject({success:false,uncertain:true});expect(m.detail).not.toHaveBeenCalled();expect(m.write).toHaveBeenCalledOnce();
});
