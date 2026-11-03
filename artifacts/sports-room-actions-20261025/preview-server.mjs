import {createServer} from 'vite';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,existsSync} from 'node:fs';
const evidence=dirname(fileURLToPath(import.meta.url)),repo=resolve(evidence,'../..'),root=resolve(evidence,'preview');
const react=`import React from 'react';`;
const emptyComponents={
 '@/app/(dashboard)/dashboard/courses/roster':['CourseRoster'],
 '@/app/(dashboard)/dashboard/courses/rental-panel':['RentalPanel','RentalHistory'],
 '@/app/(dashboard)/dashboard/courses/music-schedule-wizard':['MusicScheduleWizard'],
 '@/app/(dashboard)/dashboard/courses/daily-attendance-list':['DailyAttendanceList'],
 '@/components/admin/course-batch-selection':['CourseBatchBar'],
};
const virtual={
 'next/navigation':`${react} export const useRouter=()=>({refresh(){},push(){},replace(){}});export const usePathname=()=>'/s/fixture/admin/dashboard/courses';export const useSearchParams=()=>new URLSearchParams('date=2026-10-19&mode=week');export const useParams=()=>({});export const unstable_rethrow=e=>{throw e};export const redirect=()=>{};export const notFound=()=>{};export const useSelectedLayoutSegment=()=>null;export const useSelectedLayoutSegments=()=>[];export const permanentRedirect=()=>{};export const RedirectType={push:'push',replace:'replace'};`,
 'next/link':`${react} export const useLinkStatus=()=>({pending:false});export default function Link({children,...p}){return React.createElement('a',p,children)}`,
 'next/image':`${react} export default function Image(p){return React.createElement('img',p)}`,
 '@/components/admin/course-display-order':`export const useCourseDisplayOrder=()=>({ranks:new Map(),compare:()=>0,rowProps:()=>({}),handle:()=>null});`,
 '@/components/admin/course-status-button':`${react} export const useCourseStatusRows=(rows)=>[rows,()=>{},[],()=>{}];export const CourseStatusButton=()=>null;`,
 '@/lib/sports-calendar-client':`export async function readSportsCalendar(){return window.fixtureCalendar} export function clearSportsCalendarClient(){}`,
};
for(const[k,names]of Object.entries(emptyComponents))virtual[k]=names.map(n=>`export const ${n}=()=>null;`).join('\n');
const plugin={name:'isolated-native-ui-fixture',enforce:'pre',resolveId(id,importer){
 if(id in virtual||id==='server-only'||id.startsWith('@/server/actions/'))return '\0fixture:'+id;
 // Resolve relative imports of replaced modules to the same fixture.
 if(importer&&id.startsWith('./')){const target=new URL(id,'file://'+importer).pathname.replace(/\.(tsx?|jsx?)$/,'');const key='@/'+target.slice((repo+'/src/').length);if(key in virtual)return '\0fixture:'+key;}
 if(id.startsWith('@/'))return repo+'/src/'+id.slice(2)+(['.ts','.tsx','.js','.mjs'].find(ext=>existsSync(repo+'/src/'+id.slice(2)+ext))??'');
 },load(id){if(!id.startsWith('\0fixture:'))return;const key=id.slice(9);if(key==='server-only')return '';if(key in virtual)return virtual[key];
 if(key.startsWith('@/server/actions/')){const path=repo+'/src/'+key.slice(2)+'.ts';const src=existsSync(path)?readFileSync(path,'utf8'):'';const names=[...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x=>x[1]);return [...new Set(names)].map(n=>`export async function ${n}(){throw new Error('本機介面預覽禁止交易：${n}');}`).join('\n');}
 }};
const server=await createServer({root,configFile:false,plugins:[plugin],resolve:{alias:{react:resolve(repo,'node_modules/react'),'react-dom':resolve(repo,'node_modules/react-dom')}},server:{host:'127.0.0.1',port:5190,strictPort:true,fs:{allow:[root,repo,resolve(repo,'node_modules')]}},css:{postcss:repo+'/postcss.config.mjs'}});
await server.listen();console.log('LOCAL_PREVIEW_READY http://127.0.0.1:5190');
