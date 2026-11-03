import 'server-only';
import {beautyTransaction,requireBeauty} from '@/server/beauty/access';
import type {CheckResult} from './engine';
/** Read-only, same store lock as reservations, completion, collection and refunds. */
export async function checkBeautyAccounts(storeId:string):Promise<CheckResult[]>{
 await requireBeauty(storeId);
 return beautyTransaction({storeId,userId:null},async tx=>{
  const rows=await tx.$queryRaw<{code:string;checked:bigint;mismatches:bigint}[]>`
   WITH cards AS (
    SELECT c.*,COALESCE((SELECT sum(l.delta) FROM "BeautyLedger" l WHERE l."storeId"=c."storeId" AND l."cardId"=c.id),0) AS expected,
     (SELECT count(*) FROM "BeautyAppointment" b WHERE b."storeId"=c."storeId" AND b."cardId"=c.id AND b.status='RESERVED') AS held
    FROM "BeautyCard" c WHERE c."storeId"=${storeId}
   ), appointments AS (
    SELECT b.*,COALESCE((SELECT sum(l.delta) FROM "BeautyLedger" l WHERE l."storeId"=b."storeId" AND l."appointmentId"=b.id),0) AS movement
    FROM "BeautyAppointment" b WHERE b."storeId"=${storeId} AND b."cardId" IS NOT NULL
   ), payments AS (
    SELECT p.*,m."voidedAt" AS corrected_voided_at,c.id AS cash_id,c.amount AS cash_amount,c.type::text AS cash_type,c."paymentMethod"::text AS cash_method,v.amount AS void_amount,v.type::text AS void_type,v."entryDate" AS void_date,c."entryDate" AS cash_date,
     o.amount AS sale_amount,o.kind AS sale_kind,
     (SELECT -sum(r.amount) FROM "BeautyPayment" r WHERE r."storeId"=p."storeId" AND r."originalPaymentId"=p."originalPaymentId" AND r.kind='REFUND') AS total_refund
    FROM "BeautyPayment" p LEFT JOIN LATERAL (SELECT "voidedAt" FROM "BeautyTransactionRevision" m WHERE m."storeId"=p."storeId" AND m."transactionId"=p.id ORDER BY revision DESC LIMIT 1) m ON true LEFT JOIN "CashbookEntry" c ON c."storeId"=p."storeId" AND c.id='beauty:'||p.id
    LEFT JOIN "CashbookEntry" v ON v."storeId"=p."storeId" AND v.id='beauty-void:'||p.id
    LEFT JOIN "BeautyPayment" o ON o."storeId"=p."storeId" AND o.id=p."originalPaymentId"
    WHERE p."storeId"=${storeId} AND p.kind IN ('SALE','REFUND')
   ), resource_conflicts AS (
    SELECT a.id FROM "BeautyAppointment" a JOIN "BeautyAppointment" b ON a."storeId"=b."storeId" AND a.id<b.id
     AND a.status='RESERVED' AND b.status='RESERVED' AND a."startsAt"<b."occupiedEndsAt" AND b."startsAt"<a."occupiedEndsAt"
     AND (a."technicianId"=b."technicianId" OR a."locationId"=b."locationId") WHERE a."storeId"=${storeId}
   )
   SELECT 'beauty_balance' AS code,count(*) AS checked,count(*) FILTER(WHERE remaining<>expected OR ("closedAt" IS NOT NULL AND remaining<>0)) AS mismatches FROM cards
   UNION ALL SELECT 'beauty_holds',count(*),count(*) FILTER(WHERE held>remaining OR ("closedAt" IS NOT NULL AND held>0)) FROM cards
   UNION ALL SELECT 'beauty_debit',count(*),count(*) FILTER(WHERE movement<>CASE WHEN debit THEN -1 ELSE 0 END) FROM appointments
   UNION ALL SELECT 'beauty_cash',count(*),count(*) FILTER(WHERE (kind='SALE' AND (amount<0 OR (corrected_voided_at IS NOT NULL AND amount<>0 AND (void_amount IS DISTINCT FROM amount OR void_type IS DISTINCT FROM 'EXPENSE' OR void_date IS DISTINCT FROM cash_date)))) OR (kind='REFUND' AND (amount>=0 OR sale_kind IS DISTINCT FROM 'SALE' OR total_refund>sale_amount)) OR (amount<>0 AND (cash_id IS NULL OR cash_amount<>abs(amount) OR cash_type<>CASE WHEN amount>0 THEN 'INCOME' ELSE 'EXPENSE' END OR cash_method<>CASE WHEN method='CASH' THEN 'CASH' ELSE 'OTHER' END))) FROM payments
   UNION ALL SELECT 'beauty_resources',(SELECT count(*) FROM "BeautyAppointment" WHERE "storeId"=${storeId} AND status='RESERVED'),count(*) FROM resource_conflicts`;
  const names:Record<string,string>={beauty_balance:'方案餘額與帳本',beauty_holds:'預約占用與可用次數',beauty_debit:'服務扣次與帳本',beauty_cash:'收退款與收支帳',beauty_resources:'技師與位置時段衝突'};
  return rows.map(row=>({checkCode:row.code,checkName:names[row.code],status:Number(row.mismatches)===0?'pass':'mismatch',sources:{'已檢查筆數':Number(row.checked),'不一致筆數':Number(row.mismatches)},expected:'不一致筆數為 0；無資料不代表已完成業務驗收',debugPayload:{storeId,scope:'同店全期資料，單一交易鎖內唯讀查核',tolerance:0}}));
 });
}
