import {BeautyAddOnActivation} from '@/components/add-ons/beauty-activation';
import {readBeautyAddOnActivation} from '@/server/actions/beauty-add-on-activation';
import {getActiveStoreForRead} from '@/lib/store';
import {getStoreIndustryModule} from '@/lib/industry-module-server';
import {CourseAddOnCatalog} from '@/components/add-ons/course-catalog';
import {readCourseAddOnCatalog} from '@/server/actions/course-add-ons';
import {getCurrentUser} from '@/lib/session';
import {checkPermission} from '@/lib/permissions';
import {getStoreFeaturePresentation} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {notFound} from 'next/navigation';
import {redirect} from 'next/navigation';
import {PageShell,PageHeader} from '@/components/desktop';
import {SteamfootAddOnCatalog} from '@/components/add-ons/steamfoot-catalog';
import {readSteamfootAddOnCatalog} from '@/server/actions/steamfoot-add-ons';
export default async function AddOnSettingsPage(){
 const user=await getCurrentUser();if(!user||!await checkPermission(user.role,user.staffId,'add_ons.manage'))redirect('/dashboard');
 const storeId=await getActiveStoreForRead(user);
 if(!storeId)notFound();
 const industry=await getStoreIndustryModule(storeId);
 const title=industry==='beauty'?'加購商品':'附加項目';
 const state=await getStoreFeaturePresentation(storeId,FEATURES.ADD_ONS);
 if(state==='HIDDEN')notFound();
 if(state==='LOCKED')return <PageShell><PageHeader title={title}/><p role="status">{title}尚未開通，請聯絡總部。</p></PageShell>;
 const course=industry==='course',beauty=industry==='beauty';
 let content;
 if(beauty){const result=await readBeautyAddOnActivation();content=result.success&&result.data?<BeautyAddOnActivation key={result.data.storeId+':'+result.data.revision} {...result.data}/>:<p role="alert">{'error' in result?result.error:'設定暫時無法讀取'}</p>;}
 else if(course){const result=await readCourseAddOnCatalog();content=result.success&&result.data?<CourseAddOnCatalog key={result.data.storeId+':'+result.data.module+':'+result.data.revision} {...result.data}/>:<p role="alert">{'error' in result?result.error:'設定暫時無法讀取'}</p>;}
 else{const result=await readSteamfootAddOnCatalog();content=result.success&&result.data?<SteamfootAddOnCatalog key={result.data.storeId+':'+result.data.revision} {...result.data}/>:<p role="alert">{'error' in result?result.error:'設定暫時無法讀取'}</p>;}
 return <PageShell><PageHeader title={title} subtitle={beauty?"整筆預約的商品選購，不增加服務時間":course?"課程預約的加購與免費項目":"蒸足預約的加購與免費項目"}/>{content}</PageShell>;
}
