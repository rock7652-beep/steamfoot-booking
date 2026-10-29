import {capturePurchaseSnapshotReceiver,MUSIC_PURCHASE_APPLY} from "./music-purchase-snapshot";
import {parseMusicPeriods} from './music-period-read-client';
import { isMusicPreviewPage, publishMusicFinanceChange, publishMusicRevenueCommit } from "./music-finance-sync";
export type MusicMutationResult = { success: boolean;financePublished?:boolean;musicSnapshot?:import('./music-purchase-snapshot').MusicPurchaseSnapshot; error?: string; checkoutReceipt?:unknown;checkoutCards?:import('./course-purchase-roster').CoursePurchaseCardsSnapshot;rosterSnapshot?:import('./course-purchase-roster').CoursePurchaseRosterSnapshot };
export const CHECKOUT_OUTCOME_UNCONFIRMED = "收款結果尚未確認，請勿再次收款，請管理員協助核對；即使查無紀錄，原請求仍可能處理中。";
/** Fixed URL and versioned JSON contract avoid deployment-pinned Server Action IDs.
 * Never retry a payment automatically: callers retain their original idempotency key.
 */
export async function musicCheckoutTransport(
  operation: "purchase" | "receipt", input: unknown,
  fallback: (input: unknown) => Promise<MusicMutationResult>,
): Promise<MusicMutationResult> {
  const acceptSnapshot = operation === "purchase" ? capturePurchaseSnapshotReceiver() : undefined;
  if (!isMusicPreviewPage()) {
    const result=await fallback(input);
    if(result.success&&result.musicSnapshot&&acceptSnapshot){
      acceptSnapshot(result.musicSnapshot);window.dispatchEvent(new Event(MUSIC_PURCHASE_APPLY));
      return {...result,financePublished:true};
    }
    return result;
  }
  const started=performance.now();
  const token = `${operation}:${crypto.randomUUID()}`;
  let committed = false;
  try {
    const response = await fetch("/s/lubymusic/admin/dashboard/music-checkout", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Music-Contract": "1", "X-Music-Stream": operation === "purchase" ? "2" : "1" },
      body: JSON.stringify({ operation, input }),
    });
    if (response.status === 409) return { success: false, error: "系統已更新，尚未送出；輸入仍保留，請開啟最新版後核對再送出。" };
    committed = response.ok && operation === "purchase" && response.headers.get("x-music-committed") === "1";
    if (committed) {
      publishMusicRevenueCommit(token);
      console.info("[music-checkout-committed]", JSON.stringify({requestMs:Math.round(performance.now()-started)}));
    }
    if (committed && response.headers.get("content-type")?.includes("application/x-ndjson") && response.body) {
      const reader=response.body.getReader(),decoder=new TextDecoder();
      let buffer="";
      const readLine=async():Promise<string|null>=>{
        for (;;) {
          if(buffer.length>2_000_000)throw new Error("Checkout response too large");
          const newline=buffer.indexOf("\n");
          if(newline>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);return line;}
          const chunk=await reader.read();
          if(chunk.done)return null;
          buffer+=decoder.decode(chunk.value,{stream:true});
        }
      };
      const first=await readLine();
      const frame=first?JSON.parse(first):null;
      if(frame?.kind!=="receipt"||frame.result?.success!==true)throw new Error("Invalid committed receipt");
      // The receipt is authoritative. Continue the optional projection without
      // making the operator wait, and always publish invalidation on timeout.
      void (async()=>{
        let timer:ReturnType<typeof setTimeout>|undefined;
        try {
          const line=await Promise.race([readLine(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),8000);})]);
          const next=line?JSON.parse(line):null,snapshot=next?.kind==="snapshot"?next.snapshot:null;
          if(typeof snapshot?.customerId==="string"&&(snapshot?.overview?.success===true||snapshot?.cards?.success===true||snapshot?.periods?.success===true||snapshot?.purchases?.success===true)){
            try{if(snapshot.periods)snapshot.periods=parseMusicPeriods(JSON.stringify(snapshot.periods));acceptSnapshot?.(snapshot);}catch{/* Authoritative readers refresh instead. */}
          }
        } catch {/* The committed receipt remains successful. */}
        finally {if(timer)clearTimeout(timer);void reader.cancel().catch(()=>{});publishMusicFinanceChange(operation,token);}
      })();
      return {...frame.result,financePublished:true};
    }
    const result = await response.json();
    console.info("[music-checkout-response]", JSON.stringify({operation,requestMs:Math.round(performance.now()-started),serverTiming:response.headers.get("server-timing"),phases:response.headers.get("x-music-timing"),readTiming:result.readTiming}));
    if (typeof result?.success !== "boolean") throw new Error("Unexpected checkout response");
    if (result.success) {
      const snapshot = result.snapshot;
      if (operation === "purchase" && typeof snapshot?.customerId === "string" && (snapshot?.overview?.success===true||snapshot?.cards?.success===true||snapshot?.periods?.success===true||snapshot?.purchases?.success===true)) {
        try { if(snapshot.periods)snapshot.periods=parseMusicPeriods(JSON.stringify(snapshot.periods));acceptSnapshot?.(snapshot); } catch { /* Normal authoritative refresh remains available. */ }
      }
      publishMusicFinanceChange(operation, token);
    }
    return result.success?{...result,financePublished:true}:result;
  } catch {
    // The server has already confirmed the write. A disconnected projection must not invite a second payment.
    if (committed) { publishMusicFinanceChange(operation, token); return {success:true,financePublished:true}; }
    return { success: false, error: CHECKOUT_OUTCOME_UNCONFIRMED };
  }
}
