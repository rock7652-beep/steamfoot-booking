// @vitest-environment jsdom
import {act,createElement} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/components/operations/panel-read-cache',()=>({usePanelReader:()=>m}));
vi.mock('@/server/actions/music-periods',()=>({confirmMusicLessonPeriod:vi.fn()}));
import {MusicPeriodOverview} from '@/app/(dashboard)/dashboard/courses/music-period-overview';
let root:Root,host:HTMLDivElement;
const value=(name:string)=>({success:true,data:[{id:name,nameSnapshot:name,musicTermSizes:[1],slots:[],bookings:[],tuition:null,periodTuition:[]}],canCorrect:false});
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);m.read.mockResolvedValue(value('A-only-plan'));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('hides the former learner immediately while the next read is pending or fails',async()=>{
 await act(async()=>root.render(createElement(MusicPeriodOverview,{customerId:'A'})));expect(host.textContent).toContain('A-only-plan');
 let finish!:(v:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(r=>finish=r));await act(async()=>root.render(createElement(MusicPeriodOverview,{customerId:'B'})));
 expect(host.textContent).not.toContain('A-only-plan');expect(host.textContent).toContain('讀取逐期紀錄中');expect(m.invalidate).toHaveBeenLastCalledWith('B');
 await act(async()=>finish({success:false,error:'B denied'}));expect(host.textContent).toContain('B denied');expect(host.textContent).not.toContain('A-only-plan');
});
it('ignores a late earlier learner response after the current learner has loaded',async()=>{
 let finish!:(v:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(r=>finish=r));await act(async()=>root.render(createElement(MusicPeriodOverview,{customerId:'A'})));
 m.read.mockResolvedValue(value('B-only-plan'));await act(async()=>root.render(createElement(MusicPeriodOverview,{customerId:'B'})));expect(host.textContent).toContain('B-only-plan');
 await act(async()=>finish(value('A-late-plan')));expect(host.textContent).toContain('B-only-plan');expect(host.textContent).not.toContain('A-late-plan');
});
