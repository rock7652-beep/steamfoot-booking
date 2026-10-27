// Only for the loopback Vitest/Vite database harness. Server identity is fixed
// to a disposable test customer. No production endpoint or credentials exist.
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {CourseRoster} from '../../src/app/(dashboard)/dashboard/courses/roster';
import '../../src/app/globals.css';
const music=new URLSearchParams(location.search).get('profile')==='music';
const request=window.fetch.bind(window);
window.qaAction=async(name,...args)=>{
 const response=await request('/__qa/item-core',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});
 return response.json();
};
window.fetch=async(input,init)=>String(input).includes('/courses/session-detail')?new Response(JSON.stringify(await window.qaAction('loadCourseSessionDetail')),{headers:{'Content-Type':'application/json'}}):request(input,init);
createRoot(document.getElementById('root')!).render(<OperationScope scope={`isolated-item-db:${music}`}><main className="min-w-0 p-3"><p>隔離資料庫流程驗收・授權身分為測試adapter，非正式站登入</p><CourseRoster sessionId="isolated-session" capacity={8} canCreate canEdit sportsNative={!music} musicLayout={music}/></main></OperationScope>);
