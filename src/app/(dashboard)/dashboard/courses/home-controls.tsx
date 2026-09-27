"use client";
import { useEffect, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
export function HomeRetry() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return <button className="min-h-11 rounded border border-earth-300 px-3 text-sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "重新讀取中…" : "重新讀取"}</button>;
}
export function HomePosition({ children }: {
    children: ReactNode;
}) {
    return <div>{children}</div>;
}

/** One refresh at the next class end / Taipei midnight; hidden tabs wait until visible. */
export function HomeClockRefresh({ nextAt }: { nextAt: number }) {
    const router = useRouter();
    useEffect(() => {
        let last = Date.now();
        const refresh = () => {
            if (document.visibilityState !== "visible") return;
            last = Date.now();
            router.refresh();
        };
        const resume = () => { if (Date.now() - last >= 60000 || (Date.now() >= nextAt && last < nextAt)) refresh(); };
        const timer = setTimeout(refresh, Math.max(500, nextAt - Date.now() + 250));
        window.addEventListener("focus", resume);
        document.addEventListener("visibilitychange", resume);
        return () => { clearTimeout(timer); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
    }, [nextAt, router]);
    return null;
}
