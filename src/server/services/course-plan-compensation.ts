import 'server-only';
import type {Prisma} from '../../../generated/course-client';
/** Captured once with a new/reassigned class. Old classes never read live settings.
 * Per-plan keys prevent equal-priced plans from sharing an individual override.
 */
export async function captureTeachingPlanFees(tx:Pick<Prisma.TransactionClient,'$executeRaw'>,storeId:string,sessionIds:string[]|null,requestKey:string|null=null){
 if(sessionIds?.length===0)return;
 await tx.$executeRaw`
 UPDATE "CourseCompensationSnapshot" snap
 SET rule=snap.rule || jsonb_build_object('planRules',captured.rules,'planRuleVersion',1)
 FROM "CourseSession" session, LATERAL (
  SELECT jsonb_object_agg(plan.id,COALESCE(
   settings."subjectRules"->('plan:'||plan.id),
   item_default.rules->0,
   CASE WHEN plan."chargeSettings"->>'providerScope'='QUALIFIED' THEN NULL
    ELSE COALESCE(prior.rule->'tuitionRules'->plan."templateIds"[1],prior.rule - 'planRules' - 'planRuleVersion') END,
   '{"mode":"UNSET"}'::jsonb)) AS rules
  FROM "CourseTemplate" teaching
  JOIN "CoursePointPlan" plan ON plan."storeId"=teaching."storeId" AND (
   plan."templateIds" && ARRAY(SELECT v.id FROM "CourseTemplate" v WHERE v."storeId"=teaching."storeId" AND v."musicSubjectId"=teaching."musicSubjectId")
   OR plan."sportsSubjectId"=teaching."musicSubjectId" OR teaching."musicSubjectId"=ANY(plan."sportsSubjectIds")
   OR EXISTS (SELECT 1 FROM "CoursePointCard" card WHERE card."storeId"=plan."storeId" AND card."planId"=plan.id
    AND (card."templateIds" && ARRAY(SELECT old.id FROM "CourseTemplate" old WHERE old."storeId"=teaching."storeId" AND old."musicSubjectId"=teaching."musicSubjectId")
     OR card."sportsSubjectId"=teaching."musicSubjectId" OR teaching."musicSubjectId"=ANY(card."sportsSubjectIds"))))
  LEFT JOIN "CourseCompensationSnapshot" prior ON prior."sessionId"=session.id AND prior."storeId"=session."storeId"
  LEFT JOIN "CourseTeacherCompensationSetting" settings ON settings."storeId"=session."storeId" AND settings."staffId"=session."coachId"
  LEFT JOIN LATERAL (
   SELECT c.rules FROM "CourseCompensation" c JOIN "CourseTemplate" t ON t.id=c."templateId" AND t."storeId"=c."storeId"
   WHERE c."storeId"=teaching."storeId" AND c."staffId"='' AND t."musicSubjectId"=teaching."musicSubjectId"
    AND (t.id='subject_schedule_'||teaching."musicSubjectId" OR t.id=teaching.id)
    AND jsonb_array_length(c.rules)=1
   ORDER BY (t.id='subject_schedule_'||teaching."musicSubjectId") DESC LIMIT 1
  ) item_default ON true
  WHERE teaching.id=session."templateId" AND teaching."storeId"=session."storeId"
 ) captured
 WHERE session."storeId"=${storeId} AND (${sessionIds}::text[] IS NULL OR session.id=ANY(${sessionIds}::text[])) AND (${requestKey}::text IS NULL OR session."requestKey"=${requestKey})
 AND snap."storeId"=session."storeId" AND snap."sessionId"=session.id AND captured.rules IS NOT NULL`;
}
