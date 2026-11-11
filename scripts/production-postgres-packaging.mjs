// Build artifacts only. No database clients, credentials, migrations or deployed settings.
import {readFileSync,statSync,lstatSync,realpathSync,readdirSync,existsSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync,unlinkSync,constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareReferralQaEngineFiles} from './prune-referral-qa-trace.mjs';
const unused=/^node_modules\/@prisma\/client\/runtime\/query_engine_bg\.(cockroachdb|mysql|sqlite|sqlserver)\.wasm-base64\.(js|mjs)$/;
// QA screenshots are already excluded by next.config.ts route tracing.
// Proxy traces ignore those globs. Vercel may retrace after postbuild, so archive
// only these review images outside the ephemeral build root, never runtime assets.
const reviewScreenshot=/^artifacts\/.*\.(?:png|jpe?g|webp)$/i;
export function assertProductionPackaging(env,root){
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!=='prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR'||env.VERCEL_GIT_COMMIT_REF!=='main'||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH||env.SUBSCRIPTION_REFERRAL_QA||env.MARKETING_PUBLICATION_LOCAL_QA||!/^\/vercel\/path[0-9]+$/.test(root))throw Error('Production packaging requires the exact production main project and Vercel build sandbox');
}
export function inspectProductionPackage(root,dist='.next'){
 for(const schema of ['prisma/schema.prisma','course-prisma/schema.prisma','beauty-prisma/schema.prisma'])if(!/datasource\s+db\s*\{[^}]*provider\s*=\s*"postgresql"/.test(readFileSync(join(root,schema),'utf8')))throw Error('All runtime datasources must remain PostgreSQL');
 const trace=join(root,dist,'server/middleware.js.nft.json'),data=JSON.parse(readFileSync(trace,'utf8'));
 if(data.version!==1||!Array.isArray(data.files)||data.files.some(f=>typeof f!=='string'))throw Error('Unexpected Proxy trace');
 let tracedBytes=0,unusedEngineBytes=0,reviewScreenshotBytes=0;const unusedEngines=[],reviewScreenshots=[];
 for(const f of new Set(data.files)){
  const full=resolve(dirname(trace),f),path=relative(root,full).split(sep).join('/'),size=statSync(full).size;
  tracedBytes+=size;if(reviewScreenshot.test(path)){reviewScreenshotBytes+=size;reviewScreenshots.push(path);}if(unused.test(path)){unusedEngineBytes+=size;unusedEngines.push(path);}
 }
 // Retain docs, JSON evidence, QA scripts and all runtime files; omit only review images.
 const conservativeBytes=tracedBytes-unusedEngineBytes-reviewScreenshotBytes+unusedEngines.length*256;
 return {tracedBytes,unusedEngineBytes,conservativeBytes,unusedEngines,reviewScreenshotBytes,reviewScreenshots,withinSafetyBudget:conservativeBytes<245_000_000,filesModified:false};
}
export function pruneProductionNft(file,root){
 const data=JSON.parse(readFileSync(file,'utf8'));
 if(data.version!==1||!Array.isArray(data.files)||data.files.some(f=>typeof f!=="string"))throw Error("Unexpected function trace");
 const files=data.files.filter(f=>{const path=relative(root,resolve(dirname(file),f)).split(sep).join('/');return !unused.test(path)&&!reviewScreenshot.test(path);});
 if(files.length!==data.files.length)writeFileSync(file,JSON.stringify({...data,files}));
 return data.files.length-files.length;
}
export function archiveProductionReviewImages(root,paths){
 const base=realpathSync(root),files=[...new Set(paths)];
 // Validate every source before modifying anything. Symlinks and paths outside
 // the exact artifacts image scope never become build packaging candidates.
 for(const path of files){
  const full=resolve(base,path);
  if(!reviewScreenshot.test(path)||relative(base,full).split(sep).join('/')!==path||!lstatSync(full).isFile()||lstatSync(full).isSymbolicLink()||relative(base,realpathSync(full)).split(sep).join('/')!==path)throw Error('Review image archive scope mismatch');
 }
 const archive=mkdtempSync(join(tmpdir(),'production-review-images-'));
 for(const path of files){
  const source=resolve(base,path),destination=join(archive,path);
  mkdirSync(dirname(destination),{recursive:true});copyFileSync(source,destination,constants.COPYFILE_EXCL);
  const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  if(hash(source)!==hash(destination))throw Error('Review image archive verification failed');
 }
 // Git sources remain intact; only the completed, strictly scoped platform
 // build sandbox loses these files. Preserve a byte-exact recovery archive.
 for(const path of files)unlinkSync(resolve(base,path));
 return {archive,count:files.length};
}
export function archiveProductionReviewInputs(env,root){
 assertProductionPackaging(env,resolve(root));
 const paths=[],directory=join(root,'artifacts');
 function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const full=join(dir,entry.name),path=relative(root,full).split(sep).join('/');
  if(entry.isDirectory())visit(full);
  else if(reviewScreenshot.test(path))paths.push(path);
 }}
 if(existsSync(directory))visit(directory);
 return archiveProductionReviewImages(root,paths);
}
export function pruneProductionTraces(root){
 if(!existsSync(join(root,'.next/BUILD_ID')))throw Error('Completed build required');
 const plan=inspectProductionPackage(root);
 if(plan.reviewScreenshots.length)throw Error('Review images must be archived before Next.js tracing, not after it');
 if(!plan.withinSafetyBudget)throw Error(`Proxy remains above the production packaging safety budget: ${JSON.stringify(plan)}`);
 function visit(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  const p=join(directory,entry.name);if(entry.isDirectory()&&!['node_modules','cache'].includes(entry.name))visit(p);
  else if(entry.isFile()&&entry.name.endsWith('.nft.json'))pruneProductionNft(p,root);
 }}
 visit(join(root,'.next'));
 const archive=prepareReferralQaEngineFiles(root,'Production PostgreSQL');
 return {...plan,filesModified:true,unusedProviderStubs:archive.moved,originalEnginesBackedUpOutsideBuildRoot:true,backupDirectory:archive.archive};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=resolve(import.meta.dirname,'..');const args=process.argv.slice(2).join(' ');
 if(args==='--inspect-local')console.log(JSON.stringify(inspectProductionPackage(root,'.next-marketing-publication-qa'),null,2));
 else if(args==='--if-production'&&process.env.VERCEL_ENV!=='production')console.log('[production-postgres-packaging] skipped_non_production=true');
 else if(['--prune','--if-production'].includes(args)){assertProductionPackaging(process.env,root);console.log('[production-postgres-packaging]',JSON.stringify(pruneProductionTraces(root)));}
 else throw Error('Use --inspect-local (read-only), --if-production, or --prune (exact production main only)');
}
