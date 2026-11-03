/** This capability is evaluated only after the caller authorizes a BEAUTY store. */
export function beautyModuleChargeRollout(env){
 return env.BEAUTY_CHARGE_RULES_SCOPE==='module'&&env.BEAUTY_CHARGE_RULES_ENABLED==='1'&&
  env.BEAUTY_MODULE_ENABLED==='1'&&env.BEAUTY_DATABASE_MODE==='dedicated'&&
  env.BEAUTY_DATABASE_ROLE==='steamfoot_beauty_prod_20261025'&&env.VERCEL==='1'&&
  env.VERCEL_ENV==='production'&&env.VERCEL_GIT_COMMIT_REF==='main'&&
  env.VERCEL_GIT_REPO_OWNER==='rock7652-beep'&&env.VERCEL_GIT_REPO_SLUG==='steamfoot-booking';
}
export function beautyStoreChargeRollout(storeId,env){
 if(!storeId||storeId!==storeId.trim()||env.BEAUTY_CHARGE_RULES_ENABLED!=='1')return false;
 const scope=env.BEAUTY_CHARGE_RULES_SCOPE;
 if(scope==='module')return beautyModuleChargeRollout(env);
 if(scope!==undefined&&scope!==''&&scope!=='stores')return false;
 return (env.BEAUTY_CHARGE_RULES_STORE_IDS??'').split(',').map(id=>id.trim()).includes(storeId);
}
