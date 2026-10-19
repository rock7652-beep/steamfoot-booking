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
 p.goto('http://localhost:3107/s/sports-live-flow/admin/dashboard/courses?date=2027-01-01',timeout=120000,wait_until='networkidle')
 p.get_by_role('button',name='週表',exact=True).click()
 p.get_by_label('課表日期',exact=True).fill('2027-01-04');p.get_by_label('課表日期',exact=True).press('Tab')
 p.get_by_text('容量驗收1',exact=False).count()
 body=p.locator('body').inner_text();assert '發生錯誤' not in body
 record('existing-lessons-readable',sessions=len(sessions(key)),calendarVisible=p.get_by_label('課表日期',exact=True).is_visible())
 # Repair only the isolated legacy fixture; then generation must resume and the warning clear.
 sql("UPDATE \"SportsPreviewScheduleSeries\" SET \"learnerSnapshot\"='"+json.dumps([{'customerId':f['students'][0]['customerId'],'cardId':None}])+"'::jsonb WHERE \"requestKey\"='"+key+"'")
 p.get_by_label('課表日期',exact=True).fill('2027-05-01');p.get_by_label('課表日期',exact=True).press('Tab');p.wait_for_timeout(2500)
 assert '既有課表仍可查看' not in p.locator('body').inner_text()
 assert any(r['startsAt'].startswith('2027-05') for r in sessions(key))
 record('corrected-fixture-resumes-expansion',warningCleared=True,allWithinCapacity=all(r['occupied']<=r['capacity'] for r in sessions(key)))
 result['completed']=True;(root/'recovery.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));b.close()
