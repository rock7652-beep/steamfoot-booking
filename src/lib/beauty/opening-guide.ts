import type {ChargeService,ChargeTechnician} from './charge-editor';
export const beautyOpeningRoutes=[
 {id:'store',label:'店家基本資料',href:'/dashboard/beauty?tab=設定&section=store'},
 {id:'hours',label:'營業與預約規則',href:'/dashboard/settings/hours'},
 {id:'locations',label:'位置／床位',href:'/dashboard/beauty?tab=位置管理'},
 {id:'services',label:'服務項目',href:'/dashboard/beauty?tab=服務項目'},
 {id:'technicians',label:'技師與排班',href:'/dashboard/beauty?tab=技師管理'},
 {id:'charges',label:'收費方式',href:'/dashboard/beauty?tab=收費方式'},
 {id:'staff',label:'後台人員與權限',href:'/dashboard/staff'},
 {id:'review',label:'開店前總檢查',href:'/dashboard/beauty?tab=設定&section=booking'},
] as const;
export type BeautySetupStepId=typeof beautyOpeningRoutes[number]['id'];
function openingRoute(id:BeautySetupStepId){return beautyOpeningRoutes.find(route=>route.id===id)!;}
export function beautySetupHref(id:BeautySetupStepId){const route=openingRoute(id);const [path,query='']=route.href.split('?');const params=new URLSearchParams(query);params.set('beautySetup',id);return `${path}?${params}`;}
export type BeautyOpeningStep={id:string;label:string;href:string;status:'present'|'missing'|'review';hint:string};
export function beautyOpeningSteps(input:{services:ChargeService[];technicians:ChargeTechnician[];locations:{isActive:boolean}[];plans:{active:boolean}[];canReadTechnicians:boolean;canReadPlans:boolean}):BeautyOpeningStep[]{
 const active=input.services.filter(s=>s.active),qualified=input.technicians.some(t=>t.active&&active.some(s=>t.serviceIds.includes(s.id)));
 return [
  {...openingRoute('store'),status:'review',hint:'核對店名、電話、地址與對外資訊；統一使用台灣時間。'},
  {...openingRoute('hours'),status:'review',hint:'核對每週營業、公休、預約間隔與期限；取消規則到設定核對。'},
  {...openingRoute('locations'),status:input.locations.some(r=>r.isActive)?'present':'missing',hint:'至少一個啟用位置。'},
  {...openingRoute('services'),status:active.length?'present':'missing',hint:'設定名稱、一般時長與整理時間，價格在收費方式設定。'},
  {...openingRoute('technicians'),status:!input.canReadTechnicians?'review':qualified?'present':'missing',hint:'核對性別、服務資格、拆帳及排班；預設沿用店家時間。'},
  {...openingRoute('charges'),status:'review',hint:!input.canReadPlans?'需有權限者核對收費方式。':`目前有 ${input.plans.filter(p=>p.active).length} 個啟用方案；單次可選填體驗價與分鐘，多次沒有體驗設定。開店檢查會核對各收費的可安排技師。`},
  {...openingRoute('staff'),status:'review',hint:'技師資格與後台登入權分開；額外帳號有需要才建立。'},
  {...openingRoute('review'),status:'review',hint:'執行開店檢查核對未來 7 天各收費是否有可安排時段。此引導不會開放預約、建立預約或收款；最後核對現有自行預約開關。'},
 ];
}
