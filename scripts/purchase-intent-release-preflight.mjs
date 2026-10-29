// Build-only checks; callers own the authenticated connection and READ ONLY transaction.
export const BEAUTY_BASE_TABLES = [
 'BeautySetting','BeautyService','BeautyTechnician','BeautyPlan','BeautyCard','BeautyGroup',
 'BeautyAppointment','BeautyLedger','BeautyPayment','BeautySettlement','BeautyCommand',
 'BeautyEvent','BeautyPurchase','BeautyTransactionRevision',
];
export const BEAUTY_INTENT_COLUMNS = {
 BeautyPurchaseIntent: ['storeId','customerId','requestKey','status','fingerprint','cardId','actorUserId','createdAt','updatedAt'],
 BeautyOnlineConfirmIntent: ['storeId','requestKey','orderId'],
 BeautyCollectionIntent: ['storeId','requestKey','status','fingerprint','actorUserId','createdAt','updatedAt'],
 BeautyCollectionIntentItem: ['storeId','requestKey','appointmentId','active'],
 BeautyMemberPurchaseIntent: ['storeId','customerId','actorUserId','requestKey','status','fingerprint','purchaseId','createdAt','updatedAt'],
};
export function validateBeautySchema(rows, env) {
 const required = new Set(BEAUTY_BASE_TABLES), intents = Object.keys(BEAUTY_INTENT_COLUMNS);
 const approved = new Set([...required, ...intents]);
 const names = new Set(rows.map(row => row.relname));
 if (names.size !== rows.length || rows.some(row => !approved.has(row.relname) || row.relrowsecurity !== true) ||
     [...required].some(name => !names.has(name))) throw Error('Beauty schema/RLS not ready');
 const installed = intents.filter(name => names.has(name)).length;
 const enabled = ['BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED','BEAUTY_COLLECTION_INTENTS_ENABLED'].some(key => env[key] === '1');
 if ((installed !== 0 && installed !== intents.length) || (enabled && installed !== intents.length)) throw Error('Beauty intent schema not ready');
 return {schemaTables: names.size, intentsInstalled: installed === intents.length};
}
export async function purchaseIntentAccessPreflight(client, family) {
 if (!['beauty','course'].includes(family)) throw Error('Unknown purchase intent scope');
 const columns = family === 'beauty' ? BEAUTY_INTENT_COLUMNS : {
  CoursePurchaseIntent: ['storeId','customerId','requestKey','status','payloadHmac','purchaseId','acknowledgedAt','actorUserId','createdAt','updatedAt'],
 };
 for (const [table, fields] of Object.entries(columns)) {
  const access = await client.query(`SELECT c.relrowsecurity,
   has_table_privilege(current_user,c.oid,'SELECT') AS readable,
   has_table_privilege(current_user,c.oid,'INSERT') AS insertable,
   has_table_privilege(current_user,c.oid,'UPDATE') AS updatable,
   has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE') AS destructive,
   EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
    WHERE a.grantee=0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))) AS browser_access
   FROM pg_class c WHERE c.oid=to_regclass($1)`, [`public."${table}"`]);
  const row = access.rows[0], mutable = table !== 'BeautyOnlineConfirmIntent';
  if (!row || row.relrowsecurity !== true || row.readable !== true || row.insertable !== true ||
      row.updatable !== mutable || row.browser_access !== false || (family === 'beauty' && row.destructive !== false)) {
   throw Error('Purchase intent runtime privileges not verified');
  }
  // LIMIT 0 verifies actual column privileges without reading customer/financial rows.
  await client.query(`SELECT ${fields.map(field => `"${field}"`).join(',')} FROM public."${table}" LIMIT 0`);
 }
 return {tablesChecked: Object.keys(columns).length, readonly: true};
}
