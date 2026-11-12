import {expect,it} from 'vitest';
import {courseFeeGroup} from '@/lib/course-fee-group';
import {mergeCoursePlanCatalog} from '@/lib/course-plan-catalog';
import {coursePlanValues,savedCoursePlan,type CoursePlanCatalogTemplate} from '@/lib/course-plan-save';
const subjects=[{id:'A',name:'吉他團體班'},{id:'B',name:'吉他自組班'}];
const template=(id:string,subjectId:string):CoursePlanCatalogTemplate=>({id,name:'內部收費版本',category:'',isActive:true,durationMinutes:100,musicSubjectId:subjectId,classType:null,musicTeacherShare:0.6,musicPricePerLesson:650,musicTermLessons:4,musicValidityDaysPerTerm:35,musicTrialMode:null,musicScheduleMode:'FIXED'});
it('classifies a confirmed newly-created fee before its new template arrives in route props',()=>{
 const saved={templateIds:['new-version'],catalogTemplates:[template('new-version','B')]};
 expect(courseFeeGroup(saved,[],subjects,true).pending).toBe(true);
 const catalog=mergeCoursePlanCatalog([], [saved]);
 expect(courseFeeGroup(saved,catalog,subjects,true)).toMatchObject({pending:false,name:'吉他自組班',subjectIds:['B']});
 expect(catalog[0]).toMatchObject({durationMinutes:100,musicTermLessons:4});
});
it('moves a confirmed fee to B immediately while stale page metadata still contains only A',()=>{
 const original=template('old','A');
 const moved={templateIds:['new'],catalogTemplates:[template('new','B')]};
 const catalog=mergeCoursePlanCatalog([original],[moved]);
 expect(courseFeeGroup(moved,catalog,subjects,true).subjectIds).toEqual(['B']);
 expect(catalog.find(row=>row.id===moved.templateIds[0])?.musicSubjectId).toBe('B');
 expect(original.musicSubjectId).toBe('A');
});
it('merges only the saved plan scope, and lets current route metadata take over after receipts retire',()=>{
 expect(mergeCoursePlanCatalog([],[{templateIds:['valid'],catalogTemplates:[template('unrelated','B')]}])).toEqual([]);
 expect(courseFeeGroup({templateIds:['new']},mergeCoursePlanCatalog([template('new','B')],[]),subjects,true).name).toBe('吉他自組班');
});
it('keeps metadata through receipt parsing and strips it from write authority',()=>{
 const receipt={id:'p',name:'新方案',points:4,price:2600,validDays:35,isActive:true,unit:'SESSION',templateIds:['new'],lowBalanceEnabled:false,lowBalanceThreshold:null,catalogTemplates:[template('new','B')]};
 expect(savedCoursePlan.parse(receipt).catalogTemplates?.[0].musicSubjectId).toBe('B');
 expect(coursePlanValues.parse(receipt)).not.toHaveProperty('catalogTemplates');
 const legacySubjectId='s'.repeat(150);
 expect(savedCoursePlan.parse({...receipt,catalogTemplates:[template('new',legacySubjectId)]}).catalogTemplates?.[0].musicSubjectId).toBe(legacySubjectId);
});
