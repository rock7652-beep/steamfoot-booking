import type { Prisma } from '../../generated/course-client';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({enabled:vi.fn(()=>true),writer:vi.fn(async()=>{}),seriesWriter:vi.fn(async()=>{}),reader:vi.fn(async()=>{}),seriesCatalog:vi.fn(async()=>{})}));
vi.mock('../../scripts/sports-production-scope.mjs',()=>({sportsProductionEnabled:m.enabled,sportsProductionRulesEnvironment:()=>true}));
vi.mock('../../scripts/sports-production-readiness.mjs',()=>({verifySportsProductionReadiness:m.writer,verifySportsBookingReadiness:m.reader}));
vi.mock('../../scripts/sports-permanent-readiness.mjs',()=>({verifySportsPermanentReadiness:m.seriesWriter,verifySportsPermanentBookingCatalog:m.seriesCatalog}));
import {assertSportsBookingReadReady,assertSportsProductionReady} from '@/server/services/sports-production-readiness';
beforeEach(()=>{vi.clearAllMocks();m.enabled.mockReturnValue(true);});
const tx=()=>({$queryRawUnsafe:vi.fn(async()=>[]),$executeRawUnsafe:vi.fn(async()=>0)}) as unknown as Pick<Prisma.TransactionClient, '$queryRawUnsafe' | '$executeRawUnsafe'>;
it('booking validates the reader and series catalog without requiring scheduling privileges',async()=>{
 const client=tx();await assertSportsBookingReadReady(client,'store');
 expect(client.$executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL search_path=pg_catalog,public');
 expect(m.reader).toHaveBeenCalledOnce();expect(m.seriesCatalog).toHaveBeenCalledOnce();
 expect(m.writer).not.toHaveBeenCalled();expect(m.seriesWriter).not.toHaveBeenCalled();
});
it('scheduling retains both original writer readiness checks',async()=>{
 await assertSportsProductionReady(tx(),'store');
 expect(m.writer).toHaveBeenCalledOnce();expect(m.seriesWriter).toHaveBeenCalledOnce();
 expect(m.reader).not.toHaveBeenCalled();expect(m.seriesCatalog).not.toHaveBeenCalled();
});
it('does not add production checks to an environment where they were not enabled',async()=>{
 m.enabled.mockReturnValue(false);const client=tx();await assertSportsBookingReadReady(client,'store');
 expect(client.$executeRawUnsafe).not.toHaveBeenCalled();expect(m.reader).not.toHaveBeenCalled();
});
