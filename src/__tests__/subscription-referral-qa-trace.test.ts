import {it,expect} from 'vitest';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,relative,dirname} from 'node:path';
import {pruneReferralQaTrace} from '../../scripts/prune-referral-qa-trace.mjs';
it('only removes review docs, artifacts and QA scripts, preserving runtime, engines, certificates and unknown paths',()=>{
 const root=mkdtempSync(join(tmpdir(),'referral-trace-'));
 try{const trace=join(root,'.next/server/middleware.js.nft.json');mkdirSync(dirname(trace),{recursive:true});const paths=['docs/review.txt','artifacts/screen.png','scripts/qa/browser.mjs','scripts/certs/supabase-root-2021.crt','generated/course-client/engine.node','node_modules/@prisma/client/runtime.js','src/lib/auth.ts'];
 for(const p of paths){mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),'fixture');}
 const files=paths.map(p=>relative(dirname(trace),join(root,p)));writeFileSync(trace,JSON.stringify({version:1,files}));
 const before=readFileSync(trace,'utf8');expect(pruneReferralQaTrace(trace,root).removed).toBe(3);expect(readFileSync(trace,'utf8')).toBe(before);
 const result=pruneReferralQaTrace(trace,root,true);expect(result.kept).toBe(4);expect(JSON.parse(readFileSync(trace,'utf8')).files).toEqual(files.slice(3));expect(result.runtimeDependenciesPreserved).toBe(true);
 }finally{rmSync(root,{recursive:true,force:true});}
});
