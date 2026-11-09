// Explicitly isolated full-app acceptance; no deployed env files or credentials.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
const env=Object.fromEntries(['PATH','HOME','TMPDIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','CODEX_PROXY_CERT'].flatMap(key=>process.env[key]?[[key,process.env[key]]]:[]));
Object.assign(env,{NODE_ENV:'development',SPORTS_LIVE_FLOW_QA:'1',DATABASE_URL:'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test',DIRECT_URL:'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test',AUTH_URL:'http://localhost:3107',NEXTAUTH_URL:'http://localhost:3107',AUTH_TRUST_HOST:'true',AUTH_SECRET:'disposable-plan-session-adjustment-only',BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',NEXT_TELEMETRY_DISABLED:'1'});
assertSportsLiveFlowQaEnvironment(env);
for(const name of ['.env','.env.local','.env.development','.env.development.local'])if(existsSync(name))throw Error('Ambient environment files forbidden');
const commands={dev:['node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3107'],seed:['--import','tsx','scripts/qa/plan-session-adjustment-seed.ts'],browser:['--import','tsx','scripts/qa/plan-session-adjustment-login-browser.mjs']};
const args=commands[process.argv[2]];if(!args)throw Error('Expected dev, seed or browser');
const child=spawn(process.execPath,args,{env,stdio:'inherit'});
child.on('exit',code=>process.exitCode=code??1);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
