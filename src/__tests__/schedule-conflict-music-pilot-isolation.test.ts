import {afterEach,expect,it,vi} from 'vitest';
import type {Prisma} from '../../generated/course-client';
import {isMusicPilotCard,issueMusicPilotLeaveMakeup} from '@/server/services/music-pilot-policy';
afterEach(()=>vi.unstubAllEnvs());
it('native scheduling review can render historical card summaries without authorizing pilot operations',async()=>{
 vi.stubEnv('VERCEL','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','fix/schedule-conflicts-20261103');
 const read=vi.fn(),write=vi.fn();
 const card={id:'pilot',requestKey:'yjy-pilot-card:fixture',expiresAt:new Date('2099-01-01')};
 const tx={$queryRaw:read,$executeRaw:write,coursePointCard:{findFirst:vi.fn().mockResolvedValue(card),create:write,update:write}} as unknown as Prisma.TransactionClient;
 await expect(isMusicPilotCard(tx,'store-lubymusic',card)).resolves.toBe(false);
 await expect(issueMusicPilotLeaveMakeup(tx,{storeId:'store-lubymusic',userId:'qa',name:'QA'},
  {id:'booking',cardId:card.id,customerId:'customer',session:{templateId:'template'}})).rejects.toThrow('未通過來源核對');
 expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
});
it('other unauthorized branches retain the existing historical pilot guard',async()=>{
 vi.stubEnv('VERCEL','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','other');
 const read=vi.fn();const tx={$queryRaw:read} as unknown as Prisma.TransactionClient;
 await expect(isMusicPilotCard(tx,'store-lubymusic',{id:'pilot',requestKey:'yjy-pilot-card:fixture'})).rejects.toThrow('exact authorized Preview');
 expect(read).not.toHaveBeenCalled();
});
