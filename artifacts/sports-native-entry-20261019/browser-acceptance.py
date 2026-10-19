from playwright.sync_api import sync_playwright
from pathlib import Path
import json,re
root=Path(__file__).resolve().parent;results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for store,readonly in [('store-ido-xinzhuang',False),('store-ido-banqiao',False),('store-ido-banqiao',True)]:
  for width,height in [(1440,900),(1024,1366),(1366,1024)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width==1024);page=ctx.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:5189/?store={store}&readonly={1 if readonly else 0}',wait_until='networkidle')
   page.get_by_text('課表排程',exact=True).wait_for()
   for mode in ['週表','日表','月表']:
    page.get_by_role('button',name=mode,exact=True).click()
   button=page.get_by_role('button',name='＋ 排課',exact=True)
   opened=False
   if not readonly:
    assert button.count()==1 and button.is_enabled()
    button.click();page.get_by_text('新增排課',exact=True).wait_for()
    for label in ['固定每週','固定隔週','單次','體驗','空間出租']:
     assert page.get_by_role('button',name=re.compile(label)).count()>0,label
    assert page.get_by_text('指定學員',exact=True).count()>0
    assert page.get_by_text('開放選課',exact=True).count()>0
    opened=True
   else:
    assert button.count()==0 or button.is_disabled()
    assert page.get_by_text('新增排課',exact=True).count()==0
   overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
   assert not overflow,(store,readonly,width,'overflow')
   assert not errors,errors
   name=f'{store}-'+('readonly' if readonly else 'owner')+f'-{width}x{height}.png'
   page.screenshot(path=str(root/name),full_page=True)
   row={'store':store,'readonly':readonly,'viewport':[width,height],'touch':width==1024,'monthWeekDaySwitch':True,'nativeFormOpened':opened,'globalOverflow':overflow,'pageErrors':errors,'screenshot':name}
   results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
   ctx.close()
 browser.close()
(root/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
