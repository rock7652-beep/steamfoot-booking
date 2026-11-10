vi.mock('@/server/actions/beauty-session-adjustment',()=>({saveBeautySessionAdjustment:vi.fn()}));
vi.mock('@/server/actions/beauty-card-management',()=>({saveBeautyCardManagement:vi.fn()}));
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
import type {CourseCustomerSource} from '@/app/(dashboard)/dashboard/courses/member-source';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const m=vi.hoisted(()=>({assign:vi.fn(),source:null as CourseCustomerSource|null,provider:null as {enabled:boolean;storeId:string;family?:string}|null}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/beauty/native-schedule-source',()=>({BeautyNativeScheduleDialog:()=>null}));
vi.mock('@/lib/beauty/customer-reader',()=>({beautyCustomerReaders:()=>({})}));
vi.mock('@/server/actions/beauty-customer-attribution',()=>({saveBeautyCustomerAttribution:vi.fn(),searchBeautyReferrerCandidates:vi.fn(),bulkAssignBeautyCustomers:vi.fn()}));
vi.mock('@/server/actions/beauty-native-customers',()=>({maintainBeautyNativeCard:vi.fn(),saveBeautyNativeCustomerProfile:vi.fn(),saveBeautyNativeCustomerNote:vi.fn(),saveBeautyNativeCardMembers:vi.fn(),assignBeautyNativeCard:m.assign}));
vi.mock('@/server/actions/beauty-purchase-intent',()=>({prepareBeautyPlanPurchaseIntent:vi.fn(),prepareBeautyPlanPurchaseIntentAtomic:vi.fn(),readBeautyPlanPurchaseIntent:vi.fn(),cancelBeautyPlanPurchaseIntent:vi.fn(),acknowledgeBeautyPlanPurchaseIntent:vi.fn()}));
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
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data}));expect(m.provider).toMatchObject({enabled:false,storeId:'beauty',family:'beauty-plan'});expect(m.source?.automaticPurchaseCompletion).toBe(true);
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data,planPurchaseRecoveryEnabled:true}));expect(m.provider).toMatchObject({enabled:true});
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data,planPurchaseRecoveryEnabled:true,readOnly:true}));expect(m.provider).toMatchObject({enabled:false});
});

it('offers the native technician entry only to writable staff managers and excludes already linked technicians',()=>{
 const data={storeId:'beauty',customers:[{id:'c',name:'顧客',phone:'0900000000',userId:'u',_count:{sponsoredCustomers:0}}],techs:[],services:[],plans:[],cards:[],assignmentStaff:[],manage:{technician:true},access:{staffAccess:true},date:'2026-11-10'} as unknown as BeautyDashboardData;
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data}));expect(m.source?.staffAction?.label).toBe('加入為技師');expect(m.source?.staffAction?.available('c')).toBe(true);expect(m.source?.staffAction?.available('foreign')).toBe(false);
 renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,{data:{...data,techs:[{userId:'u'}]} as BeautyDashboardData}));expect(m.source?.staffAction?.available('c')).toBe(false);
 for(const props of [{data,readOnly:true},{data:{...data,manage:{}} as BeautyDashboardData},{data:{...data,access:{staffAccess:false}} as BeautyDashboardData}]){renderToStaticMarkup(h(BeautyNativeCustomerWorkspace,props));expect(m.source?.staffAction).toBeUndefined();}
});
