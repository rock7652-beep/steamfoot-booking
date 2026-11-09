import type {readBeautyCustomer} from '@/server/actions/beauty';
export const readBeautyCustomerDetail=(id:string):ReturnType<typeof readBeautyCustomer>=>import('@/server/actions/beauty').then(module=>module.readBeautyCustomer({id}));

export const beautyCustomerDetailScope=(data:{storeId:string;customers:readonly {id:string;updatedAt?:Date|string|null;notes?:string|null}[]})=>JSON.stringify([data.storeId,data.customers.map(c=>[c.id,c.updatedAt,c.notes])]);
