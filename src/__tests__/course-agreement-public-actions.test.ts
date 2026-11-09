import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AppError } from '@/lib/app-error';
const m=vi.hoisted(()=>({cookies:vi.fn(),get:vi.fn(),set:vi.fn(),begin:vi.fn(),sign:vi.fn()}));
vi.mock('next/headers',()=>({cookies:m.cookies}));
vi.mock('@/server/services/course-agreement-public',async()=>{
 const {z}=await import('zod');return{agreementTokenSchema:z.string().regex(/^[A-Za-z0-9_-]{43}$/),beginPublicCourseAgreement:m.begin,signPublicCourseAgreement:m.sign};
});
import { beginCourseAgreementAction, signCourseAgreementAction } from '@/server/actions/course-agreement-public';
const token='a'.repeat(43),reviewToken='b'.repeat(43);
beforeEach(()=>{vi.resetAllMocks();m.cookies.mockResolvedValue({get:m.get,set:m.set});m.get.mockReturnValue({value:reviewToken});m.begin.mockResolvedValue({reviewToken,data:{receiptPath:'/course-agreements/receipt/'+'c'.repeat(43)}});m.sign.mockResolvedValue({receiptPath:'/course-agreements/receipt/'+'c'.repeat(43)});});
afterEach(()=>vi.unstubAllEnvs());
it('stores the browser review capability only in an HttpOnly, scoped, secure cookie',async()=>{vi.stubEnv('NODE_ENV','production');await beginCourseAgreementAction(token);expect(m.set).toHaveBeenCalledWith(expect.any(String),reviewToken,{httpOnly:true,secure:true,sameSite:'strict',path:'/course-agreements/'+token,maxAge:604800});});
it('reads only the cookie for the specific shared link',async()=>{await signCourseAgreementAction(token,{});expect(m.get).toHaveBeenCalledWith('ca-review-'+createHash('sha256').update(token).digest('hex').slice(0,16));expect(m.sign).toHaveBeenCalledWith(token,reviewToken,{});});
it('does not accept a client supplied review token in place of the cookie',async()=>{m.get.mockReturnValue(undefined);await signCourseAgreementAction(token,{reviewToken:'client-forgery'});expect(m.sign).toHaveBeenCalledWith(token,'',{reviewToken:'client-forgery'});});
it('marks unknown storage outcomes for exact-request retry without exposing internal errors',async()=>{m.sign.mockRejectedValue(new Error('private SQL details'));const result=await signCourseAgreementAction(token,{});expect(result).toMatchObject({success:false,retrySame:true});expect(JSON.stringify(result)).not.toContain('private SQL');});
it('keeps known validation failures editable and rejects invalid entry tokens before cookies',async()=>{m.sign.mockRejectedValue(new AppError('VALIDATION','請重新簽名'));expect(await signCourseAgreementAction(token,{})).toMatchObject({success:false,retrySame:false,error:'請重新簽名'});m.cookies.mockClear();await beginCourseAgreementAction('invalid');expect(m.cookies).not.toHaveBeenCalled();});
