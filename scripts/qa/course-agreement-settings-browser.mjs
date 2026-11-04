const beauty = process.env.BEAUTY_AGREEMENTS_QA === '1';
// Actual React workspace and shared primitives; synthetic actions, no backend/network.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url), { chromium } = require('playwright');
const fitness = process.env.FITNESS_AGREEMENTS_QA === '1';
const root = process.cwd(), out = beauty ? '/workspace/reports/beauty-agreements-settings' : fitness ? '/workspace/reports/fitness-agreements-settings' : '/workspace/reports/course-agreements-settings';
mkdirSync(out, { recursive: true });
await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{CourseAgreementWorkspace}from'./src/app/(dashboard)/dashboard/courses/agreements/agreement-workspace';
import{emptyCourseAgreement,emptyFitnessCourseAgreement,emptyBeautyAgreement,buildCourseAgreement}from'./src/lib/course-agreement';
window.qaSaves=[];window.qaPublishes=[];
function App(){const [store,setStore]=useState('a');window.qaSwitchStore=()=>setStore('b');
const draft={...emptyCourseAgreement('合成音樂教室','03-0000000','測試路 1 號'),entity:'合成音樂短期補習班',responsible:'測試者',city:'新竹縣',business:'cram',makeup:'雙方協調補課',privacyNotice:'這是純合成資料的操作預覽，沒有真實個人資料。'};
if(${fitness})Object.assign(draft,{...emptyFitnessCourseAgreement('合成運動館','030000000','合成路'),entity:'合成商行',responsible:'合成負責人',city:'新竹縣',business:'fitness',makeup:'協調補課',privacyNotice:'純合成資料告知',fitness:{activityDescription:'肌力與伸展',intensity:'依能力調整',specificRisks:'彈力帶回彈與失去平衡',participationLimits:'遵守器材負載限制',emergencyProcedure:'停止運動並通報指導員',refundRule:'依適用法令辦理解約退費'}});
if(${beauty})Object.assign(draft,{...emptyBeautyAgreement('合成美業工作室','030000000','合成路'),entity:'合成商行',responsible:'合成負責人',city:'新竹縣',business:'beauty',makeup:'依雙方確認辦理取消與改期',privacyNotice:'純合成資料告知',beauty:{serviceScope:'一般非醫療美容與保養',productsAndMethods:'服務前說明當次產品與方式',specificRisks:'泛紅、敏感、刺激或其他不適',precautions:'請私下說明必要過敏或皮膚資訊',aftercare:'不適持續請聯絡本店並尋求醫療專業協助',emergencyProcedure:'立即停止操作並協助就醫',refundRule:'依適用法令辦理'}});
return <main className="mx-auto min-w-0 max-w-[1440px] p-4"><CourseAgreementWorkspace key={store} initial={{storeId:store,revision:0,draft:{...draft,brand:store==='a'?draft.brand:'另一間合成店'},active:null}}
save={async(input)=>{window.qaSaves.push(input);await new Promise(r=>setTimeout(r,50));if(window.qaSaves.length===1)return{success:false,error:'模擬儲存失敗，輸入已保留'};return{success:true,data:{...input,revision:1,active:null,document:buildCourseAgreement(input.draft),documentHash:'a'.repeat(64)}}}}
publish={async(input)=>{window.qaPublishes.push(input);await new Promise(r=>setTimeout(r,50));if(window.qaPublishes.length===1)return{success:false,error:'模擬啟用失敗，請重試'};return{success:true,data:{storeId:store,revision:2,draft:window.qaSaves.at(-1).draft,active:{id:'v1',version:1,documentHash:input.documentHash}}}}}/></main>}
createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, jsx: 'automatic', format: 'iife', outfile: out + '/fixture.js',
 define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@': path.join(root, 'src') },
 plugins: [{ name: 'next-fixture', setup(b) {
 b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'qa' }));
 b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'qa' }));
 b.onLoad({ filter: /.*/, namespace: 'qa' }, a => ({ contents: a.path === 'navigation'
 ? `export const unstable_rethrow=()=>{};export const useRouter=()=>({refresh(){},push(){},replace(){}});export const usePathname=()=>'/s/test-store/admin/dashboard/courses/agreements';export const useSearchParams=()=>new URLSearchParams();`
 : `import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}`,
 loader: 'js', resolveDir: root }));
 }}] });
