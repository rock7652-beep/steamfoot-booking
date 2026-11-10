import {createElement as h,type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
import type {CourseStaffWorkspace} from '@/app/(dashboard)/dashboard/courses/staff-workspace';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const m=vi.hoisted(()=>({query:'customerToTechnician=c&search=顧客',push:vi.fn(),props:null as ComponentProps<typeof CourseStaffWorkspace>|null}));
vi.mock('next/navigation',()=>({usePathname:()=>'/s/beauty/admin/dashboard/beauty',useSearchParams:()=>new URLSearchParams(m.query),useRouter:()=>({push:m.push})}));
vi.mock('@/app/(dashboard)/dashboard/courses/staff-workspace',()=>({CourseStaffWorkspace:(props:ComponentProps<typeof CourseStaffWorkspace>)=>{m.props=props;return null;}}));
vi.mock('@/server/actions/beauty-native-staff',()=>({saveBeautyNativeStaff:vi.fn(),readBeautyNativeStaffTeaching:vi.fn(),readBeautyNativeStaffAvailability:vi.fn(),saveBeautyNativeStaffAvailability:vi.fn(),saveBeautyNativeWorkPermission:vi.fn()}));
vi.mock('@/server/actions/beauty-display-order',()=>({saveBeautyDisplayOrder:vi.fn()}));
vi.mock('@/server/actions/beauty',()=>({saveBeautyCatalog:vi.fn()}));
import {BeautyNativeStaffWorkspace} from '@/components/beauty/native-staff-source';
const customer={id:'c',name:'顧客',phone:'0900000000',gender:'FEMALE',email:'qa@example.invalid',userId:'u',user:{status:'ACTIVE'}};
function data(overrides:Record<string,unknown>={}){return {storeId:'beauty',customers:[customer],techs:[],services:[],technicianAssignments:[],access:{feeAccess:true},...overrides} as unknown as BeautyDashboardData;}
beforeEach(()=>{m.query='customerToTechnician=c&search=顧客';m.props=null;m.push.mockReset();});
it('opens the original native technician form with same-store customer data and returns to that profile',()=>{
 renderToStaticMarkup(h(BeautyNativeStaffWorkspace,{data:data(),canManage:true}));
 expect(m.props).toMatchObject({initialCreate:true,initialCustomer:{id:'c',name:'顧客',phone:'0900000000',linkMember:true},source:{personLabel:'技師'}});
 expect(renderToStaticMarkup(m.props!.source!.basicFields(null))).toContain('<option value="FEMALE" selected="">');
 m.props!.onPanelClose!();const url=new URL(m.push.mock.calls[0][0],'https://qa.invalid');expect(url.pathname).toBe('/s/beauty/admin/dashboard/beauty');expect(url.searchParams.get('customerId')).toBe('c');expect(url.searchParams.get('tab')).toBe('顧客管理');expect(url.searchParams.get('search')).toBe('顧客');expect(url.searchParams.has('customerToTechnician')).toBe(false);
});
it('does not seed a foreign customer, unauthorized manager or already linked technician',()=>{
 for(const props of [{data:data(),canManage:false},{data:data({customers:[]}),canManage:true},{data:data({customers:[customer],techs:[{userId:'u',id:'tech',serviceIds:[],rates:{},grants:[],weekly:{inheritStore:true},exceptions:{},gender:'FEMALE',name:'技師',active:true,revision:0,phone:'',storeId:'beauty'}]}),canManage:true}]){
  renderToStaticMarkup(h(BeautyNativeStaffWorkspace,props));expect(m.props?.initialCreate).toBe(false);expect(m.props?.initialCustomer).toBeUndefined();
 }
});
it('prefills unlinked customers without claiming a LINE member connection',()=>{
 renderToStaticMarkup(h(BeautyNativeStaffWorkspace,{data:data({customers:[{...customer,userId:null,user:null}]}),canManage:true}));expect(m.props).toMatchObject({initialCreate:true,initialCustomer:{name:'顧客',linkMember:false}});
});
