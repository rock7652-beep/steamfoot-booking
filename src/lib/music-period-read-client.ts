import type {loadMusicPeriods} from '@/server/actions/music-periods';
export function parseMusicPeriods(text:string):Awaited<ReturnType<typeof loadMusicPeriods>>{
 return JSON.parse(text,(key,value)=>(key==='closedAt'||key==='releasedAt')&&typeof value==='string'?new Date(value):value);
}

/** Independent read transport; preserve the Server Action's two Date fields. */
export async function readMusicPeriods(customerId:string):Promise<Awaited<ReturnType<typeof loadMusicPeriods>>>{
 const prefix=window.location.pathname.split('/dashboard')[0];
 const response=await fetch(`${prefix}/dashboard/courses/music-period-read?customerId=${encodeURIComponent(customerId)}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error('逐期資料讀取失敗，請重試');
 return parseMusicPeriods(await response.text());
}
