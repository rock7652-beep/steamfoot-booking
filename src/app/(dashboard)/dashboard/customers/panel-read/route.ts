import {getCustomerPanelContext} from '@/server/actions/customer-panel-context';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('customerId');
 if(!id||id.length>100)return Response.json({success:false,error:'參數無效'},{status:400,headers});
 return Response.json(await getCustomerPanelContext(id),{headers});
}