const css = await postcss([tailwind({ base: root })]).process(readFileSync('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') });
writeFileSync(out + '/fixture.css', css.css);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [], results = [];
try {
 const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
 await page.route('**/*', route => route.request().url().startsWith('https://synthetic.invalid/')
 ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>' }) : route.abort());
 await page.goto('https://synthetic.invalid/'); await page.addStyleTag({ path: out + '/fixture.css' }); await page.addScriptTag({ path: out + '/fixture.js' });
 await page.getByRole('heading', { name: beauty ? '服務共同約定' : '課程共同約定', exact: true }).waitFor();
 if (await page.getByRole('link', { name: beauty ? '返回服務設定' : '返回課程設定' }).getAttribute('href') !== (beauty ? '/s/test-store/admin/dashboard/beauty?tab=設定&section=store' : '/s/test-store/admin/dashboard/courses?view=settings&section=store')) throw Error('Return lost store prefix');
 await page.getByRole('button', { name: '開始設定', exact: true }).click();
 await page.getByLabel('品牌／店名', { exact: true }).fill('合成音樂教室・桌機與 iPad 跨尺寸保留草稿');
 for (const [width, height] of [[1920,1080],[1366,900],[1024,768],[768,1024],[600,900],[390,844]]) {
  await page.setViewportSize({ width, height });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Overflow at ' + width);
  if (!(await page.getByLabel('品牌／店名', { exact: true }).inputValue()).includes('跨尺寸保留草稿')) throw Error('Resize discarded draft');
  await page.screenshot({ path: out + '/edit-' + width + '.png', fullPage: true }); results.push({ width, height, overflow: false, draftRetained: true });
 }
 await page.getByRole('button', { name: beauty ? '下一步：服務規則' : '下一步：課程規則' }).click();
 await page.getByLabel(beauty ? '取消或改期期限' : '請假期限', { exact: true }).selectOption('deadline');
 await page.getByLabel(beauty ? '預約前幾日（0 為當日）' : '上課前幾日（0 為當日）').fill('1'); await page.getByLabel('截止時間（台灣時間）').fill('21:00');
 if(fitness||beauty){await page.getByRole('button',{name:beauty?'下一步：服務風險與照護':'下一步：運動與風險'}).click();await page.getByLabel(beauty?'可能反應與服務風險':'課程特有風險',{exact:true}).fill(beauty?'泛紅、敏感、刺激等反應':'彈力帶回彈、跌倒與碰撞');}
 await page.getByRole('button', { name: '下一步：個資告知' }).click();
 await page.getByRole('button', { name: '儲存並預覽', exact: true }).click();
 await page.getByRole('alert').filter({ hasText: '模擬儲存失敗' }).waitFor();
 if (!(await page.getByLabel('個人資料告知', { exact: true }).inputValue()).includes('合成資料')) throw Error('Failure discarded input');
 await page.getByRole('button', { name: '儲存並預覽', exact: true }).click();
 await page.getByText(beauty ? /最晚應於預約服務前一日 21:00/ : /最晚應於上課前一日 21:00/).waitFor();
 if (!await page.getByRole('button', { name: '確認啟用', exact: true }).isDisabled()) throw Error('Activation missing acknowledgement gate');
 for (const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]) {
  await page.setViewportSize({width,height});
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Preview overflow ' + width);
  await page.screenshot({path:out+'/preview-'+width+'.png',fullPage:true});
 }
 await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '確認啟用', exact: true }).click();
 await page.getByRole('alert').filter({hasText:'模擬啟用失敗'}).waitFor();
 await page.getByRole('button', { name: '確認啟用', exact: true }).click();
 await page.getByRole('status').filter({hasText:'已啟用 v1.0'}).waitFor();
 const requests=await page.evaluate(()=>({saves:window.qaSaves,publishes:window.qaPublishes}));
 if(JSON.stringify(requests.saves[0])!==JSON.stringify(requests.saves[1]))throw Error('Save retry changed request');
 if(JSON.stringify(requests.publishes[0])!==JSON.stringify(requests.publishes[1]))throw Error('Publish retry changed request');
 await page.getByRole('button',{name:'修改草稿',exact:true}).click();
 if (!(await page.getByLabel('品牌／店名',{exact:true}).inputValue()).includes('跨尺寸'))throw Error('Reopen lost saved state');
 await page.evaluate(()=>window.qaSwitchStore()); await page.getByRole('button',{name:'開始設定',exact:true}).click();
 if(await page.getByLabel('品牌／店名',{exact:true}).inputValue()!=='另一間合成店')throw Error('Store switch leaked previous draft');
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(out+'/results.json',JSON.stringify({synthetic:true,realBackend:false,results,saveRetryStable:true,publishRetryStable:true,storeSwitchIsolated:true,errors},null,2));
 console.log(JSON.stringify({synthetic:true,results,errors}));
} catch (error) { console.error(JSON.stringify(errors)); const page=browser.contexts()[0]?.pages()[0]; if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});} throw error; } finally { await browser.close(); }
