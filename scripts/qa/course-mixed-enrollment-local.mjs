/** Run from repository root. Own loopback DB only; always clean up owned resources. */
import {spawn,spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const name='course-mixed-enrollment-local-qa';
const dockerEnv={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
function docker(args){return spawnSync('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,encoding:'utf8'});}
assert.notEqual(docker(['inspect',name]).status,0,'Existing container must be inspected and cleaned up by its owner first');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','NODE_PATH','LANG','TMPDIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','NODE_EXTRA_CA_CERTS'].includes(key)));
Object.assign(env,{NODE_ENV:'development',DATABASE_URL:'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test',DIRECT_URL:'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test',AUTH_URL:'http://localhost:3107',NEXTAUTH_URL:'http://localhost:3107',AUTH_SECRET:randomBytes(32).toString('hex'),SPORTS_LIVE_FLOW_QA:'1',SPORTS_REDESIGN_STAGING:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',CONSULTATION_PREVIEW_INTAKE_ENABLED:'false',NEXT_PUBLIC_BUILD_ENV:'staging'});
writeFileSync('/tmp/mixed-local-env.json',JSON.stringify(env),{mode:0o600});
const out='/tmp/mixed-local-acceptance';mkdirSync(out,{recursive:true});
function run(command,args,input){const r=spawnSync(command,args,{env,input,encoding:'utf8',maxBuffer:20*1024*1024});if(r.status!==0)throw Error(command+' failed: '+r.stderr.slice(-1800)+r.stdout.slice(-1800));return r.stdout;}
let container,server;
try{
 const created=docker(['run','-d','--name',name,'--label','codex.task=course-mixed-enrollment-local-qa','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=sports_live_flow_test','-p','127.0.0.1:55438:5432','postgres:16-alpine']);assert.equal(created.status,0,created.stderr);container=created.stdout.trim();
 for(let n=0;n<40;n++){if(docker(['exec',name,'pg_isready','-U','postgres']).status===0)break;if(n===39)throw Error('Local PostgreSQL did not become ready');await new Promise(r=>setTimeout(r,250));}
 run('node_modules/.bin/prisma',['db','push','--skip-generate']);
 const ddl=run('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','course-prisma/schema.prisma','--script']);
 run('node_modules/.bin/prisma',['db','execute','--schema','course-prisma/schema.prisma','--stdin'],ddl);
 console.log(run('node_modules/.bin/tsx',['scripts/qa/course-mixed-enrollment-local-seed.ts']).trim());
 server=spawn('node',['node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3107'],{env,detached:true,stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',b=>{log+=b;writeFileSync(out+'/server.log',log,{mode:0o600});});server.stderr.on('data',b=>{log+=b;writeFileSync(out+'/server.log',log,{mode:0o600});});
 let ready=false;
 for(let n=0;n<60;n++){if(server.exitCode!==null)throw Error('Local Next server exited');try{const response=await fetch('http://localhost:3107/hq/login');if(response.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Local app must become ready');
 for(const kind of ['sports','music']){
  const result=await new Promise((resolve,reject)=>{const child=spawn('node',['scripts/qa/course-mixed-enrollment-local-browser.mjs',kind,'save'],{env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(Error(output.slice(-2500))));});console.log(result.trim());
  if(process.env.COURSE_QA_LIFECYCLE==='1'){const life=await new Promise((resolve,reject)=>{const child=spawn('node',['scripts/qa/course-mixed-enrollment-lifecycle.mjs',kind],{env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(Error(output.slice(-3000))));});console.log(life.trim());}
 }
 writeFileSync(out+'/server.log',log,{mode:0o600});
 console.log('Both authenticated mixed course flows passed; production untouched.');
}finally{
 if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}}
 if(container){const removed=docker(['rm','-f',container]);if(removed.status!==0)throw Error('Owned QA container cleanup failed');}
}
