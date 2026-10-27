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
