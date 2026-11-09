import "server-only";

// Enabling Prisma relationJoins changes its default. Keep all existing reads
// AND mutations on their original query strategy; only reviewed call sites
// explicitly opt in to a join. Raw SQL, aggregates and transaction boundaries
// are unaffected. Supported operations verified against generated Prisma 6.19.
const supported=new Set(["findUnique","findUniqueOrThrow","findFirst","findFirstOrThrow","findMany","create","update","upsert","delete"]);
type Args=Record<string,unknown>|undefined;
type Call={operation:string;args:Args;query:(args:Args)=>Promise<unknown>};
export function withExplicitRelationJoins<T extends object>(client:T):T{
  const extensible=client as T&{$extends(extension:object):T};
  return extensible.$extends({name:"explicit-relation-joins",query:{$allModels:{
    $allOperations({operation,args,query}:Call){
      return query(supported.has(operation)&&args?.relationLoadStrategy===undefined?{...args,relationLoadStrategy:"query"}:args);
    },
  }}});
}
