// Synthetic UI evidence only. Every request stays in this fixture.
import {createRoot} from 'react-dom/client';
import {MusicSubjectCatalog} from '../../src/app/(dashboard)/dashboard/courses/music-subject-catalog';
const row={id:'summer',name:'暑期專班',category:'',description:'合成資料',isActive:true,durationMinutes:100,visibility:'HIDDEN',precautions:'請帶樂器',updatedAt:'2026-11-12T05:29:33.643Z'};
const saved=JSON.parse(localStorage.getItem('qa-subject')??'null')??row;
window.fetch=async(_url,options)=>{
 const input=JSON.parse(String(options?.body));
 const data={...saved,name:input.name,...input.nativeDefaults,updatedAt:'2026-11-12T05:30:00.000Z'};
 localStorage.setItem('qa-subject',JSON.stringify(data));
 return new Response(JSON.stringify({success:true,storeId:'synthetic',data}),{headers:{'Content-Type':'application/json'}});
};
createRoot(document.getElementById('root')!).render(<main className="course-workspace mx-auto max-w-6xl p-6"><h1 className="mb-4 text-xl">教學項目（合成資料）</h1><MusicSubjectCatalog storeId="synthetic" subjects={[saved]} canCreate canEdit/></main>);
