// Synthetic data only. Actual shared grid and beauty reader; no backend writes.
import {createRoot} from 'react-dom/client';
import {PlanUsageGrid} from '@/components/admin/plan-usage-grid';
import {BeautyPlanProgress} from '@/components/beauty/plan-progress';
import {walletPlanProgress} from '@/lib/wallet-plan-progress';
import {CoursePlanDateGrid} from '@/components/course-plan-date-grid';
import {LessonProgressGrid} from '@/components/admin/lesson-progress-grid';
const date='2026-11-03T02:00:00Z';
const sessions=Array.from({length:10},(_,i)=>({id:`steam-${i}`,status:i===0?'COMPLETED':i===1?'BACKFILLED':i===2?'VOIDED':i===3?'RESERVED':'AVAILABLE',completedAt:i<2?new Date(date):null,voidedAt:i===2?new Date('2026-11-10T16:00Z'):null,booking:i===0?{bookingDate:new Date(date)}:null}));
const beauty={success:true as const,data:{progress:{available:true as const,total:20,completed:[{id:'shared-a',date,customerName:'孩子甲'},{id:'shared-b',date:'2026-11-04T03:00Z',customerName:'孩子乙'}],voided:[{id:'void',date:'2026-11-10T16:00Z'}]},purchasedAt:'2026-10-01T01:00Z',price:10000,shared:true}};
const load=async()=>beauty;
function Fixture(){return <main className="mx-auto max-w-4xl space-y-3 p-3"><p className="text-sm">合成資料預覽 · 不連線、不寫入</p><article data-module="steam" className="rounded-lg border bg-white p-3"><h2 className="text-base font-semibold">蒸足十堂方案</h2><p className="text-sm">剩餘 7 堂 · 已預約 1 堂 · 可再約 6 堂</p><PlanUsageGrid progress={walletPlanProgress({totalSessions:10,remainingSessions:7,sessions})} unitLabel="堂"/></article><article data-module="beauty" className="rounded-lg border bg-white p-3"><h2 className="text-base font-semibold">護理二十次方案 · 共用</h2><p className="text-sm">剩餘 17 次 · 已預約 1 次 · 可再約 16 次 · 2027-02-08 到期</p><BeautyPlanProgress cardId="synthetic" scope="synthetic" slug="test" load={load}/></article><article data-module="music" className="rounded-lg border bg-white p-3"><h2 className="text-base font-semibold">鋼琴八堂方案</h2><CoursePlanDateGrid cardId="music" grid={{total:8,dates:[date],completed:[{id:"music-use",date,customerName:"孩子甲"}]}}/></article><article data-module="sports" className="rounded-lg border bg-white p-3"><h2 className="text-base font-semibold">運動十堂方案</h2><LessonProgressGrid compact showSummary={false} total={10} completed={[]}/></article></main>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
