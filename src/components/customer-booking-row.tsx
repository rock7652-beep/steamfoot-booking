"use client";
import {useState,type ReactNode} from 'react';
import styles from './customer-booking-row.module.css';
/** Shared presentation only. Each module retains its eligibility and transaction controls. */
export function CustomerBookingRow({when,description,status,children,locked=false,forceOpen=false}:{when:ReactNode;description:ReactNode;status:ReactNode;children:ReactNode;locked?:boolean;forceOpen?:boolean}){
 const [open,setOpen]=useState(false);
 return <details data-customer-booking-row className={styles.row} open={open||forceOpen} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className={styles.summary} onClick={e=>{if(locked)e.preventDefault();}} aria-disabled={locked||undefined}>
   <span className={styles.lines}><span className={styles.first}><strong>{when}</strong><span className={styles.status}>{status}</span></span><span className={styles.description}>{description}</span></span>
   <span className={styles.chevron} aria-hidden="true">⌄</span>
  </summary>
  <div className={styles.body}>{children}</div>
 </details>;
}
export function CustomerBookingList({children}:{children:ReactNode}){return <section aria-label="預約清單" className={styles.list}>{children}</section>;}
