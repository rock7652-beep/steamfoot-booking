/** Launch only the guarded local production build/runtime; never deploy. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {assertBeautyProductionQaEnvironment} from '../beauty-production-qa-scope.mjs';
const mode=process.argv[2];
if(!['build','start','seed','browser'].includes(mode))throw Error('Expected build, start, seed or browser');
const env={...process.env,...JSON.parse(readFileSync('/tmp/beauty-production-qa/env.json','utf8'))};
assertBeautyProductionQaEnvironment(env);
mkdirSync('/tmp/beauty-production-qa',{recursive:true});
if(mode==='build')writeFileSync(new URL('../../tsconfig.beauty-production-qa.json',import.meta.url),readFileSync(new URL('../../tsconfig.json',import.meta.url)));
const command=mode==='build'?'npm':process.execPath;
const args=mode==='build'?['run','build']:mode==='start'?['node_modules/next/dist/bin/next','start','--hostname',new URL(env.AUTH_URL).hostname,'--port',new URL(env.AUTH_URL).port]:['scripts/qa/beauty-production-'+mode+'.mjs'];
const started=Date.now(),p=spawn(command,args,{cwd:new URL('../..',import.meta.url),env,stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>p.kill(signal));
p.on('exit',(code,signal)=>{if(mode==='build')writeFileSync('/tmp/beauty-production-qa/build-result.json',JSON.stringify({passed:code===0,exitCode:code,signal,durationMs:Date.now()-started,productionRuntime:true,moduleEnabled:false,hosted:false,migrationsSkipped:true}));process.exitCode=code??1;});
