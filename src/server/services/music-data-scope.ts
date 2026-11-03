import "server-only";
import {assertMusicPreviewDataReviewEnvironment} from "../../../scripts/music-native-workflow-scope.mjs";
import {LEGACY_MUSIC_SESSION_IDS,LEGACY_MUSIC_CUSTOMER_IDS} from "./music-data-scope-manifest";
export {LEGACY_MUSIC_SESSION_IDS,LEGACY_MUSIC_CUSTOMER_IDS} from "./music-data-scope-manifest";
// The manifest reuses the original Git blob. No private identities are uploaded again.
export function musicDataSeparationEnabled(storeId:string,env:Record<string,string|undefined>=process.env){
 if(storeId!=="store-lubymusic"||env.VERCEL!=="1")return false;
 try{assertMusicPreviewDataReviewEnvironment(env);return true;}catch{return false;}
}
export function musicDataScope(storeId:string,value?:string){return musicDataSeparationEnabled(storeId)?value==="legacy"?"legacy":"operational":null;}
export function musicSessionWhere(storeId:string,value?:string){const scope=musicDataScope(storeId,value);return scope?{id:scope==="legacy"?{in:LEGACY_MUSIC_SESSION_IDS}:{notIn:LEGACY_MUSIC_SESSION_IDS}}:{};}
export function musicCustomerWhere(storeId:string,value?:string){const scope=musicDataScope(storeId,value);return scope?{id:scope==="legacy"?{in:LEGACY_MUSIC_CUSTOMER_IDS}:{notIn:LEGACY_MUSIC_CUSTOMER_IDS}}:{};}
