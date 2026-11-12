import {expect,it,vi} from 'vitest';
vi.mock('@/lib/error-logger',()=>({categorizeError:()=> 'UNKNOWN',logError:vi.fn()}));
import {handleActionError} from '@/lib/errors';
it.each(['P2002',undefined])('does not report a store/name duplicate as a missing store (code=%s)',code=>{
 const error=Object.assign(Error('Unique constraint failed on the fields: (`storeId`,`name`)'),{code});
 expect(handleActionError(error)).toEqual({success:false,error:'資料重複，請勿重複操作'});
});
it.each([
 ['P2002','opaque constraint error mentioning storeId','資料重複，請勿重複操作'],
 ['P2003','Foreign key constraint failed on storeId','關聯資料不存在，請確認資料完整性'],
 ['P2011','Null constraint failed on storeId','資料欄位缺失，請聯繫管理員（Null constraint）'],
 ['P2022','Column storeId does not exist','資料表結構尚未更新，請先執行 migration 後再使用此功能'],
])('uses typed database error %s before interpreting field names', (code,message,expected)=>{
 expect(handleActionError(Object.assign(Error(message),{code}))).toEqual({success:false,error:expected});
});
it.each(['缺少 storeId','Missing storeId'])('retains the explicit missing-store case: %s',message=>{
 expect(handleActionError(Error(message))).toEqual({success:false,error:'缺少店舖資訊，請登出後重新登入'});
});
