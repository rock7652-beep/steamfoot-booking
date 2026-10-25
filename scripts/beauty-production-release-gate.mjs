import {beautyProductionReleasePreflight} from './beauty-production-release-preflight.mjs';
// Preserve all existing build guards; add this check before any migration step.
if(process.env.VERCEL_ENV==='production'&&process.env.BEAUTY_MODULE_ENABLED==='1'){
 try{
  await beautyProductionReleasePreflight();
  console.info('[beauty-production-preflight] runtime_login=true tls=true schema_tables=14 readonly=true migration_target_absent=true');
 }catch{
  console.error('[beauty-production-preflight] blocked; no migration or deployment promotion performed');
  process.exitCode=1;
 }
}
