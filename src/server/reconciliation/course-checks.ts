import "server-only";
import { courseTransaction } from "@/server/services/course-access";
import type { CheckResult } from "./engine";
/** One store-locked snapshot; never compare a purchase read before a concurrent refund. */
export async function checkCourseAccounts(storeId: string): Promise<CheckResult[]> {
  return courseTransaction(storeId, async (tx) => {
    const rows = await tx.$queryRaw<Array<{ code: string; checked: bigint; mismatches: bigint }>>`
      WITH purchase_checks AS (
        SELECT p.id, p.price, p.status, c.id AS cash_id, c.amount, c.type,
          EXISTS(SELECT 1 FROM "CoursePurchaseRefund" r WHERE r."purchaseId"=p.id AND r."storeId"=p."storeId") AS has_refund
        FROM "CoursePurchase" p LEFT JOIN "CashbookEntry" c ON c.id='course-purchase:'||p.id AND c."storeId"=p."storeId"
        WHERE p."storeId"=${storeId} AND p.status IN ('CONFIRMED','REFUNDED') AND p.price>0
      ), refund_checks AS (
        SELECT r.id, r.amount, p.price, p.status, c.id AS cash_id, c.amount AS cash_amount, c.type,
          (SELECT sum(x.amount) FROM "CoursePurchaseRefund" x WHERE x."purchaseId"=p.id AND x."storeId"=p."storeId") AS total_refund
        FROM "CoursePurchaseRefund" r JOIN "CoursePurchase" p ON p.id=r."purchaseId" AND p."storeId"=r."storeId"
        LEFT JOIN "CashbookEntry" c ON c.id='course-refund:'||r.id AND c."storeId"=r."storeId" WHERE r."storeId"=${storeId}
      ), card_checks AS (
        SELECT c.id,c.remaining,c."closedAt",
          COALESCE((SELECT sum(e.points) FROM "CoursePointEntry" e WHERE e."cardId"=c.id AND e."storeId"=c."storeId" AND e.kind='GRANT'),0)
          - COALESCE((SELECT sum(b."pointCost") FROM "CourseBooking" b WHERE b."cardId"=c.id AND b."storeId"=c."storeId" AND b.status='ATTENDED'),0)
          - COALESCE((SELECT sum(e.points) FROM "CoursePointEntry" e WHERE e."cardId"=c.id AND e."storeId"=c."storeId" AND e.kind IN ('REFUND','VOID')),0) AS expected,
          COALESCE((SELECT sum(b."pointCost") FROM "CourseBooking" b WHERE b."cardId"=c.id AND b."storeId"=c."storeId" AND b.status='RESERVED'),0) AS held
        FROM "CoursePointCard" c WHERE c."storeId"=${storeId}
      ), session_checks AS (
        SELECT s.id,s.capacity,s."cancelledAt", count(b.id) AS booked,count(b.id) FILTER(WHERE b.status='RESERVED') AS reserved FROM "CourseSession" s
        LEFT JOIN "CourseBooking" b ON b."sessionId"=s.id AND b."storeId"=s."storeId" AND b.status<>'CANCELLED'
        WHERE s."storeId"=${storeId} GROUP BY s.id
      )
      SELECT 'course_purchase_cash' AS code,count(*) AS checked,count(*) FILTER(WHERE cash_id IS NULL OR amount<>price OR type<>'INCOME' OR (status='REFUNDED' AND NOT has_refund)) AS mismatches FROM purchase_checks
      UNION ALL SELECT 'course_refund_cash',count(*),count(*) FILTER(WHERE cash_id IS NULL OR cash_amount<>amount OR type<>'EXPENSE' OR total_refund>price OR status<>'REFUNDED') FROM refund_checks
      UNION ALL SELECT 'course_card_balance',count(*),count(*) FILTER(WHERE remaining<>expected OR ("closedAt" IS NOT NULL AND remaining<>0)) FROM card_checks
      UNION ALL SELECT 'course_card_holds',count(*),count(*) FILTER(WHERE remaining<held OR ("closedAt" IS NOT NULL AND held<>0)) FROM card_checks
      UNION ALL SELECT 'course_capacity',count(*),count(*) FILTER(WHERE booked>capacity OR ("cancelledAt" IS NOT NULL AND reserved<>0)) FROM session_checks`;
    const names: Record<string, string> = {
      course_purchase_cash: "購買核帳與收入連動", course_refund_cash: "退款支出與實付上限",
      course_card_balance: "額度餘額與授予／出席／退款", course_card_holds: "預約占用與可用額度", course_capacity: "課程容量與取消狀態",
    };
    return rows.map((row) => ({ checkCode: row.code, checkName: names[row.code],
      status: Number(row.mismatches) === 0 ? "pass" : "mismatch",
      sources: { "已檢查筆數": Number(row.checked), "不一致筆數": Number(row.mismatches) },
      expected: "不一致筆數為 0；無資料時已檢查筆數為 0，不表示已走過交易驗收",
      debugPayload: { storeId, scope: "同店課程全期資料，單一交易鎖內查核", tolerance: 0 },
    }));
  });
}
