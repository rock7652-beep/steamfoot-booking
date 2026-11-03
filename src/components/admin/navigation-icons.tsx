import type { ReactNode } from "react";

function NavigationIcon({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" focusable="false" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export function ServiceCatalogIcon() {
  return <NavigationIcon><path d="M12 5v16m0-16C9 3 5 3 3 4v15c3-1 6-1 9 2m0-16c3-2 7-2 9-1v15c-3-1-6-1-9 2" /></NavigationIcon>;
}

export function LocationIcon() {
  return <NavigationIcon><path d="M3 21h18M5 21V3h14v18M9 21V7h6v14m-3-7h.01" /></NavigationIcon>;
}

export function PractitionerIcon() {
  return <NavigationIcon><circle cx="10" cy="7" r="3" /><path d="M4 21v-3a6 6 0 0 1 9-5.2" /><rect x="14" y="13" width="7" height="8" rx="1.5" /><path d="M16.5 16h2m-2 2h2" /></NavigationIcon>;
}

export function ImageAnnouncementIcon() {
  return <NavigationIcon><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></NavigationIcon>;
}
