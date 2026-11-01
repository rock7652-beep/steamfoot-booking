// @vitest-environment jsdom
import {act,createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TrendChartBoundary} from '@/components/trend-chart-loading';

let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
function BrokenPlot():never{throw new Error('Unavailable plot code');}

it('contains plot failures without discarding report data or an existing page draft',()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});
 function Report(){const [draft,setDraft]=useState('尚未完成的篩選');return createElement('main',null,
  createElement('p',null,'已核對營業額 1,200'),
  createElement('input',{'aria-label':'報表草稿',value:draft,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setDraft(e.target.value)}),
  createElement('button',{onClick:()=>setDraft('仍可編輯')},'修改篩選'),
  createElement(TrendChartBoundary,null,createElement(BrokenPlot)));
 }
 act(()=>root.render(createElement(Report)));
 expect(host.querySelector('[role=alert]')?.textContent).toContain('完成目前工作後');
 expect(host.textContent).toContain('已核對營業額 1,200');
 expect(host.querySelector('input')?.value).toBe('尚未完成的篩選');
 act(()=>host.querySelector('button')!.click());expect(host.querySelector('input')?.value).toBe('仍可編輯');
 expect(host.querySelectorAll('button')).toHaveLength(1);
});

it('preserves the same plot instance and state when its parent rerenders',()=>{
 let mounts=0;
 function Plot(){const [value,setValue]=useState(()=>{mounts++;return 1;});return createElement('button',{onClick:()=>setValue(v=>v+1)},String(value));}
 const render=(label:string)=>act(()=>root.render(createElement('main',null,createElement('p',null,label),createElement(TrendChartBoundary,null,createElement(Plot)))));
 render('本期');act(()=>host.querySelector('button')!.click());render('近六個月');
 expect(host.querySelector('button')?.textContent).toBe('2');expect(mounts).toBe(1);
});
