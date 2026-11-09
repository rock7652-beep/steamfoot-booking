import {afterEach,expect,it,vi} from 'vitest';
import {lineDeliveryResumeAt,isLineDeliveryEventCurrent,isSystemLineDeliveryPaused} from '@/lib/line-delivery-pause';
import {systemLineFlexMessages} from '@/lib/line-system-flex';
import {pushMessage,pushSteamButlerMessage,replyMessage,replySteamButlerMessage} from '@/lib/line';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});
it('keeps delivery paused until an explicit, valid cutover has arrived',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T15:00:00Z'));
 for(const value of ['', 'bad','2026-10-30T16:00:00.000Z']){vi.stubEnv('LINE_DELIVERY_RESUME_AT',value);expect(isSystemLineDeliveryPaused()).toBe(true);}
 vi.stubEnv('LINE_DELIVERY_RESUME_AT','2026-10-30T14:00:00.000Z');expect(isSystemLineDeliveryPaused()).toBe(false);
 expect(lineDeliveryResumeAt()?.toISOString()).toBe('2026-10-30T14:00:00.000Z');
});
it('quarantines old, missing, invalid and forged-future timestamps independently of retry time',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T15:00:00Z'));vi.stubEnv('LINE_DELIVERY_RESUME_AT','2026-10-30T14:00:00.000Z');
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 for(const time of [undefined,new Date('2026-10-30T13:59:59Z'),new Date('invalid'),new Date('2026-10-31T00:00:00Z')]){
  expect(isLineDeliveryEventCurrent(time)).toBe(false);
  expect(await pushMessage('synthetic','recipient',[{type:'text',text:'old'}],'retry',time)).toMatchObject({success:false,errorType:'delivery_paused'});
  expect(await pushSteamButlerMessage('recipient',[{type:'text',text:'old'}],'retry',time)).toMatchObject({success:false,errorType:'delivery_paused'});
 }
 expect(isLineDeliveryEventCurrent(new Date('2026-10-30T14:00:00Z'))).toBe(true);expect(fetch).not.toHaveBeenCalled();
});
it('keeps Flex cards unchanged and converts text without losing quick replies or useful links',()=>{
 const card={type:'flex' as const,altText:'existing',contents:{type:'bubble'}};
 const quickReply={items:[{type:'action' as const,action:{type:'message' as const,label:'停止關懷',text:'停止關懷'}}]};
 const messages=systemLineFlexMessages([card,{type:'text',text:'綁定已完成。\n查看預約：https://example.invalid/bookings',quickReply}]);
 expect(messages[0]).toBe(card);expect(messages[1]).toMatchObject({type:'flex',quickReply,altText:expect.stringContaining('綁定已完成')});
 expect(JSON.stringify(messages[1])).toContain('"action":{"type":"uri","uri":"https://example.invalid/bookings"}');
 expect(messages.every(m=>m.type==='flex')).toBe(true);
});
it('retains long Unicode content in bounded Flex components',()=>{
 const text='測試😀'.repeat(1400),[message]=systemLineFlexMessages([{type:'text',text}]);
 expect(message.type).toBe('flex');if(message.type!=='flex')return;
 expect(message.altText.length).toBeLessThanOrEqual(350);expect(message.altText).not.toMatch(/[\uD800-\uDBFF]$/u);
 const body=message.contents.body as {contents:Array<{text:string}>};
 expect(body.contents.map(c=>c.text).join('')).toBe(text);expect(body.contents.every(c=>Array.from(c.text).length<=1000)).toBe(true);
});
it('resumes new store and central push/reply with only Flex payloads at the actual API boundary',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T15:00:00Z'));
 for(const [key,value] of Object.entries({LINE_DELIVERY_RESUME_AT:'2026-10-30T14:00:00.000Z',VERCEL_ENV:'production',STORE_LINE_CONFIG_JSON:'',STORE_LINE_ADDITIONAL_CONFIG_JSON:'',LINE_HSINCHU_CHANNEL_ACCESS_TOKEN:'synthetic-store-token',STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN:'synthetic-central-token'}))vi.stubEnv(key,value);
 const fetch=vi.fn(async()=>({ok:true,status:200,json:async()=>({})}));vi.stubGlobal('fetch',fetch);
 const messages=[{type:'text' as const,text:'綁定已完成'}],at=new Date();
 const results=await Promise.all([pushMessage('store-hsinchu','synthetic',messages,'retry',at),pushSteamButlerMessage('synthetic',messages,'retry',at),replyMessage('store-hsinchu','reply',messages),replySteamButlerMessage('reply',messages)]);
 for(const result of results)expect(result.success).toBe(true);
 expect(fetch).toHaveBeenCalledTimes(4);
 for(const call of fetch.mock.calls){const body=JSON.parse(String((call as unknown as [string,RequestInit])[1].body));expect(body.messages).toMatchObject([{type:'flex',altText:'綁定已完成'}]);}
});
