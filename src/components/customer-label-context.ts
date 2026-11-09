"use client";
import {createContext,useContext} from "react";
import type {LabelSnapshot} from "@/lib/customer-labels";

type ContextValue={snapshot:LabelSnapshot;register:(id:string)=>()=>void;refresh:()=>Promise<void>;seed:(snapshot:LabelSnapshot)=>void;update:(id:string,labels:string[])=>void;pendingIds:Set<string>;lock:(id:string)=>boolean;unlock:(id:string)=>void};
/** Lightweight access for calendar snapshots without importing label management UI. */
export const CustomerLabelsContext=createContext<ContextValue|null>(null);
export function useSeedCustomerLabels(){return useContext(CustomerLabelsContext)?.seed;}
