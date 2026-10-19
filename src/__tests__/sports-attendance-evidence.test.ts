import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({native:true,read:vi.fn(),bookings:vi.fn(),query:vi.fn(),fitness:vi.fn()}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:()=>m.native}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.read}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseBooking:{findMany:m.bookings}}}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.query,storeFeatureEntitlement:{findFirst:m.fitness}}}));
import {loadSportsAttendanceEvidence} from '@/server/actions/sports-attendance-evidence';
beforeEach(()=>{vi.clearAllMocks();m.native=true;m.read.mockResolvedValue({storeId:'sports-live-flow-store'});m.fitness.mockResolvedValue({});m.bookings.mockResolvedValue([{id:'b',status:'NO_SHOW',pointCost:2,card:{unit:'POINT'}}]);m.query.mockResolvedValue([{targetId:'b',action:'STUDENT_LEAVE',name:'舊請假人',at:new Date()},{targetId:'b',action:'NO_SHOW',name:'點名人',at:new Date('2026-10-18T08:00Z')}]);});
it('只取本店所選日期、目前狀態相符的操作快照與扣抵額度',async()=>{
 const r=await loadSportsAttendanceEvidence('2026-10-19');expect(r.success).toBe(true);if(r.success)expect(r.data).toEqual([{id:'b',name:'點名人',at:'2026-10-18T08:00:00.000Z',cost:2,unit:'POINT'}]);expect(m.bookings.mock.calls[0][0].where.storeId).toBe('sports-live-flow-store');
});
it('缺乏歷史快照不把預約建立人當成點名人',async()=>{m.query.mockResolvedValue([]);const r=await loadSportsAttendanceEvidence('2026-10-19');if(r.success)expect(r.data[0].name).toBeNull();else throw Error('expected success');});
it('非運動Preview不讀個人或稽核資料',async()=>{m.native=false;expect((await loadSportsAttendanceEvidence('2026-10-19')).success).toBe(false);expect(m.bookings).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();});
it('無缺席名單不讀稽核資料',async()=>{m.bookings.mockResolvedValue([]);expect((await loadSportsAttendanceEvidence('2026-10-19')).success).toBe(true);expect(m.query).not.toHaveBeenCalled();});
