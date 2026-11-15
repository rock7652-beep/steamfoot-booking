"use client";

import type {ComponentPropsWithoutRef} from "react";
import styles from "./plan-date-input.module.css";

/** Keep the native picker inside its grid cell, including iOS date controls. */
export function PlanDateInput({className="",...props}:Omit<ComponentPropsWithoutRef<"input">,"type">) {
  return <span className={`${styles.frame} ${className}`}><input {...props} type="date" className={styles.input}/></span>;
}
