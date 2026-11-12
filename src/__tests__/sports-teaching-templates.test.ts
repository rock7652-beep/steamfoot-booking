import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {readSportsTeachingTemplates} from '@/server/services/sports-teaching-templates';
import type {Prisma} from '../../generated/course-client';
it('derives aliases only from the same stored teaching item and store',async()=>{
 const findMany=vi.fn().mockResolvedValue([{id:'old-10'},{id:'current'}]);
 const tx={courseTemplate:{findMany}} as unknown as Prisma.TransactionClient;
 expect(await readSportsTeachingTemplates(tx,'store','dance')).toEqual(['old-10','current']);
 expect(findMany).toHaveBeenCalledExactlyOnceWith({where:{storeId:'store',musicSubjectId:'dance'},select:{id:true}});
 expect(await readSportsTeachingTemplates(tx,'store',null)).toEqual([]);expect(findMany).toHaveBeenCalledOnce();
});
it('scheduling picker includes legacy lesson packages by stored teaching item without changing their snapshot mode',async()=>{
 const {sportsAssignedStudentSubjects}=await import('@/server/services/sports-teaching-templates');
 const card={sportsMode:'LEGACY',unit:'SESSION',templateIds:['old-10'],sportsSubjectId:null,requestKey:'purchase'};
 const templates=[{id:'old-10',storeId:'store',musicSubjectId:'dance'},{id:'old-10',storeId:'other',musicSubjectId:'foreign'}];
 expect(sportsAssignedStudentSubjects('store',card,templates)).toEqual(['dance']);
 expect(card.sportsMode).toBe('LEGACY');
 expect(sportsAssignedStudentSubjects('store',{...card,unit:'POINT'},templates)).toEqual([]);
 expect(sportsAssignedStudentSubjects('store',{...card,requestKey:'no-show-makeup:original'},templates)).toEqual([]);
});
it('includes only checked universal lesson-card items in the scheduling picker',async()=>{
 const {sportsAssignedStudentSubjects}=await import('@/server/services/sports-teaching-templates');
 const card={storeId:'store',sportsMode:'OPEN',unit:'SESSION',templateIds:[],sportsSubjectId:null,requestKey:'purchase',plan:{storeId:'store',templateIds:['regular','basic','special'],chargeSettings:{kind:'plan',durationMinutes:60,trialPrice:null,trialDuration:null,providerIds:['coach']}}};
 const templates=['regular','basic','special','one-to-one'].map(id=>({id,storeId:'store',musicSubjectId:id}));
 expect(sportsAssignedStudentSubjects('store',card,templates)).toEqual(['regular','basic','special']);
 expect(sportsAssignedStudentSubjects('other',card,templates)).toEqual([]);
 expect(sportsAssignedStudentSubjects('store',{...card,unit:'POINT'},templates)).toEqual([]);
});
