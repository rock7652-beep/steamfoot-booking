import {expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {CourseTransactionDetail} from '@/app/(dashboard)/dashboard/revenue/_components/course-transaction-actions';
const h=vi.hoisted(()=>({canVoid:false}));
vi.mock('@/app/(dashboard)/dashboard/revenue/_components/course-transaction-actions',()=>({CourseTransactionActions:({canVoid}:{canVoid:boolean})=>{h.canVoid=canVoid;return null;}}));
vi.mock('@/components/beauty/online-confirm-recovery',()=>({useBeautyOnlineConfirm:()=>null}));
vi.mock('@/server/actions/beauty-native-transactions',()=>({editBeautyNativeTransaction:vi.fn(),voidBeautyNativeTransaction:vi.fn(),refundBeautyNativeTransaction:vi.fn(),confirmBeautyNativeTransaction:vi.fn()}));
import {BeautyNativeTransaction} from '@/components/beauty/native-transaction-source';
it.each([{trial:true,permission:true,expected:true},{trial:true,permission:false,expected:false},{trial:false,permission:true,expected:false}])('exposes trial void only with the server trial marker and permission: %j',({trial,permission,expected})=>{
 const order:CourseTransactionDetail&{trialService:boolean}={id:'trial',name:'體驗收款',customerName:'測試顧客',status:'CONFIRMED',price:499,note:'',revenueStaffId:null,voidReason:null,points:0,remaining:null,reserved:0,attended:0,usedQuota:0,expiresAt:null,transferLastFive:'',unit:'MONEY',refunds:[],trialService:trial};
 renderToStaticMarkup(createElement(BeautyNativeTransaction,{storeId:'store',order,canRefund:false,canConfirm:false,cardAccess:false,canEdit:false,canVoid:permission,staffOptions:[]}));
 expect(h.canVoid).toBe(expected);
});

it.each([true,false])('exposes regular service void only with permission: %s',permission=>{
 const order={id:'single',name:'單次服務',customerName:'測試顧客',status:'CONFIRMED',price:799,note:'',revenueStaffId:null,voidReason:null,points:0,remaining:null,reserved:0,attended:0,usedQuota:0,expiresAt:null,transferLastFive:'',unit:'MONEY',refunds:[],servicePayment:true};
 renderToStaticMarkup(createElement(BeautyNativeTransaction,{storeId:'store',order,canRefund:false,canConfirm:false,cardAccess:false,canEdit:false,canVoid:permission,staffOptions:[]}));
 expect(h.canVoid).toBe(permission);
});
