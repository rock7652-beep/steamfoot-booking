"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import styles from "./member-store-switcher.module.css";

export interface MemberStoreOption { storeSlug: string; storeName: string }

/** Shared presentation only; adapters retain their own verified lists and server actions. */
export function MemberStoreSwitcher({ currentStoreSlug, currentStoreName, stores, action, disabled = false, onBeforeSwitch, hiddenFields, fullWidth = false, centered = false }: {
  currentStoreSlug: string;
  currentStoreName: string;
  stores: MemberStoreOption[];
  action: (data: FormData) => void | Promise<void>;
  disabled?: boolean;
  onBeforeSwitch?: () => boolean;
  hiddenFields?: Record<string, string>;
  fullWidth?: boolean;
  centered?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  if (!stores.some(store => store.storeSlug !== currentStoreSlug)) return <p className={styles.staticName}>{currentStoreName}</p>;
  return <div ref={root} className={`${styles.root}${fullWidth ? ` ${styles.fullWidth}` : ""}${centered ? ` ${styles.centered}` : ""}`}>
    <button ref={trigger} type="button" disabled={disabled} onClick={() => setOpen(value => !value)} aria-label={`目前門市：${currentStoreName}，切換門市`} aria-expanded={open} aria-haspopup="menu" className={styles.trigger}>
      <span className={styles.label}><span className={styles.caption}>目前門市</span><span className={styles.value}>{currentStoreName}</span></span>
      <svg aria-hidden="true" className={styles.arrow} style={{ transform: open ? "rotate(180deg)" : undefined }} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
    </button>
    {open && <div role="menu" className={styles.menu}>
      <p className={styles.title}>切換會員門市</p>
      {stores.map(store => <form key={store.storeSlug} action={action} onSubmit={event => {
        if (disabled || store.storeSlug === currentStoreSlug || onBeforeSwitch?.() === false) event.preventDefault();
      }}>
        <input type="hidden" name="storeSlug" value={store.storeSlug} />
        {Object.entries(hiddenFields ?? {}).map(([name, value]) => name !== "storeSlug" ? <input key={name} type="hidden" name={name} value={value} /> : null)}
        <StoreOptionButton store={store} isCurrent={store.storeSlug === currentStoreSlug} disabled={disabled} />
      </form>)}
    </div>}
  </div>;
}

function StoreOptionButton({ store, isCurrent, disabled }: { store: MemberStoreOption; isCurrent: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" role="menuitem" disabled={disabled || isCurrent || pending} aria-current={isCurrent ? "location" : undefined} aria-busy={pending} className={`${styles.option}${isCurrent ? ` ${styles.current}` : ""}`}>
    <span className={styles.storeName}>{store.storeName}</span>
    {isCurrent ? <span className={styles.status}>目前門市</span> : pending ? <span className={styles.status}>切換中…</span> : null}
  </button>;
}
