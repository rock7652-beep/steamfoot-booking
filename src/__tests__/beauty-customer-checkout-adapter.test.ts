vi.mock('@/server/actions/beauty-card-management',()=>({saveBeautyCardManagement:vi.fn()}));
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
import type {CourseCustomerSource} from '@/app/(dashboard)/dashboard/courses/member-source';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const m=vi.hoisted(()=>({assign:vi.fn(),source:null as CourseCustomerSource|null,provider:null as {enabled:boolean;storeId:string;family?:string}|null}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('@/lib/beauty/customer-reader',()=>({beautyCustomerReaders:()=>({})}));
vi.mock('@/server/actions/beauty-customer-attribution',()=>({saveBeautyCustomerAttribution:vi.fn(),searchBeautyReferrerCandidates:vi.fn(),bulkAssignBeautyCustomers:vi.fn()}));
vi.mock('@/server/actions/beauty-native-customers',()=>({maintainBeautyNativeCard:vi.fn(),saveBeautyNativeCustomerProfile:vi.fn(),saveBeautyNativeCustomerNote:vi.fn(),saveBeautyNativeCardMembers:vi.fn(),assignBeautyNativeCard:m.assign}));
vi.mock('@/server/actions/beauty-purchase-intent',()=>({prepareBeautyPlanPurchaseIntent:vi.fn(),readBeautyPlanPurchaseIntent:vi.fn(),cancelBeautyPlanPurchaseIntent:vi.fn(),acknowledgeBeautyPlanPurchaseIntent:vi.fn()}));
vi.mock('@/app/(dashboard)/dashboard/courses/purchase-recovery',()=>({CoursePurchaseIntentProvider:(props:{enabled:boolean;storeId:string;family?:string;children:unknown})=>{m.provider=props;return props.children;}}));
vi.mock('@/app/(dashboard)/dashboard/courses/member-workspace',()=>({CourseMemberWorkspace:({source}:{source:CourseCustomerSource})=>{m.source=source;return null;}}));
import {BeautyNativeCustomerWorkspace} from '@/components/beauty/native-customer-source';
beforeEach(()=>{m.assign.mockReset().mockResolvedValue({success:true});m.source=null;m.provider=null;});
it('translates the shared checkout cost field while preserving the authoritative Beauty quote',async()=>{
 const data={storeId:'beauty',customers:[],services:[],plans:[],cards:[],assignmentStaff:[],manage:{},access:{financeAccess:true},date:'2026-10-26'} as unknown as BeautyDashboardData;
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data}));
 await m.source!.assign({planId:'plan:p',expectedStoreCost:1500,beautyExpectedStoreCost:1500,expectedListPrice:5000,discountValue:100,requestKey:'same-request',expectedStoreId:'foreign'});
 expect(m.assign).toHaveBeenCalledWith({planId:'plan:p',expectedStoreCost:0,beautyExpectedStoreCost:1500,expectedListPrice:5000,discountValue:100,requestKey:'same-request',expectedStoreId:'beauty'});
});
it('only enables the beauty plan recovery when the server-provided flag is on and the store is writable',()=>{
 const data={storeId:'beauty',customers:[],services:[],plans:[],cards:[],assignmentStaff:[],manage:{},access:{financeAccess:true},date:'2026-10-26'} as unknown as BeautyDashboardData;
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data}));expect(m.provider).toMatchObject({enabled:false,storeId:'beauty',family:'beauty-plan'});
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data,planPurchaseRecoveryEnabled:true}));expect(m.provider).toMatchObject({enabled:true});
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data,planPurchaseRecoveryEnabled:true,readOnly:true}));expect(m.provider).toMatchObject({enabled:false});
});
