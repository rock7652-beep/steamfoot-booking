import {it,expect} from 'vitest';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,relative,dirname} from 'node:path';
import {pruneReferralQaTrace,prepareReferralQaEngineFiles} from '../../scripts/prune-referral-qa-trace.mjs';
it('only removes review docs, artifacts and QA scripts, preserving runtime, engines, certificates and unknown paths',()=>{
 const root=mkdtempSync(join(tmpdir(),'referral-trace-'));
 try{const trace=join(root,'.next/server/middleware.js.nft.json');mkdirSync(dirname(trace),{recursive:true});const paths=['docs/review.txt','artifacts/screen.png','scripts/qa/browser.mjs','scripts/certs/supabase-root-2021.crt','generated/course-client/engine.node','node_modules/@prisma/client/runtime.js','src/lib/auth.ts'];
 for(const p of paths){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fixture');}
 const files=paths.map(p=>relative(dirname(trace),join(root,p)));writeFileSync(trace,JSON.stringify({version:1,files}));
 const before=readFileSync(trace,'utf8');expect(pruneReferralQaTrace(trace,root).removed).toBe(3);expect(readFileSync(trace,'utf8')).toBe(before);
 const result=pruneReferralQaTrace(trace,root,true);expect(result.kept).toBe(4);expect(JSON.parse(readFileSync(trace,'utf8')).files).toEqual(files.slice(3));expect(result.runtimeDependenciesPreserved).toBe(true);
 }finally{rmSync(root,{recursive:true,force:true});}
});

it('backs up unused engines while retaining all review sources and PostgreSQL engines',()=>{
 const root=mkdtempSync(join(tmpdir(),'referral-build-'));let archive='';
 try{for(const p of ['docs/review.txt','artifacts/test.json','scripts/qa/test.mjs','scripts/certs/root.crt','src/lib/auth.ts','node_modules/@prisma/client/runtime/query_engine_bg.mysql.wasm-base64.js','node_modules/@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js']){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fixture');}
 for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma']){mkdirSync(dirname(join(root,schema)),{recursive:true});writeFileSync(join(root,schema),'datasource db { provider = "postgresql" }');}
 const result=prepareReferralQaEngineFiles(root);archive=result.archive;expect(result.moved).toEqual(['unused-provider-engine/query_engine_bg.mysql.wasm-base64.js']);expect(readFileSync(join(archive,'query_engine_bg.mysql.wasm-base64.js'),'utf8')).toBe('fixture');expect(readFileSync(join(root,'node_modules/@prisma/client/runtime/query_engine_bg.mysql.wasm-base64.js'),'utf8')).toContain('only supports PostgreSQL');expect(existsSync(join(root,'node_modules/@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js'))).toBe(true);expect(archive.startsWith(root)).toBe(false);expect(existsSync(join(root,'docs'))).toBe(true);expect(readFileSync(join(root,'docs/review.txt'),'utf8')).toBe('fixture');expect(readFileSync(join(root,'artifacts/test.json'),'utf8')).toBe('fixture');expect(readFileSync(join(root,'scripts/qa/test.mjs'),'utf8')).toBe('fixture');expect(readFileSync(join(root,'src/lib/auth.ts'),'utf8')).toBe('fixture');expect(existsSync(join(root,'scripts/certs/root.crt'))).toBe(true);
 }finally{rmSync(root,{recursive:true,force:true});if(archive)rmSync(archive,{recursive:true,force:true});}
});

it('excludes only non-PostgreSQL WASM providers while preserving PostgreSQL and native engines',()=>{
 const root=mkdtempSync(join(tmpdir(),'referral-engines-'));try{const trace=join(root,'trace.nft.json');const files=['node_modules/@prisma/client/runtime/query_engine_bg.mysql.wasm-base64.js','node_modules/@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js','node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node'];for(const f of files){mkdirSync(dirname(join(root,f)),{recursive:true});writeFileSync(join(root,f),'fixture');}writeFileSync(trace,JSON.stringify({version:1,files}));expect(pruneReferralQaTrace(trace,root,true).removed).toBe(1);expect(JSON.parse(readFileSync(trace,'utf8')).files).toEqual(files.slice(1));}finally{rmSync(root,{recursive:true,force:true});}
});
