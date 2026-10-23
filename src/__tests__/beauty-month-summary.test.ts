import {expect,it,vi} from 'vitest';
import {createElement as h,type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({workspace:vi.fn()}));
vi.mock('@/app/(dashboard)/dashboard/courses/workspace',()=>({CourseWorkspace:(props:unknown)=>{mocks.workspace(props);return null;}}));
vi.mock('@/components/beauty/native-schedule-source',()=>({beautyNativeScheduleSource:()=>({initial:{},source:{command:vi.fn()}})}));
import {BeautyScheduleWorkspace} from '@/components/beauty/schedule-workspace';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {CourseWorkspace} from '@/app/(dashboard)/dashboard/courses/workspace';
it('feeds the original calendar controller all party participants and true duration, excludes cancellation and delegates listing',()=>{
 const base={id:'a',groupId:'g',startsAt:'2026-10-22T01:00:00Z',endsAt:'2026-10-22T02:00:00Z',occupiedEndsAt:'2026-10-22T02:15:00Z',status:'RESERVED',personName:'本人',serviceName:'服務',serviceId:'service',technicianId:'tech',locationId:'room',customerId:'member',buffer:15};
 const data={storeId:'test',calendar:'month',date:'2026-10-22',now:Date.parse(base.startsAt),items:[base,{...base,id:'b',personName:'同行者'},{...base,id:'c',groupId:'cancelled',status:'CANCELLED'}],customers:[],assignmentStaff:[],locations:[],techs:[],services:[],manage:{update:true},access:{writeAccess:true},calendarDays:{}} as unknown as BeautyDashboardData;
 const onRoster=vi.fn(),onOpen=vi.fn();renderToStaticMarkup(h(BeautyScheduleWorkspace,{data,slug:'test',onOpen,onRoster,onLoaded:vi.fn(),onDateChange:vi.fn(),readOnly:false}));
 const props=mocks.workspace.mock.calls.at(-1)![0] as ComponentProps<typeof CourseWorkspace>;
 expect(props.sportsNative).toBe(true);expect(props.sessions.map(s=>s.id)).toEqual(['a','b']);expect(props.sessions[0]).toMatchObject({endsAt:base.endsAt,occupiedEndsAt:base.occupiedEndsAt,service:{groupId:'g',buffer:15}});
 expect(new Set(props.sessions.map(s=>s.service?.groupId)).size).toBe(1);expect(props.sessions.flatMap(s=>s.bookings)).toHaveLength(2);
 props.calendarSource!.onRoster();props.calendarSource!.onOpen('a');expect(onRoster).toHaveBeenCalledOnce();expect(onOpen).toHaveBeenCalledWith('a');
});
