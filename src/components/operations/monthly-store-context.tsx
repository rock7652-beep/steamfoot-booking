"use client";
import {createContext, useContext, type ReactNode} from "react";
const MonthlyStoreContext = createContext<{storeId:string;name:string}|null>(null);
export function MonthlyStoreProvider({storeId,name,children}:{storeId:string;name:string;children:ReactNode}) {
  return <MonthlyStoreContext.Provider value={{storeId,name}}>{children}</MonthlyStoreContext.Provider>;
}
export function useMonthlyStore() { return useContext(MonthlyStoreContext); }
export function MonthlyStoreLabel() {
  const store=useMonthlyStore();
  return store ? <p className="text-sm font-medium">操作門市：{store.name}</p> : null;
}
