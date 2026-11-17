import React from "react";
import {createRoot} from "react-dom/client";
import {CustomerMessageComposer} from "../../src/app/(dashboard)/dashboard/customers/messages/composer";
import {people} from "./customer-messages-actions";
import "../../src/app/globals.css";
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-6xl p-4 sm:p-6"><h1 className="mb-5 text-2xl font-bold">顧客訊息</h1><CustomerMessageComposer options={{storeId:"demo-store",storeName:"示範蒸足店",labels:[{id:"vip",name:"熟客"}],staff:[{id:"manager",name:"示範店長"}],blocker:new URLSearchParams(location.search).has("blocked")?"此環境僅供預覽，不會對顧客發送訊息":null}} initial={{rows:people.slice(0,25),total:people.length,page:1}} initialHistory={[]}/></main>);
