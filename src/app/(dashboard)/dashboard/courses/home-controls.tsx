"use client";
import { useEffect, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
export function HomeRetry() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return <button className="min-h-11 rounded border border-earth-300 px-3 text-sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "重新讀取中…" : "重新讀取"}</button>;
}
export function HomePosition({ children }: {
    children: ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    useEffect(() => {
        const key = `course-home-position:${pathname}`;
        const saved = sessionStorage.getItem(key);
        if (saved) {
            router.refresh();
            const observer = new ResizeObserver(() => window.scrollTo({ top: Number(saved), behavior: "instant" }));
            observer.observe(document.body);
            const stop = () => { observer.disconnect(); sessionStorage.removeItem(key); };
            window.addEventListener("pointerdown", stop, { once: true });
            window.addEventListener("wheel", stop, { once: true });
            const timer = setTimeout(stop, 2500);
            return () => { clearTimeout(timer); observer.disconnect(); window.removeEventListener("pointerdown", stop); window.removeEventListener("wheel", stop); };
        }
    }, [pathname, router]);
    return <div onClickCapture={event => { if ((event.target as HTMLElement).closest("a"))
        sessionStorage.setItem(`course-home-position:${pathname}`, String(window.scrollY)); }}>{children}</div>;
}
