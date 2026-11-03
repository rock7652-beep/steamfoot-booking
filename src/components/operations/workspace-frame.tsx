"use client";

import {createContext,useContext,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {PageHeader} from "@/components/desktop/page-header";
import styles from "./workspace-frame.module.css";

const ToolbarTarget=createContext<HTMLElement|null|undefined>(undefined);
/** Shared navigation and filter placement; each workspace retains its own rules. */
export function OperationsFrame({tabs,children}:{tabs:ReactNode;children:ReactNode}) {
  const [target,setTarget]=useState<HTMLElement|null>(null);
  return <ToolbarTarget.Provider value={target}>
    <div className={styles.frame}>
      <div className={styles.header}>
        <div className={styles.tabs}>{tabs}</div>
        <div ref={setTarget} className={styles.filters}/>
      </div>
      {children}
    </div>
  </ToolbarTarget.Provider>;
}

/** Standalone workspaces keep their controls in place when no shared header exists. */
export function OperationsControls({children}:{children:ReactNode}) {
  const target=useContext(ToolbarTarget);
  return target?createPortal(children,target):<>{children}</>;
}

/** Embedded pages already have navigation; standalone routes retain their heading. */
export function OperationsLocalHeading({title,subtitle,actions}:{title:string;subtitle?:string;actions?:ReactNode}) {
  const target=useContext(ToolbarTarget);
  return target!==undefined?<>{actions}</>:<PageHeader compact title={title} subtitle={subtitle} actions={actions}/>;
}
