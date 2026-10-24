// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {act,createElement as h,type ComponentProps} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({workspace:vi.fn()}));
vi.mock('@/app/(dashboard)/dashboard/courses/workspace',()=>({CourseWorkspace:(props:unknown)=>{mocks.workspace(props);return null;}}));
vi.mock('@/components/beauty/native-schedule-source',()=>({beautyNativeScheduleSource:()=>({initial:{},source:{command:vi.fn()}})}));
import {BeautyScheduleWorkspace} from '@/components/beauty/schedule-workspace';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {CourseWorkspace} from '@/app/(dashboard)/dashboard/courses/workspace';
it('feeds the original calendar controller after hydration, retaining true duration and delegated listing',async()=>{
 const base={id:'a',groupId:'g',startsAt:'2026-10-22T01:00:00Z',endsAt:'2026-10-22T02:00:00Z',occupiedEndsAt:'2026-10-22T02:15:00Z',status:'RESERVED',personName:'本人',serviceName:'服務',serviceId:'service',technicianId:'tech',locationId:'room',customerId:'member',buffer:15};
 const data={storeId:'test',calendar:'month',date:'2026-10-22',now:Date.parse(base.startsAt),items:[base,{...base,id:'b',personName:'同行者'},{...base,id:'c',groupId:'cancelled',status:'CANCELLED'}],customers:[],assignmentStaff:[],locations:[],techs:[],services:[],manage:{update:true},access:{writeAccess:true},calendarDays:{}} as unknown as BeautyDashboardData;
 const onRoster=vi.fn(),onOpen=vi.fn();const props={data,slug:'test',onOpen,onRoster,onLoaded:vi.fn(),onDateChange:vi.fn(),readOnly:false};expect(renderToStaticMarkup(h(BeautyScheduleWorkspace,props))).toContain('讀取班表中');Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div'),root=createRoot(host);await act(async()=>root.render(h(BeautyScheduleWorkspace,props)));
 const workspace=mocks.workspace.mock.calls.at(-1)![0] as ComponentProps<typeof CourseWorkspace>;
 expect(workspace.sportsNative).toBe(true);expect(workspace.sessions.map(s=>s.id)).toEqual(['a','b']);expect(workspace.sessions[0]).toMatchObject({endsAt:base.endsAt,occupiedEndsAt:base.occupiedEndsAt,service:{groupId:'g',buffer:15}});
 expect(new Set(workspace.sessions.map(s=>s.service?.groupId)).size).toBe(1);expect(workspace.sessions.flatMap(s=>s.bookings)).toHaveLength(2);
 workspace.calendarSource!.onRoster();workspace.calendarSource!.onOpen('a');expect(onRoster).toHaveBeenCalledOnce();expect(onOpen).toHaveBeenCalledWith('a');await act(async()=>root.unmount());
});
