import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {assertBeautySharedPagesLocalQaEnvironment} from '../../beauty-shared-pages-local-qa-scope.mjs';
const local=JSON.parse(readFileSync('/tmp/monthly-live-env.json','utf8'));
assertBeautySharedPagesLocalQaEnvironment({...process.env,...local});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3123'],{env:{...process.env,...local,NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--max-old-space-size=8192'},stdio:'inherit'});
process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',code=>{process.exitCode=code??1;});
