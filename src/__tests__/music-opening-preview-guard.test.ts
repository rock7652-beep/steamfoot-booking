import {readFileSync} from "node:fs";
import {expect,it,vi} from "vitest";
import {assertMusicOpeningPreviewEnvironment,isMusicOpeningDatabase,MUSIC_OPENING_BRANCH} from "../../scripts/music-opening-preview-scope.mjs";
import {assertMusicOpeningSchema,checkMusicOpeningSchema,MUSIC_OPENING_SCHEMA_SQL,musicOpeningConnectionFailure,readMusicOpeningSchemaConnection} from "../../scripts/music-opening-schema-check.mjs";
const direct="postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co/postgres";
const pooled="postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const env={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:MUSIC_OPENING_BRANCH,VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",DATABASE_URL:pooled,DIRECT_URL:direct};
const ready=()=>({columns_ready:true,native_default_ready:true,policy_default_ready:true,indexes_ready:true,fks_ready:true,rls_ready:true,client_access_blocked:true,no_client_policies:true,tenant_ready:true,checks:[
 "CHECK (musicOpeningTermKey IS NOT NULL AND musicOpeningSourceLessonKey IS NOT NULL AND musicOpeningLessonOrdinal IS NOT NULL AND musicOpeningLessonOrdinal >= 1 AND musicOpeningLessonOrdinal <= 100000 AND cardId IS NOT NULL AND customerId IS NOT NULL)",
 "CHECK (contentHash ~ '^[a-f0-9]{64}$')", "CHECK (jsonb_typeof(snapshot) = 'object')", "CHECK (teacherFeePolicy IN ('UNVERIFIED','MUSIC_V2_ORIGINAL_PRICE'))",
]});
it("reports only safe connection categories, never driver URLs or credentials",()=>{
 const secret="postgresql://postgres:secret@private.invalid/postgres";
 expect(musicOpeningConnectionFailure({errorCode:"P1001",message:secret},"direct").message).toContain("direct:P1001");
 expect(musicOpeningConnectionFailure({message:"Query engine could not locate "+secret},"pooled").message).toContain("pooled:ENGINE_UNAVAILABLE");
 expect(musicOpeningConnectionFailure({code:secret,message:secret},"pooled").message).toContain("pooled:UNKNOWN");
 expect(musicOpeningConnectionFailure({code:secret,message:secret},"pooled").message).not.toContain("secret");
});
it("accepts only the exact existing preview project and both connections",()=>{
 expect(isMusicOpeningDatabase(direct)).toBe(true);expect(isMusicOpeningDatabase(pooled)).toBe(true);
 expect(()=>assertMusicOpeningPreviewEnvironment(env)).not.toThrow();
});
it.each(["DATABASE_URL","DIRECT_URL"])("rejects missing, production and deceptive %s without any DB query",async key=>{
 for(const value of [undefined,"","postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co/postgres",direct.replace(".co/",".co.attacker.invalid/"),direct.replace("/postgres","/other")]) {
  const read=vi.fn();await expect(checkMusicOpeningSchema({...env,[key]:value},read)).rejects.toThrow();expect(read).not.toHaveBeenCalled();
 }
});
it.each(["VERCEL_ENV","VERCEL_GIT_COMMIT_REF","VERCEL_GIT_REPO_OWNER","VERCEL_GIT_REPO_SLUG"])("fails closed for missing or changed %s",async key=>{
 for(const value of [undefined,"production","main","wrong"]) {const read=vi.fn();await expect(checkMusicOpeningSchema({...env,[key]:value},read)).rejects.toThrow();expect(read).not.toHaveBeenCalled();}
});
it.each(["DATABASE_URL","DIRECT_URL"])("rejects query overrides in %s before any DB query",async key=>{
 for(const suffix of ["?host=db.qijlnhtpbintanzpxkvf.supabase.co","?%68ost=unapproved.invalid","?options=-csearch_path=other","?schema=other","?schema=public&schema=other","?schema=public&schema=public","?unknown=1","#ignored"]) {
  const read=vi.fn();await expect(checkMusicOpeningSchema({...env,[key]:direct+suffix},read)).rejects.toThrow();expect(read).not.toHaveBeenCalled();
 }
 expect(isMusicOpeningDatabase(pooled+"?pgbouncer=true&connection_limit=1&schema=public")).toBe(true);
});
it("requires catalog proof for both URLs, not a credential or allowlist flag alone",async()=>{
 const read=vi.fn().mockResolvedValue([ready()]);await checkMusicOpeningSchema(env,read);expect(read.mock.calls.map(call=>call[0])).toEqual([pooled,direct]);
});
it("retries only one cold pool lease timeout against the identical isolated target",async()=>{
 const failed={$queryRawUnsafe:vi.fn().mockRejectedValue({code:"P2024"}),$disconnect:vi.fn().mockResolvedValue(undefined)};
 const passed={$queryRawUnsafe:vi.fn().mockResolvedValue([ready()]),$disconnect:vi.fn().mockResolvedValue(undefined)};
 const create=vi.fn().mockReturnValueOnce(failed).mockReturnValueOnce(passed);
 expect(await readMusicOpeningSchemaConnection(pooled,create)).toEqual([ready()]);
 expect(create).toHaveBeenCalledTimes(2);expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
 const options=create.mock.calls[0][0];const url=new URL(options.datasources.db.url);
 expect(url.hostname).toBe(new URL(pooled).hostname);expect(url.username).toBe(new URL(pooled).username);
 expect(url.searchParams.get("connection_limit")).toBe("1");expect(url.searchParams.get("pool_timeout")).toBe("15");
 for(const client of [failed,passed]) {expect(client.$queryRawUnsafe).toHaveBeenCalledExactlyOnceWith(MUSIC_OPENING_SCHEMA_SQL);expect(client.$disconnect).toHaveBeenCalledOnce();}
});
it("fails closed after two timeouts and never creates a third client",async()=>{
 const client={$queryRawUnsafe:vi.fn().mockRejectedValue({code:"P2024"}),$disconnect:vi.fn().mockResolvedValue(undefined)};
 const create=vi.fn().mockReturnValue(client);
 await expect(readMusicOpeningSchemaConnection(pooled,create)).rejects.toThrow("pooled:P2024");
 expect(create).toHaveBeenCalledTimes(2);expect(client.$disconnect).toHaveBeenCalledTimes(2);
});
it("concurrent cold checks use independent one-statement clients and release every lease",async()=>{
 const clients=[0,1,2].map(index=>({$queryRawUnsafe:vi.fn().mockImplementation(async()=>{await Promise.resolve();if(index===0)throw {code:"P2024"};return [ready()];}),$transaction:vi.fn(),$disconnect:vi.fn().mockResolvedValue(undefined)}));
 const create=vi.fn().mockReturnValueOnce(clients[0]).mockReturnValueOnce(clients[1]).mockReturnValueOnce(clients[2]);
 const results=await Promise.all([readMusicOpeningSchemaConnection(pooled,create),readMusicOpeningSchemaConnection(pooled,create)]);
 expect(results).toEqual([[ready()],[ready()]]);expect(create).toHaveBeenCalledTimes(3);
 for(const client of clients){expect(client.$transaction).not.toHaveBeenCalled();expect(client.$queryRawUnsafe).toHaveBeenCalledOnce();expect(client.$disconnect).toHaveBeenCalledOnce();}
});
it.each(["P1000","P1001","P2010","P2028"])("does not retry non-lease failure %s",async code=>{
 const client={$queryRawUnsafe:vi.fn().mockRejectedValue({code}),$disconnect:vi.fn().mockResolvedValue(undefined)};
 const create=vi.fn().mockReturnValue(client);
 await expect(readMusicOpeningSchemaConnection(direct,create)).rejects.toThrow(`direct:${code}`);expect(create).toHaveBeenCalledOnce();expect(client.$disconnect).toHaveBeenCalledOnce();
});
it("rejects routing overrides before creating a client and does not retry bad schema",async()=>{
 const create=vi.fn();await expect(readMusicOpeningSchemaConnection(direct+"?host=other.invalid",create)).rejects.toThrow();expect(create).not.toHaveBeenCalled();
 const client={$queryRawUnsafe:vi.fn().mockResolvedValue([{...ready(),columns_ready:false}]),$disconnect:vi.fn().mockResolvedValue(undefined)};
 create.mockReturnValue(client);
 await expect(checkMusicOpeningSchema(env,url=>readMusicOpeningSchemaConnection(url,create))).rejects.toThrow("columns_ready");expect(create).toHaveBeenCalledOnce();
});
it.each(["columns_ready","native_default_ready","policy_default_ready","indexes_ready","fks_ready","rls_ready","client_access_blocked","no_client_policies","tenant_ready"])("blocks missing schema capability %s",field=>{
 expect(()=>assertMusicOpeningSchema([{...ready(),[field]:false}])).toThrow(field);
});
it("rejects missing constraint semantics and malformed query output",()=>{
 for(const rows of [[],null,[{}],[ready(),ready()],[{...ready(),checks:[]}],[{...ready(),checks:ready().checks.slice(1)}]])expect(()=>assertMusicOpeningSchema(rows)).toThrow();
});
it("schema query is read-only and never fetches learner records",()=>{
 expect(MUSIC_OPENING_SCHEMA_SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\s+(INTO|TABLE|FROM|INDEX|public)/i);
 expect(MUSIC_OPENING_SCHEMA_SQL).not.toContain('FROM public."Customer"');
});
it("guards run before the untouched migration runner and next build",()=>{
 const build=JSON.parse(readFileSync("package.json","utf8")).scripts.build as string;
 expect(build.startsWith("node scripts/music-opening-preflight.mjs && node scripts/ci-migrate.mjs &&")).toBe(true);
 expect(readFileSync("scripts/music-opening-preflight.mjs","utf8")).toContain("await runMusicOpeningSchemaPreflight()");
 expect(build).toContain("npm run generate:clients && next build");
 expect(JSON.parse(readFileSync("vercel.json","utf8")).git.deploymentEnabled).toEqual({[MUSIC_OPENING_BRANCH]:false});
 const startup=readFileSync("src/instrumentation.ts","utf8");expect(startup).toContain("await runMusicOpeningSchemaPreflight()");
 for(const file of ["src/lib/db.ts","src/lib/course-db.ts","src/lib/spa-db.ts"]) {
  const code=readFileSync(file,"utf8");expect(code.indexOf("assertMusicOpeningRuntimeIsolation();")).toBeLessThan(code.indexOf("new PrismaClient"));
 }
});
