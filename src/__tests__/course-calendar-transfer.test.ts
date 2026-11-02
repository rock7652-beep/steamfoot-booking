import {expect,it} from 'vitest';
import {preparedRoster} from './fixtures/prepared-roster';
import {shareCalendarRosterMetadata} from '@/server/services/course-calendar-transfer';
import type {CalendarRosterSnapshots} from '@/app/(dashboard)/dashboard/courses/roster-source';

function detail(id:string,price=350){
 const base=preparedRoster(id);
 return {...base,customers:[],session:{...base.session,compatibleTemplateIds:['teaching-item-version-one','teaching-item-version-two']},trial:{settings:{trialEnabled:true,trialDefaultPrice:price,trialAllowPriceEdit:false,trialMinPrice:0,trialMaxPrice:3000},canCreate:true,canCollect:true,canCorrect:false,customers:[]}};
}
it('shares equal metadata while preserving every value, learner right, row identity and input',()=>{
 const a=detail('trial'),b=detail('twenty');a.roster[0].bookingKind='TRIAL';a.roster[0].planName='體驗';b.roster[0].planName='二十堂';b.roster[0].available=18;
 const source:CalendarRosterSnapshots={storeId:'s',details:{a,b}},before=structuredClone(source);
 const result=shareCalendarRosterMetadata(source);
 expect(result).toStrictEqual(source);expect(source).toStrictEqual(before);
 expect(result.details.a.trial).toBe(result.details.b.trial);
 expect(result.details.a.session.compatibleTemplateIds).toBe(result.details.b.session.compatibleTemplateIds);
 expect(result.details.a.roster).toBe(a.roster);expect(result.details.b.roster).toBe(b.roster);
 expect(result.details.a.roster[0]).not.toBe(result.details.b.roster[0]);
 expect(result.details.b.roster[0].available).toBe(18);
});
it('keeps different prices, permissions, eligible item lists and customer-containing data separate',()=>{
 const a=detail('a'),b=detail('b',500),c=detail('c');c.trial.canCollect=false;c.session.compatibleTemplateIds=['another-item'];
 const customerTrial={...detail('d').trial,customers:[{id:'person',name:'顧客',phone:'0000000000'}]};
 const source:CalendarRosterSnapshots={storeId:'s',details:{a,b,c,d:{...detail('d'),trial:customerTrial},e:{...detail('e'),trial:{...customerTrial}}}};
 const result=shareCalendarRosterMetadata(source);
 expect(result).toStrictEqual(source);expect(result.details.a.trial).not.toBe(result.details.b.trial);expect(result.details.a.trial).not.toBe(result.details.c.trial);
 expect(result.details.a.session.compatibleTemplateIds).not.toBe(result.details.c.session.compatibleTemplateIds);
 expect(result.details.d.trial).not.toBe(result.details.e.trial);
});
it('keeps explicit undefined distinct from missing metadata and leaves empty arrays inline',()=>{
 const a=detail('a'),b=detail('b');a.session.compatibleTemplateIds=[];b.session.compatibleTemplateIds=[];
 const withUndefined={...b.trial,extra:undefined};
 const source:CalendarRosterSnapshots={storeId:'s',details:{a,b:{...b,trial:withUndefined}}};
 const result=shareCalendarRosterMetadata(source);
 expect(result).toStrictEqual(source);expect(result.details.a.trial).not.toBe(result.details.b.trial);
 expect(result.details.a.session.compatibleTemplateIds).toBe(a.session.compatibleTemplateIds);
 expect(result.details.a.session.compatibleTemplateIds).not.toBe(result.details.b.session.compatibleTemplateIds);
});
it('never retains shared objects for another snapshot or store and handles service rosters without trial metadata',()=>{
 const first=shareCalendarRosterMetadata({storeId:'a',details:{one:detail('one')}});
 const second=shareCalendarRosterMetadata({storeId:'b',details:{one:detail('one')}});
 expect(first.details.one.trial).not.toBe(second.details.one.trial);
 const service={storeId:'service',details:{one:preparedRoster('service')}};
 expect(shareCalendarRosterMetadata(service)).toStrictEqual(service);
 expect(shareCalendarRosterMetadata({storeId:'empty',details:{}})).toStrictEqual({storeId:'empty',details:{}});
});
