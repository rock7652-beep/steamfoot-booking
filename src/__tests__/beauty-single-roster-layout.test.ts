import {expect,it,vi} from 'vitest';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/components/customer-labels',()=>({CustomerLabels:()=>null}));
import {CourseRosterList,type CourseRosterDisplayRow} from '@/app/(dashboard)/dashboard/courses/roster-list';
const row:CourseRosterDisplayRow={id:'one',name:'測試顧客',phone:'0932210659',owner:'床位2',status:'已預約',mark:'pending',statusTitle:'完成服務',statusDisabled:false,onStatus:()=>{},onOpen:()=>{},cost:'待收 NT$1,199',balance:'0次',reminders:'本次備註',onMore:()=>{}};
it('splits the phone into its own column without displaying a missing-phone placeholder or repeating location',()=>{const html=renderToStaticMarkup(h(CourseRosterList,{separateIdentity:true,rows:[row],empty:'無預約',labels:{cost:'本次使用',balance:'可用次數'}}));for(const label of ['姓名','電話','本次使用','可用次數','標籤與備註','操作'])expect(html).toContain(label);expect(html).toContain('0932-210-659');expect(html).not.toContain('未留電話');expect(html).not.toContain('床位2');expect(html).toContain('測試顧客 更多操作');expect(html).toContain('待收 NT$1,199');});
it('retains the original combined identity and owner information for other roster layouts',()=>{const html=renderToStaticMarkup(h(CourseRosterList,{rows:[row],empty:'無預約'}));expect(html).toContain('學員／電話');expect(html).toContain('床位2');expect(html).toContain('0932-210-659');});
