"use client";
/** Fields extracted from the existing course room/catalog editor. */
const field='min-h-11 min-w-0 max-w-full w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base';
export function CourseCatalogNameField({name,label='名稱',className,maxLength=80,requiredMarker=true}:{name?:string;label?:string;className?:string;maxLength?:number;requiredMarker?:boolean}){
 return <label className={className}>{label}{requiredMarker?' *':''}<input className={field} name="name" required maxLength={maxLength} defaultValue={name}/></label>;
}
export function CourseCatalogDurationField({duration,service=false,music=false,className}:{duration?:number;service?:boolean;music?:boolean;className?:string}){
 return <label className={className}>{service?'服務時長 *':'時長（分鐘）'}{music?<select className={field} name="duration" defaultValue={duration??60} required>{[30,60,90,120].map(minutes=><option key={minutes} value={minutes}>{minutes} 分鐘</option>)}</select>:<input className={field} name="duration" type="number" min={service?5:1} max={service?720:480} required defaultValue={duration}/>}</label>;
}
