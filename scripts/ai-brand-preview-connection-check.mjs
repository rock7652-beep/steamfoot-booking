// Read-only, exact AI Preview only. Never prints a URL, password, token or raw error.
import { brandPreviewWriteWindow } from './ai-brand-preview-write-window.mjs';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { beautyProductionCaPath as supabaseCaPath, verifyBeautyProductionCa as verifySupabaseCa } from './beauty-production-ca.mjs';
import { claimsAiPreview, assertAiPreview, resolveAiPreviewDatabaseUrl, AI_PREVIEW_DATABASE_ROLE } from './ai-digital-butler-preview-scope.mjs';
/** @param {Readonly<Record<string,string|undefined>>} [env] */
export async function checkBrandPreviewConnection(env=process.env, factory) {
  if(!claimsAiPreview(env))return {skipped:true};
  assertAiPreview(env);
  if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||(brandPreviewWriteWindow(env).configured&&!brandPreviewWriteWindow(env).valid))throw Error('AI_BRAND_PREFLIGHT_UNEXPECTED_WRITE_OR_TLS_CONFIG');
  const url=new URL(resolveAiPreviewDatabaseUrl(env.DATABASE_URL,env));
  // pg connection-string ssl parameters can override explicit SSL settings; remove all of them.
  for(const key of ['sslmode','sslaccept','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
  verifySupabaseCa();
  const ca=readFileSync(supabaseCaPath(),'utf8');
  const create=factory??(async options=>{const {Client}=await import('pg');return new Client(options);});
  const client=await create({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca},connectionTimeoutMillis:10_000,query_timeout:10_000,application_name:'steamfoot-ai-brand-preview-preflight'});
  try {
    await client.connect();
    if(client.connection?.stream?.authorized!==true||client.connection?.stream?.encrypted!==true)throw Error('AI_BRAND_PREFLIGHT_TLS_NOT_VERIFIED');
    await client.query('BEGIN READ ONLY');
    const {rows}=await client.query(`SELECT current_user AS role,current_setting('transaction_read_only') AS readonly,
      (SELECT stopped FROM public."AiButlerControl" WHERE id='global') AS stopped,
      (SELECT count(*)::int FROM public."AiButlerSetting" WHERE "storeId" IN('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music') AND setting->>'enabled'='false') AS disabled_stores,
      (SELECT status FROM public."AiBrandGrant" WHERE "serviceId"='ai-preview-brand-steamfoot') AS brand_grant,
      (SELECT setting->>'enabled' FROM public."AiBrandSetting" WHERE "serviceId"='ai-preview-brand-steamfoot') AS brand_enabled,
      (SELECT published IS NULL FROM public."AiBrandKnowledgeDocument" WHERE "serviceId"='ai-preview-brand-steamfoot') AS unpublished,
      (SELECT total FROM public.ai_owner_global_totals()) AS total,
      (SELECT concurrent FROM public.ai_owner_global_totals()) AS concurrent,
      COALESCE(has_function_privilege(current_user,to_regprocedure('public.redact_audit_json(jsonb,integer)'),'EXECUTE'),false) AS audit_redaction_ready`);
    const row=rows[0];
    if(rows.length!==1||row.role!==AI_PREVIEW_DATABASE_ROLE||row.readonly!=='on'||row.stopped!==true||row.disabled_stores!==4||row.brand_grant!=='HIDDEN'||row.brand_enabled!=='false'||row.unpublished!==true||!/^\d+$/.test(row.total)||row.concurrent!=='0')throw Error('AI_BRAND_PREFLIGHT_STATE_MISMATCH');
    if(brandPreviewWriteWindow(env).configured&&row.audit_redaction_ready!==true)throw Error('AI_BRAND_PREFLIGHT_AUDIT_NOT_READY');
    await client.query('COMMIT');
    return {scopeVerified:true,roleVerified:true,tlsVerified:true,readonly:true,globalStopped:true,disabledStores:4,brandHidden:true,brandDisabled:true,unpublished:true,totalMicros:row.total,concurrent:row.concurrent};
  } finally { await client.end(); }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  checkBrandPreviewConnection().then(result=>console.info('[ai-brand-preflight]',JSON.stringify(result))).catch(error=>{
    const message=error instanceof Error?error.message:'';
    const code=message.startsWith('AI_BRAND_PREFLIGHT_')?message:['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','ECONNREFUSED','ETIMEDOUT'].includes(error?.code)?error.code:'CONNECTION_OR_SCOPE_FAILED';
    console.error('[ai-brand-preflight] failed',JSON.stringify({code}));process.exitCode=1;
  });
}
