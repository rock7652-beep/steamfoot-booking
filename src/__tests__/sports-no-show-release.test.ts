import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/feature-gate',()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseTransaction:vi.fn()}));
const scope=vi.hoisted(()=>({sports:true}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:()=>scope.sports}));
import {syncCourseRelease} from '@/server/services/course-booking';
import type {Prisma} from '../../generated/course-client';
type Row={status:string;absenceKind?:string};
type Filter={status?:string|{not?:string;notIn?:string[]};absenceKind?:{in:string[]};OR?:Filter[]};
function matches(row:Row,where:Filter):boolean{
 const status=where.status;
 return (!status||(typeof status==='string'?row.status===status:row.status!==status.not&&!status.notIn?.includes(row.status)))&&(!where.absenceKind||where.absenceKind.in.includes(row.absenceKind??''))&&(!where.OR||where.OR.some(w=>matches(row,w)));
}
function fixture(rows:Row[],released=false,conflict=false){
 const update=vi.fn();const session={teacherAttendance:'SCHEDULED',releasedAt:released?new Date():null,startsAt:new Date('2026-10-26T01:00Z'),endsAt:new Date('2026-10-26T02:00Z'),roomId:'room',coachId:'coach'};
 const tx={courseSession:{findFirst:vi.fn().mockResolvedValueOnce(session).mockResolvedValue(conflict?{roomId:'room'}:null),update},courseBooking:{count:vi.fn(async({where}:{where:Filter})=>rows.filter(r=>matches(r,where)).length)}};
 return {tx:tx as unknown as Prisma.TransactionClient,update};
}
beforeEach(()=>{scope.sports=true;});
it('所有學員未出席扣堂後釋出時段，僅更新課次占用、不更改點名或帳務',async()=>{
 const f=fixture([{status:'NO_SHOW'}]);await syncCourseRelease(f.tx,'sports-live-flow-store','s');expect(f.update).toHaveBeenCalledWith({where:{id:'s'},data:{releasedAt:expect.any(Date)}});
});
it.each(['RESERVED','ATTENDED','CHECKED_IN'])('仍有 %s 學員時不得釋出整堂',async status=>{
 const f=fixture([{status:'NO_SHOW'},{status}]);await syncCourseRelease(f.tx,'sports-live-flow-store','s');expect(f.update).not.toHaveBeenCalled();
});
it('請假與未出席混合且無人上課也釋出，空堂不自動釋出',async()=>{
 const f=fixture([{status:'NO_SHOW'},{status:'CANCELLED',absenceKind:'STUDENT_LEAVE'}]);await syncCourseRelease(f.tx,'sports-live-flow-store','s');expect(f.update).toHaveBeenCalledOnce();
 const empty=fixture([]);await syncCourseRelease(empty.tx,'sports-live-flow-store','s');expect(empty.update).not.toHaveBeenCalled();
});
it('非運動Preview沿用未出席占用規則',async()=>{
 scope.sports=false;const f=fixture([{status:'NO_SHOW'}]);await syncCourseRelease(f.tx,'music','s');expect(f.update).not.toHaveBeenCalled();
});
it('已有新課占用時禁止恢復原課，保持釋出',async()=>{
 const f=fixture([{status:'RESERVED'}],true,true);await expect(syncCourseRelease(f.tx,'sports-live-flow-store','s')).rejects.toThrow('已有課');expect(f.update).not.toHaveBeenCalled();
});
it('沒有新占用時可恢復原課占用',async()=>{
 const f=fixture([{status:'ATTENDED'}],true);await syncCourseRelease(f.tx,'sports-live-flow-store','s');expect(f.update).toHaveBeenCalledWith({where:{id:'s'},data:{releasedAt:null}});
});
