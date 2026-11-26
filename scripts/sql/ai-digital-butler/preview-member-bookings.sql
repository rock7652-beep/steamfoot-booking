-- Fixed synthetic read fixtures; run only on steamfoot-preview, never production.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='steamfoot_ai_preview_20261125'
    AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND rolconnlimit=8)
    OR (SELECT count(*) FROM public."Store" WHERE "isDemo"=true AND
      ((id='ai-preview-steamfoot' AND "industryModule"::text='STEAMFOOT') OR (id='ai-preview-beauty' AND "industryModule"::text='BEAUTY')))<>2
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname IN ('User','Customer','CentralMemberLinkReviewRequest') AND c.relrowsecurity)<>3
  THEN RAISE EXCEPTION 'AI_MEMBER_ISOLATION_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public."User" WHERE id IN ('ai-preview-member-user-a','ai-preview-member-user-b','ai-preview-member-user-c'))
    OR EXISTS (SELECT 1 FROM public."Customer" WHERE id IN ('ai-preview-member-customer-a','ai-preview-member-customer-b','ai-preview-member-customer-c'))
    OR EXISTS (SELECT 1 FROM public."Booking" WHERE id IN ('ai-preview-member-booking-a','ai-preview-member-booking-b'))
  THEN RAISE EXCEPTION 'AI_MEMBER_FIXTURES_ALREADY_EXIST'; END IF;
END $$;
INSERT INTO public."User" (id,name,email,role,status,"updatedAt") VALUES
 ('ai-preview-member-user-a','AI 合成會員甲','ai-member-a@example.invalid','CUSTOMER','SUSPENDED',CURRENT_TIMESTAMP),
 ('ai-preview-member-user-b','AI 合成會員乙','ai-member-b@example.invalid','CUSTOMER','SUSPENDED',CURRENT_TIMESTAMP),
 ('ai-preview-member-user-c','AI 合成外店會員','ai-member-c@example.invalid','CUSTOMER','SUSPENDED',CURRENT_TIMESTAMP);
INSERT INTO public."Customer" (id,"userId","storeId",name,phone,email,birthday,"selfBookingEnabled","updatedAt") VALUES
 ('ai-preview-member-customer-a','ai-preview-member-user-a','ai-preview-steamfoot','AI 合成會員甲','0900000101','ai-member-contact@example.invalid',DATE '2000-01-01',true,CURRENT_TIMESTAMP),
 ('ai-preview-member-customer-b','ai-preview-member-user-b','ai-preview-steamfoot','AI 合成會員乙','0900000102','ai-member-b@example.invalid',DATE '2000-01-01',true,CURRENT_TIMESTAMP),
 ('ai-preview-member-customer-c','ai-preview-member-user-c','ai-preview-beauty','AI 合成外店會員','0900000101','ai-member-contact@example.invalid',DATE '2000-01-01',true,CURRENT_TIMESTAMP);
-- Staff-created read fixtures do not trigger customer-booking store notices.
-- Beauty has an identity-only fixture: its bookings must use its native model.
INSERT INTO public."Booking" (id,"customerId","storeId","bookingDate","slotTime",people,"bookedByType","bookingType","bookingStatus","expectedAmount",notes,"updatedAt") VALUES
 ('ai-preview-member-booking-a','ai-preview-member-customer-a','ai-preview-steamfoot',DATE '2026-11-27','10:00',1,'STAFF','FIRST_TRIAL','CONFIRMED',0,'AI 合成測試甲；不作模型輸入',CURRENT_TIMESTAMP),
 ('ai-preview-member-booking-b','ai-preview-member-customer-b','ai-preview-steamfoot',DATE '2026-11-27','11:00',2,'STAFF','FIRST_TRIAL','PENDING',0,'AI 合成測試乙；不作模型輸入',CURRENT_TIMESTAMP);
CREATE POLICY ai_preview_member_user_read ON public."User" FOR SELECT TO steamfoot_ai_preview_20261125
 USING (id IN ('ai-preview-member-user-a','ai-preview-member-user-b','ai-preview-member-user-c') AND role='CUSTOMER');
CREATE POLICY ai_preview_member_customer_read ON public."Customer" FOR SELECT TO steamfoot_ai_preview_20261125
 USING (id IN ('ai-preview-member-customer-a','ai-preview-member-customer-b','ai-preview-member-customer-c')
   AND "storeId" IN ('ai-preview-steamfoot','ai-preview-beauty'));
CREATE POLICY ai_preview_member_unlink_read ON public."CentralMemberLinkReviewRequest" FOR SELECT TO steamfoot_ai_preview_20261125
 USING ("userId" IN ('ai-preview-member-user-a','ai-preview-member-user-b','ai-preview-member-user-c') AND "storeId" IN ('ai-preview-steamfoot','ai-preview-beauty'));
-- Fixtures start inactive, with no password. Temporary passwords are never stored here.
-- Cleanup: set these three Users SUSPENDED, passwordHash=NULL, and update updatedAt.
-- To disable reads, drop only these three policies; retain fixture/audit rows.
