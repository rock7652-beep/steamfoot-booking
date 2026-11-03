import {createHash} from 'node:crypto';
export function beautyCareId(storeId:string,customerId:string,subject:string,kind:string){return 'beauty-care:'+createHash('sha256').update(JSON.stringify([storeId,customerId,subject,kind])).digest('hex');}
