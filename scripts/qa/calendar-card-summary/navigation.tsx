import type {AnchorHTMLAttributes} from 'react';
export function DashboardLink({prefetch,...props}:AnchorHTMLAttributes<HTMLAnchorElement>&{prefetch?:boolean}){void prefetch;return <a {...props}/>;}
export function usePathname(){return location.pathname;}
export function useSearchParams(){return new URLSearchParams(location.search);}
export function useRouter(){return {refresh(){},push(){},replace(){},prefetch(){}};}
export function unstable_rethrow(error:unknown){throw error;}
