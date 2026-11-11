import {describe,it,expect} from 'vitest';
import {courseFeeGroup,courseFeeMatches,PENDING_FEE_SUBJECT} from '../lib/course-fee-group';
const subjects=[{id:'A',name:'基礎課程'},{id:'B',name:'零基礎成芭'}];
const templates=[{id:'tA',name:'舊名稱',musicSubjectId:'A'},{id:'tB',name:'成芭',musicSubjectId:'B'}];
describe('catalog scope presentation',()=>{
 it('keeps unknown OPEN fees out of every subject despite a suggestive name or stale scope',()=>{
  const plan={sportsMode:'OPEN',sportsSubjectId:'A',templateIds:['tA']};
  const group=courseFeeGroup(plan,templates,subjects,false);
  expect(courseFeeMatches(group,'A',plan)).toBe(false);
  expect(courseFeeMatches(group,PENDING_FEE_SUBJECT,plan)).toBe(true);
 });
 it('keeps A fees in A and B fees out, using subject identity',()=>{
  const plan={sportsMode:'ASSIGNED',sportsSubjectId:'A',templateIds:[]};
  const group=courseFeeGroup(plan,templates,subjects,false);
  expect(group.name).toBe('基礎課程');
  expect(courseFeeMatches(group,'A',plan)).toBe(true);
  expect(courseFeeMatches(group,'B',plan)).toBe(false);
 });
 it('preserves a known legacy template association without using its stale display name',()=>{
  const group=courseFeeGroup({templateIds:['tA']},templates,subjects,false);
  expect(group.subjectIds).toEqual(['A']);
 });
 it('does not guess when a legacy or assigned scope is missing',()=>{
  for(const plan of [{templateIds:[]},{templateIds:['tA','deleted']},{templateIds:[],sportsMode:'ASSIGNED',sportsSubjectId:'deleted'}])expect(courseFeeGroup(plan,templates,subjects,false).pending).toBe(true);
 });
 it('groups music by actual subjects and preserves multi-subject fees',()=>{
  const plan={templateIds:['tB','tA']};
  const group=courseFeeGroup(plan,templates,subjects,true);
  expect(group.subjectIds).toEqual(['A','B']);
  expect(courseFeeMatches(group,'A',plan)).toBe(true);
  expect(courseFeeMatches(group,'tB',plan)).toBe(true);
  expect(courseFeeGroup({...plan,templateIds:['tA','tB']},templates,subjects,true)).toEqual(group);
 });
 it('lists unresolved music fees separately',()=>expect(courseFeeGroup({templateIds:['deleted']},templates,subjects,true).pending).toBe(true));
});
