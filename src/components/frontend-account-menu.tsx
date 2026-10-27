"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { logoutAction } from "@/server/actions/auth";
import { LogoutButton } from "@/components/logout-button";
import { clearOperationState } from "@/lib/operation-state";
import styles from "./frontend-account-menu.module.css";

/** One account location for member and work portals. Authorization stays server-side. */
export function FrontendAccountMenu({ storeSlug, name, readOnly = false, onBeforeLogout, children }: {
  storeSlug: string;
  name?: string | null;
  readOnly?: boolean;
  onBeforeLogout?: () => boolean;
  children?: ReactNode;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current?.open && !root.current.contains(event.target as Node)) root.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && root.current?.open) {
        root.current.open = false;
        root.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return <details ref={root} className={styles.root}>
    <summary className={styles.trigger} aria-label="帳號選單" title={name || "帳號"}>
      <span className={styles.name}>{name || "帳號"}</span>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
      </svg>
    </summary>
    <div className={styles.panel} aria-label="帳號操作">
      {name && <p className={styles.identity}>{name}</p>}
      {children && <div className={styles.actions}>{children}</div>}
      <form action={readOnly ? undefined : logoutAction} onSubmit={event => {
        if (readOnly || onBeforeLogout?.() === false) { event.preventDefault(); return; }
        try { clearOperationState(sessionStorage); } catch { /* Storage may be unavailable in embedded browsers. */ }
      }} className={styles.logout}>
        <input type="hidden" name="storeSlug" value={storeSlug} />
        <LogoutButton disabled={readOnly} clearStateOnClick={false} className={styles.logoutButton} iconSize={18} />
      </form>
    </div>
  </details>;
}
