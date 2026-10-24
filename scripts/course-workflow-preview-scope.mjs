import {MUSIC_RELEASE_BRANCH,assertMusicNativeReleaseEnvironment} from './music-native-workflow-scope.mjs';
/** This UI review can use the existing native sports fixture, never a production store. */
export function courseWorkflowSportsPreview(storeId,env=process.env){
 if(storeId!=='sports-live-flow-store'||env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==MUSIC_RELEASE_BRANCH||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH)return false;
 try{return assertMusicNativeReleaseEnvironment(env)==='preview';}catch{return false;}
}
