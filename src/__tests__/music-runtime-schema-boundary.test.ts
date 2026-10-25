import { afterEach, expect, it, vi } from "vitest";
const preflight=vi.hoisted(()=>vi.fn());
vi.mock("../../scripts/music-opening-schema-check.mjs",()=>({runMusicOpeningSchemaPreflight:preflight}));
vi.mock("../../scripts/music-opening-preview-scope.mjs",()=>({MUSIC_OPENING_BRANCH:"feat/music-opening-state-20261007",assertMusicOpeningPreviewEnvironment:vi.fn()}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();preflight.mockReset();});
async function setup(){vi.stubEnv("VERCEL","1");vi.stubEnv("VERCEL_GIT_COMMIT_REF","feat/music-opening-state-20261007");return import("../lib/music-opening-preview-isolation");}
it("shares one readiness check across main/course and raw/model queries, before any business SQL",async()=>{
 let release!:()=>void;preflight.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
 const {withMusicOpeningRuntimeSchema}=await setup();let hook!:(p:{args:unknown;query:(a:unknown)=>unknown})=>Promise<unknown>;
 const client={$extends:vi.fn((e)=>{hook=e.query.$allOperations;return client;})};
 withMusicOpeningRuntimeSchema(client);const main=hook;
 withMusicOpeningRuntimeSchema(client);const course=hook;
 const sql=vi.fn().mockResolvedValue("ready");const reads=[main({args:{model:"Customer"},query:sql}),course({args:{raw:"SELECT"},query:sql})];
 await vi.waitFor(()=>expect(preflight).toHaveBeenCalledOnce());expect(sql).not.toHaveBeenCalled();release();
 expect(await Promise.all(reads)).toEqual(["ready","ready"]);expect(sql).toHaveBeenCalledTimes(2);
});
it("blocks SQL on failed capability checks and permits a fresh check on the next request",async()=>{
 preflight.mockRejectedValueOnce(new Error("schema mismatch")).mockResolvedValue(undefined);
 const {withMusicOpeningRuntimeSchema}=await setup();let hook!:(p:{args:unknown;query:(a:unknown)=>unknown})=>Promise<unknown>;
 const client={$extends:vi.fn((e)=>{hook=e.query.$allOperations;return client;})};withMusicOpeningRuntimeSchema(client);
 const sql=vi.fn().mockResolvedValue("ok");await expect(hook({args:{},query:sql})).rejects.toThrow("schema mismatch");expect(sql).not.toHaveBeenCalled();
 await expect(hook({args:{},query:sql})).resolves.toBe("ok");expect(preflight).toHaveBeenCalledTimes(2);
});

it("preserves SQL strings and bound values after Prisma clones a foreign-runtime Sql tag",async()=>{
 preflight.mockResolvedValue(undefined);const {withMusicOpeningRuntimeSchema}=await setup();
 let hook!:(p:{args:unknown;query:(a:unknown)=>unknown})=>Promise<unknown>;
 const client={$extends:vi.fn((e)=>{hook=e.query.$allOperations;return client;})};withMusicOpeningRuntimeSchema(client);
 const values=["store-qa",["synthetic-one","synthetic-two"],"x'); DROP TABLE test; --"];
 const strings=["SELECT * FROM sample WHERE store_id="," AND id=ANY(","::text[]) AND note=",""];
 const query=vi.fn().mockResolvedValue([]);await hook({args:{strings,values},query});
 const restored=query.mock.calls[0][0];expect(restored.sql).toBe("SELECT * FROM sample WHERE store_id=? AND id=ANY(?::text[]) AND note=?");
 expect(restored.values).toEqual(values);expect(restored.strings).toEqual(strings);
});
