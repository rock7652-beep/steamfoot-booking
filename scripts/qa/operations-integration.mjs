// Disposable local full-stack acceptance; never imports deployed environment files.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
const env=Object.fromEntries(['PATH','HOME','TMPDIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','CODEX_PROXY_CERT'].flatMap(key=>process.env[key]?[[key,process.env[key]]]:[]));
Object.assign(env,{NODE_ENV:'development',SPORTS_LIVE_FLOW_QA:'1',DATABASE_URL:'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test',DIRECT_URL:'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test',AUTH_URL:'http://localhost:3107',NEXTAUTH_URL:'http://localhost:3107',AUTH_TRUST_HOST:'true',AUTH_SECRET:'disposable-operations-acceptance-only',BEAUTY_MODULE_ENABLED:'1',NEXT_TELEMETRY_DISABLED:'1'});
assertSportsLiveFlowQaEnvironment(env);
for(const name of ['.env','.env.local','.env.development','.env.development.local'])if(existsSync(name))throw Error('Ambient environment files forbidden');
const commands={init:['node_modules/tsx/dist/cli.mjs','scripts/qa/youngsky-settings-integration-seed.ts'],seed:['node_modules/tsx/dist/cli.mjs','scripts/qa/operations-integration-seed.ts'],schema:['node_modules/tsx/dist/cli.mjs','scripts/qa/operations-integration-seed.ts','--schema-only'],fixtures:['node_modules/tsx/dist/cli.mjs','scripts/qa/operations-integration-seed.ts','--steam-purchase'],beautyFixture:['node_modules/tsx/dist/cli.mjs','scripts/qa/operations-integration-seed.ts','--beauty-refund'],writes:['scripts/qa/operations-integration-write-browser.mjs'],legacy:['scripts/qa/operations-legacy-link-browser.mjs'],amounts:['scripts/qa/operations-amounts-browser.mjs'],dev:['node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3107'],browser:['scripts/qa/operations-integration-browser.mjs']};
if(!commands[process.argv[2]])throw Error('Expected init, seed, dev or browser');
if(['browser','writes','legacy','amounts'].includes(process.argv[2]))env.QA_PLAYWRIGHT_MODULE=createRequire(import.meta.url).resolve('playwright');
const child=spawn(process.execPath,[...commands[process.argv[2]],...(process.argv[2]==='writes'?process.argv.slice(3):[])],{env,stdio:'inherit'});
child.on('exit',code=>process.exitCode=code??1);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
