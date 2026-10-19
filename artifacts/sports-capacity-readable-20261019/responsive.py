import json,subprocess,uuid,time
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).parent
cmd=['env','-u','DOCKER_HOST','-u','DOCKER_CONTEXT','-u','DOCKER_TLS','-u','DOCKER_TLS_VERIFY','-u','DOCKER_CERT_PATH','docker','--host=unix:///var/run/docker.sock','exec','sports-onboarding-fixed-20261019','psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','sports_live_flow_test','-Atc']
def sql(q):return subprocess.check_output(cmd+[q],text=True).strip()
def sessions(key):return json.loads(sql('''SELECT COALESCE(json_agg(row_to_json(x)),'[]'::json) FROM (SELECT s.id,s.capacity,s."startsAt",s."requestKey",(SELECT count(*) FROM "CourseBooking" b WHERE b."sessionId"=s.id AND b.status<>'CANCELLED') AS occupied FROM "CourseSession" s WHERE s."requestKey"='%s' ORDER BY s."startsAt")x'''%key))
result={'completed':False,'checks':[],'pageErrors':[]};f=json.loads((root/'fixture.json').read_text())
def record(name,**kw):result['checks'].append({'name':name,**kw});(root/'recovery-progress.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(name,json.dumps(kw,ensure_ascii=False),flush=True)
with sync_playwright() as w:
 b=w.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);c=b.new_context(viewport={'width':1366,'height':1024});p=c.new_page();p.set_default_timeout(90000);p.on('pageerror',lambda e:result['pageErrors'].append(str(e)))
 p.goto('http://localhost:3107/hq/login?store=sports-live-flow',timeout=120000);p.get_by_label('Email',exact=True).fill('fresh-owner@example.invalid');p.get_by_label('密碼',exact=True).fill('fresh-staging-only-2026');p.get_by_role('button',name='登入',exact=True).click();p.wait_for_url('**/admin/dashboard',timeout=120000);p.goto('http://localhost:3107/s/sports-live-flow/admin/dashboard/courses?date=2026-11-01',timeout=120000,wait_until='networkidle')
 manifest=json.loads(Path('/workspace/sports-onboarding-fresh-20261019/.next/dev/server/server-reference-manifest.json').read_text());ids={v.get('exportedName'):k for k,v in manifest['node'].items()}
 def action(name,payloads):
  assert name in ids,name
  res=p.evaluate('''async ({id,payloads})=>await Promise.all(payloads.map(async payload=>{const r=await fetch(location.href,{method:'POST',headers:{'Next-Action':id,'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify([payload])});return {status:r.status,text:await r.text()};}))''',{'id':ids[name],'payloads':payloads});return [{'status':x['status'],'success':'"success":true' in x['text'],'error':x['text'][-650:] if '"success":true' not in x['text'] else None} for x in res]
 def schedule(day,students,mode='指定學員'):
  key=str(uuid.uuid4());payload={'operation':'schedule','payload':{'subject':f['subjectId'],'fee':f['planId'],'kind':'每週固定','mode':mode,'date':day,'time':'10:00','duration':60,'waitlistLimit':0,'count':1,'coach':f['coach'],'room':f['room'],'capacity':1,'students':students,'price':0,'customer':'','phone':'','requestKey':key}};return key,action('sportsStagingCommand',[payload])
 key=json.loads((root/'results.json').read_text())['checks'][0]['requestKey']
 sql("UPDATE \"SportsPreviewScheduleSeries\" SET \"learnerSnapshot\"='"+json.dumps([{'customerId':x['customerId'],'cardId':None}for x in f['students'][:2]])+"'::jsonb WHERE \"requestKey\"='"+key+"'")
 p.goto('http://localhost:3107/s/sports-live-flow/admin/dashboard/courses?date=2027-03-01',timeout=120000,wait_until='networkidle')
 for width,height,label in [(1366,1024,'desktop'),(1024,768,'ipad-landscape'),(768,1024,'ipad-portrait')]:
  p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(300)
  warning=p.get_by_text('固定課名單超過人數上限，本次展課已暫停；既有課表仍可查看，請核對容量與名單。',exact=True)
  assert warning.is_visible();assert warning.bounding_box()['y']<height
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
  p.screenshot(path=str(root/(label+'.png')),full_page=True);record(label,warningVisibleWithoutScroll=True,noPageHorizontalOverflow=True)
 result['completed']=True;(root/'responsive.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));b.close()
