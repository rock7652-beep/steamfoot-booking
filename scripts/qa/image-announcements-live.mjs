// Start only a credential-free, loopback-only acceptance process. Never loads production env files.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { assertImageAnnouncementsAcceptance, IMAGE_ACCEPTANCE_DATABASE, IMAGE_ACCEPTANCE_ORIGIN } from '../image-announcements-acceptance-scope.mjs';
const env = Object.fromEntries(['PATH','HOME','TMPDIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','CODEX_PROXY_CERT'].flatMap(key => process.env[key] ? [[key,process.env[key]]] : []));
Object.assign(env, { NODE_ENV:'development', IMAGE_ANNOUNCEMENTS_ACCEPTANCE:'1', DATABASE_URL:IMAGE_ACCEPTANCE_DATABASE, DIRECT_URL:IMAGE_ACCEPTANCE_DATABASE, NEXTAUTH_URL:IMAGE_ACCEPTANCE_ORIGIN, AUTH_URL:IMAGE_ACCEPTANCE_ORIGIN, AUTH_TRUST_HOST:'true', AUTH_SECRET:'image-announcements-disposable-local-acceptance-secret' });
if (['build','start'].includes(process.argv[2])) Object.assign(env, { NODE_ENV:'production', IMAGE_ANNOUNCEMENTS_ACCEPTANCE_BUILD:'1' });
assertImageAnnouncementsAcceptance(env);
for (const name of ['.env','.env.local','.env.development','.env.development.local']) if (existsSync(name)) throw Error('Local acceptance refuses ambient env files');
const mode = process.argv[2];
const commands = { roles:['scripts/qa/image-announcements-live-browser.mjs','--roles-only'], start:['node_modules/next/dist/bin/next','start','--hostname','localhost','--port','3169'], build:['node_modules/next/dist/bin/next','build'], seed:['node_modules/tsx/dist/cli.mjs','scripts/qa/image-announcements-live-seed.ts'], dev:['node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3169'], browser:['scripts/qa/image-announcements-live-browser.mjs'] };
if (!commands[mode]) throw Error('Expected seed, dev, build, start, browser or roles');
const child=spawn(process.execPath,commands[mode],{env,stdio:'inherit'});
child.on('exit',code=>process.exitCode=code??1);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
