import {expect,it,vi} from 'vitest';
import {withExplicitRelationJoins} from '@/lib/explicit-relation-joins';
type Args=Record<string,unknown>|undefined;
type Call={operation:string;args:Args;query:(args:Args)=>Promise<unknown>};
function fixture(){
 let handler!:(c:Call)=>Promise<unknown>;
 const result={extended:true};const client={$extends:vi.fn((extension:{query:{$allModels:{$allOperations:(c:Call)=>Promise<unknown>}}})=>{handler=extension.query.$allModels.$allOperations;return result})};
 expect(withExplicitRelationJoins(client)).toBe(result);
 return {call:(operation:string,args:Args)=>{const query=vi.fn(async(value:Args)=>value);return {query,result:handler({operation,args,query})}}};
}
it.each(['findUnique','findUniqueOrThrow','findFirst','findFirstOrThrow','findMany','create','update','upsert','delete'])('keeps %s on the previous query strategy unless explicitly selected',async operation=>{
 const f=fixture(),args={where:{id:'local'},select:{id:true,child:{select:{id:true}}},data:{amount:350}};
 const {result}=f.call(operation,args);expect(await result).toEqual({...args,relationLoadStrategy:'query'});expect(args).not.toHaveProperty('relationLoadStrategy');
});
it('preserves an explicitly reviewed join and invalid values for normal Prisma validation',async()=>{
 const f=fixture();for(const mode of ['join','query',null]){const args={where:{id:'local'},relationLoadStrategy:mode};expect(await f.call('findFirst',args).result).toBe(args)}
});
it.each(['count','aggregate','groupBy','createMany','updateMany','createManyAndReturn','updateManyAndReturn','deleteMany'])('does not inject unsupported relation options into %s',async operation=>{
 const f=fixture(),args={where:{storeId:'local'},data:{points:1}};expect(await f.call(operation,args).result).toBe(args);
});
it('supports a no-argument findMany without changing its unfiltered behavior',async()=>expect(await fixture().call('findMany',undefined).result).toEqual({relationLoadStrategy:'query'}));
