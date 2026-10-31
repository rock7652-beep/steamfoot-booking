/** A store manager with a checked task; shared by every store notice entry. */
export function DigitalManagerIcon({className="h-6 w-6"}:{className?:string}) {
 return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  <circle cx="9" cy="6" r="3"/>
  <path d="M3 20v-2a6 6 0 0 1 10-4.5M7 12.5l2 2 2-2M9 14.5V20"/>
  <rect x="13" y="12" width="8" height="9" rx="1.5"/>
  <path d="m15 16.5 1.5 1.5 2.5-3"/>
 </svg>;
}
