import type { ReactNode } from 'react';
export function ModuleHomePanel({title,section,info,hideTitle=false,children}:{title:string;section?:string;info?:ReactNode;hideTitle?:boolean;children:ReactNode}) {
 return <section data-home-section={section} className="relative min-w-0 rounded-xl border border-earth-200 bg-white px-4 py-2">
 {hideTitle?<h2 className="sr-only">{title}</h2>:<div className="flex min-h-9 flex-wrap items-center gap-x-1"><h2 className="text-sm font-semibold text-primary-900">{title}</h2>{info}</div>}{children}</section>;
}
