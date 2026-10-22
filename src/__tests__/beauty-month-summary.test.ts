import {expect,it,vi} from 'vitest';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/app/(dashboard)/dashboard/courses/course-schedule-board',()=>({CourseScheduleBoard:()=>null}));
import {BeautyScheduleWorkspace} from '@/components/beauty/schedule-workspace';
import type {BeautyDashboardData} from '@/server/beauty/queries';
it('shows one booking with two people, excludes cancelled rows and does not list services in month cells',()=>{
 const base={id:'a',groupId:'g',startsAt:'2026-10-22T01:00:00Z',endsAt:'2026-10-22T02:00:00Z',occupiedEndsAt:'2026-10-22T02:00:00Z',status:'RESERVED',personName:'本人',serviceName:'不該出現在月格的服務',serviceId:'service',technicianId:'tech',locationId:'room',customerId:'member',buffer:0};
 const data={calendar:'month',date:'2026-10-22',items:[base,{...base,id:'b',personName:'同行者'},{...base,id:'c',groupId:'cancelled',status:'CANCELLED'}],locations:[],techs:[],services:[],access:{writeAccess:true},calendarDays:{}} as unknown as BeautyDashboardData;
 const html=renderToStaticMarkup(h(BeautyScheduleWorkspace,{data,onOpen:vi.fn(),onCreate:vi.fn(),onChange:vi.fn(),pending:false,readOnly:false}));
 expect(html).toContain('2026-10-22，1筆預約，2人次');expect(html).not.toContain('不該出現在月格的服務');expect(html).not.toContain('預約名單');
});
