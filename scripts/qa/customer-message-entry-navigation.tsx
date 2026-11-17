import React,{useMemo,useSyncExternalStore} from "react";
function useUrl(){return useSyncExternalStore(listener=>{window.addEventListener("popstate",listener);return()=>window.removeEventListener("popstate",listener);},()=>location.href);}
export function usePathname(){return new URL(useUrl()).pathname;}
export function useSearchParams(){const url=useUrl();return useMemo(()=>new URL(url).searchParams,[url]);}
const router={push(href:string){history.pushState(null,"",href);window.dispatchEvent(new PopStateEvent("popstate"));},replace(href:string){history.replaceState(null,"",href);window.dispatchEvent(new PopStateEvent("popstate"));},refresh(){}};
export function useRouter(){return router;}
export function AppLink({href,children,prefetch,...props}:React.ComponentProps<"a">&{prefetch?:boolean}){void prefetch;return <a href={href} {...props}>{children}</a>;}
export default AppLink;
export const useLinkStatus=()=>({pending:false});
