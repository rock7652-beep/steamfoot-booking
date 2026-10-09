"use client";

import { RosterReminders } from "@/components/admin/roster-reminders";
import type { ComponentProps } from "react";
import styles from "./sports-roster.module.css";

/** Keep sports-specific placement while all modules share the reminder cell. */
export function SportsRosterReminders(props: ComponentProps<typeof RosterReminders>) {
  return <RosterReminders {...props} className={styles.reminders} sports />;
}
