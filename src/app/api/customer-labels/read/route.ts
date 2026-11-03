import {loadCustomerLabels} from '@/server/actions/customer-labels';
import {handleActionError} from '@/lib/errors';
import {z} from 'zod';
export const dynamic='force-dynamic';
/** Independent read transport; never queued behind unrelated mutating Server Actions. */
export async function POST(request:Request){
 try{
  const input=z.object({ids:z.array(z.string().min(1).max(100)).max(500),storeId:z.string().min(1).max(100).optional()}).parse(await request.json());
  return Response.json(await loadCustomerLabels(input.ids,input.storeId),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){const result=handleActionError(error);return Response.json({error:result.success?'標籤讀取失敗':result.error},{status:400,headers:{'Cache-Control':'private, no-store'}});}
}
