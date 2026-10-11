// Static acceptance fixture only: never import this adapter in the application.
const router = { refresh() {} };
export function useRouter() { return router; }
export function usePathname() { return window.location.pathname; }
