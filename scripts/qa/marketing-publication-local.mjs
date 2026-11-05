import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { MARKETING_LOCAL_QA_DATABASE,MARKETING_LOCAL_QA_ORIGIN,MARKETING_LOCAL_QA_SECRET,
  isMarketingPublicationLocalQa } from '../marketing-publication-local-qa.mjs';

const mode=process.argv.slice(2).join(' ');
if(!['--build','--serve'].includes(mode))throw Error('Only --build or --serve supported; local public-page QA only');
const root=resolve(import.meta.dirname,'../..');
for(const file of ['.env','.env.local','.env.production','.env.production.local']){
  if(existsSync(join(root,file)))throw Error('Use a clean checkout without real environment files for local marketing QA');
}
// Deliberately do not inherit credentials, provider metadata, flags or proxy secrets.
const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:process.env.LANG??'C.UTF-8',
  NODE_ENV:'production',NODE_OPTIONS:'--max-old-space-size=8192',NEXT_TELEMETRY_DISABLED:'1',
  MARKETING_PUBLICATION_LOCAL_QA:'1',AUTH_URL:MARKETING_LOCAL_QA_ORIGIN,NEXTAUTH_URL:MARKETING_LOCAL_QA_ORIGIN,
  AUTH_SECRET:MARKETING_LOCAL_QA_SECRET,AUTH_TRUST_HOST:'true',DATABASE_URL:MARKETING_LOCAL_QA_DATABASE,DIRECT_URL:MARKETING_LOCAL_QA_DATABASE,
  SUBSCRIPTION_REFERRALS_ENABLED:'false',CONSULTATION_HQ_ENABLED:'false'};
isMarketingPublicationLocalQa(env);
const child=mode==='--build'?spawn('npm',['run','build'],{cwd:root,env,stdio:'inherit'}):
  spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'start','-H','localhost','-p','3117'],{cwd:root,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Local marketing QA process failed');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
