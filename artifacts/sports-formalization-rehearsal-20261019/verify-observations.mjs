import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {verifySportsPermanentReadiness} from '../../scripts/sports-permanent-readiness.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const observations=JSON.parse(readFileSync(`${root}/readiness-observations.json`));
const results=[];
for(const item of observations){
 let accepted=false;
 try {await verifySportsPermanentReadiness(async()=>item.rows);accepted=true;}catch{}
 assert.equal(accepted,item.expected,item.name);
 results.push({name:item.name,expected:item.expected,accepted,passed:true});
}
writeFileSync(`${root}/verifier-results.json`,JSON.stringify(results,null,2));
console.log(`${results.length} actual SQL observations passed application verifier`);
