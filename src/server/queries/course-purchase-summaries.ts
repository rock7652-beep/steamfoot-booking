import 'server-only';
import {coursePrisma} from '@/lib/course-db';
import {readMusicTuition} from '@/server/services/music-tuition';

/** Caller derives the learner and cards from member/phone-grant authorization.
 * Card sharing alone never grants access to another payer's purchase details. */
export async function readCoursePurchaseSummaries(storeId:string,customerId:string,cardIds:string[]){
  const result=new Map<string,{date:string;amount:number}>();
  if(!cardIds.length)return result;
  const orders=await coursePrisma.coursePurchase.findMany({
    where:{storeId,customerId,cardId:{in:cardIds},status:{in:['CONFIRMED','REFUNDED']}},
    distinct:['cardId'],orderBy:[{createdAt:'desc'},{id:'desc'}],
    select:{id:true,cardId:true,createdAt:true,price:true},
  });
  const tuition=await readMusicTuition(coursePrisma,storeId,orders.map(order=>order.id));
  for(const order of orders){
    if(!order.cardId)continue;
    // An installment receipt is not the agreed plan amount.
    result.set(order.cardId,{date:order.createdAt.toISOString(),amount:tuition.get(order.id)?.due??order.price});
  }
  return result;
}
