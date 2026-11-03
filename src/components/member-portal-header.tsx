"use client";

import type { ReactNode } from "react";
import { SteamButlerLogo } from "@/components/steam-butler-logo";
import styles from "./member-portal-header.module.css";

/** Same logo / store / account placement across native and course member entries. */
export function MemberPortalHeader({ store, caption, account, padded = false, className = "", label = "門市識別" }: {
  store: ReactNode; caption: ReactNode; account: ReactNode; padded?: boolean; className?: string; label?: string;
}) {
  return <header aria-label={label} className={`${styles.header} ${padded ? styles.padded : ""} ${className}`}>
    <SteamButlerLogo className="w-20" />
    <div className={styles.identity}>{store}<div className={styles.caption}>{caption}</div></div>
    {account}
  </header>;
}
