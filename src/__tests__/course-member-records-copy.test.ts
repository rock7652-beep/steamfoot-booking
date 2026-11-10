// @vitest-environment jsdom
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CourseMemberPaymentRecords} from '@/app/(customer)/book/course-member-records';
import type {CourseMemberRecords} from '@/server/queries/course-member-records';
const record={id:'order',cardId:'card',name:'舞蹈十堂',unit:'SESSION',points:10,date:'2026-11-01T03:00:00Z',status:'CONFIRMED',termSizes:[],templateIds:[],due:null,received:0,periods:[],receipts:[],refunds:[],lessonsAvailable:true,lessons:[]};
function render(overrides:Record<string,unknown>={}){const host=document.createElement('div');host.innerHTML=renderToStaticMarkup(h(CourseMemberPaymentRecords,{records:[{...record,...overrides}] as unknown as CourseMemberRecords,music:false,templates:[],embedded:true,gridShown:true}));return host;}
it('keeps financial details available without repeating an empty lesson section beside a grid',()=>{
 const host=render();expect(host.querySelector('summary')?.textContent).toBe('繳費明細');expect(host.querySelector('details')?.open).toBe(false);expect(host.textContent).toContain('已收 NT$ 0');expect(host.textContent).not.toContain('上課紀錄');expect(host.textContent).not.toContain('尚無課堂');
});
it.each([{status:'PENDING',due:1000,received:0,expected:'待核帳'},{status:'CONFIRMED',due:1000,received:200,expected:'未收 NT$ 800'},{status:'REFUNDED',expected:'已退款'},{status:'VOIDED',expected:'已作廢'}])('keeps $expected visible in the collapsed financial summary',({expected,...data})=>{
 expect(render(data).querySelector('summary')?.textContent).toContain(expected);
});
it('retains real lesson detail beneath its distinct label',()=>{
 const host=render({lessons:[{id:'lesson',date:'2026-11-03T03:00:00Z',name:'舞蹈',status:'已出席',used:1,unit:'SESSION'}]});expect(host.textContent).toContain('詳細紀錄');expect(host.textContent).toContain('已出席');
});
