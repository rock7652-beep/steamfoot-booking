import {readBeautyCustomer} from '@/server/actions/beauty';
export const readBeautyCustomerDetail=(id:string)=>readBeautyCustomer({id});

export const beautyCustomerDetailScope=(data:{storeId:string;customers:readonly {id:string;updatedAt?:Date|string|null;notes?:string|null}[]})=>JSON.stringify([data.storeId,data.customers.map(c=>[c.id,c.updatedAt,c.notes])]);
