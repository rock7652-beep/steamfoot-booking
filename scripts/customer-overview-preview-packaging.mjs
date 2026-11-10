// Build artifact cleanup only; exact isolated Preview, no DB access or migrations.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertCompactOperationsPreview,CUSTOMER_OVERVIEW_PREVIEW_BRANCH} from './compact-operations-preview-scope.mjs';
import {pruneProductionTraces} from './production-postgres-packaging.mjs';
export function assertCustomerOverviewPackaging(env,root){
 if(env.VERCEL_GIT_COMMIT_REF!==CUSTOMER_OVERVIEW_PREVIEW_BRANCH||!assertCompactOperationsPreview(env)||!/^\/vercel\/path[0-9]+$/.test(root))throw Error('Customer overview packaging requires its exact isolated Vercel build sandbox');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=resolve(import.meta.dirname,'..');
 if(process.argv.slice(2).join(' ')!=='--prune')throw Error('Explicit --prune required');
 assertCustomerOverviewPackaging(process.env,root);
 // The same conservative operation already verified for the PostgreSQL runtime:
 // keep docs/JSON/QA sources, runtime images, TLS certs and PostgreSQL engines.
 console.log('[customer-overview-preview-packaging]',JSON.stringify(pruneProductionTraces(root)));
}
