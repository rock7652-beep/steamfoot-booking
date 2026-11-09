// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), submit: vi.fn() }));
vi.mock("@/server/actions/beauty", () => ({ readBeautySlots: m.read, submitBeautyTrial: m.submit }));
import { BeautyPublicBookingForm } from "@/components/beauty/public-booking-form";
import type { BeautyBookingCatalog } from "@/components/beauty/booking-form";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const catalog: BeautyBookingCatalog = {
  policy: { revision: 4, selfBooking: true, selfCancel: true, selfReschedule: true, cancelDeduct: false, noShowDeduct: false, cancelLeadMinutes: 120 },
  services: [{ id: "massage", name: "全身按摩", duration: 60, trialDuration: 30, trialPrice: 750, price: 1200, revision: 2 }],
  techs: [{ id: "f", name: "技師甲", gender: "FEMALE", serviceIds: ["massage"] }],
};
const roots: { root: ReturnType<typeof createRoot>; host: HTMLDivElement }[] = [];
function mount(props: Partial<Parameters<typeof BeautyPublicBookingForm>[0]> = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push({ root, host });
  act(() => root.render(h(BeautyPublicBookingForm, { catalog, slug: "soulife", ...props })));
  return host;
}
function button(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === label || b.getAttribute("aria-label")===label);
  if (!found) throw new Error(`Missing button: ${label}`); return found;
}
function field(host: HTMLElement, label: string) {
  if (label === "服務項目") return host.querySelector<HTMLInputElement>('input[type="radio"]:checked')!;
  if (label === "日期") return host.querySelector('[aria-label="選擇日期"]') as HTMLInputElement;
  const found = [...host.querySelectorAll("label")].find(l => l.textContent?.trim() === label);
  if (!found) throw new Error(`Missing field: ${label}`);
  return (found.htmlFor ? document.getElementById(found.htmlFor) : found.querySelector("input,select,textarea")) as HTMLInputElement;
}
function set(el: HTMLInputElement, value: string) {
  act(() => {
    if (el.type === "radio") { el.closest('[role="group"]')!.querySelector<HTMLInputElement>(`input[value="${value}"]`)!.click(); return; }
    if (el.tagName === "DIV") { el.querySelector<HTMLButtonElement>(`button[aria-label^="${value} "]`)!.click(); return; }
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
const day='2026-10-26';
const click=async(host:HTMLElement,label:string)=>{await act(async()=>button(host,label).click());};
const selectDate=async(host:HTMLElement,date=day)=>{await act(async()=>host.querySelector<HTMLButtonElement>(`button[aria-label^="${date} "]`)!.click());};
function fill(host:HTMLElement){set(field(host,'手機'),'0900000000');set(field(host,'技師安排'),'ANY');set(field(host,'姓名'),'預約人');}
async function schedule(host:HTMLElement){fill(host);await click(host,'下一步：選擇日期與時段');}
async function chooseTime(host:HTMLElement){await schedule(host);await selectDate(host);await click(host,'09:00');await click(host,'下一步：確認預約');}
beforeEach(()=>{vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-26T01:00:00Z'));m.read.mockResolvedValue({success:true,data:{slots:['09:00','10:00']}});m.submit.mockResolvedValue({success:true,data:{groupId:'group',ids:['booking']}});});
afterEach(()=>{for(const {root,host} of roots.splice(0)){act(()=>root.unmount());host.remove();}vi.useRealTimers();vi.restoreAllMocks();});
it('uses three distinct pages and automatically reads slots for the clicked date; visit details appear only on confirmation',async()=>{
 const host=mount({publicInfo:{address:'測試地址',massageReminder:true}});
 expect(host.querySelector('[aria-label="選擇日期"]')).toBeNull();expect(host.textContent).not.toContain('測試地址');
 await schedule(host);expect(host.querySelector('[aria-label="選擇日期"]')).toBeTruthy();expect(m.read).not.toHaveBeenCalled();expect(host.textContent).not.toContain('查詢可用時段');
 await selectDate(host,'2026-10-27');expect(m.read).toHaveBeenCalledExactlyOnceWith('public','soulife',expect.objectContaining({date:'2026-10-27',isTrial:true,people:[{phone:'0900000000',serviceId:'massage',serviceRevision:2,preference:'ANY',specifiedTechnicianId:null}]}));
 await click(host,'10:00');await click(host,'下一步：確認預約');expect(host.textContent).toContain('10:00–10:30');expect(host.textContent).toContain('測試地址');expect(host.textContent).toContain('按摩小提醒');expect(host.textContent).toContain('體驗總額 NT$750');expect(host.querySelector('input[type="tel"]')).toBeNull();expect(m.submit).not.toHaveBeenCalled();
 await click(host,'確認預約');expect(host.textContent).toContain('預約成功');expect(m.submit.mock.lastCall?.[1]).toMatchObject({date:'2026-10-27',time:'10:00',contactName:'預約人',phone:'0900000000'});
});
it('marks missing phone, preference and name before proceeding and focuses the first missing field',async()=>{const host=mount();await click(host,'下一步：選擇日期與時段');expect(m.read).not.toHaveBeenCalled();for(const label of ['手機','技師安排','姓名'])expect(field(host,label).getAttribute('aria-invalid')).toBe('true');expect(document.activeElement).toBe(field(host,'手機'));});
it('uses the selected free trial, duration and specified qualified technician for the authoritative read and submission',async()=>{
 const host=mount({catalog:{...catalog,services:[...catalog.services,{id:'free',name:'免費體驗',duration:60,trialDuration:20,trialPrice:0,price:999,revision:3},{id:'off',name:'未開放',duration:30,trialPrice:null,price:999}],techs:[{id:'f',name:'技師甲',gender:'FEMALE',serviceIds:['massage','free']}]}});expect(host.textContent).not.toContain('未開放');fill(host);set(field(host,'服務項目'),'free');set(field(host,'技師安排'),'SPECIFIC');await click(host,'下一步：選擇日期與時段');expect(host.textContent).toContain('請選擇提供此服務的技師');set(field(host,'選擇技師'),'f');await click(host,'下一步：選擇日期與時段');await selectDate(host);expect(m.read.mock.lastCall?.[2].people[0]).toMatchObject({serviceId:'free',serviceRevision:3,preference:'FEMALE',specifiedTechnicianId:'f'});await click(host,'10:00');await click(host,'下一步：確認預約');expect(host.textContent).toContain('10:00–10:20');expect(host.textContent).toContain('體驗總額 NT$0');await click(host,'確認預約');expect(m.submit.mock.lastCall?.[1].people[0]).toMatchObject({serviceId:'free',specifiedTechnicianId:'f'});
});
it('rejects duplicate trial identities while retaining the first companion draft',async()=>{const host=mount();fill(host);await click(host,'＋新增同行者');const groups=[...host.querySelectorAll('section[aria-label^="服務安排 "]')] as HTMLElement[];set(field(groups[1],'手機'),'0900000000');set(field(groups[1],'技師安排'),'ANY');await click(host,'下一步：選擇日期與時段');expect(host.textContent).toContain('同一手機不可重複預約相同體驗服務');expect(m.read).not.toHaveBeenCalled();act(()=>host.querySelector<HTMLButtonElement>('[aria-label="移除第 2 位"]')!.click());expect(field(host,'手機').value).toBe('0900000000');});
it('ignores late results from the previous date and keeps only the latest date slots',async()=>{const host=mount();await schedule(host);let first!:(v:unknown)=>void,second!:(v:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(r=>{first=r;})).mockImplementationOnce(()=>new Promise(r=>{second=r;}));await selectDate(host);await selectDate(host,'2026-10-27');await act(async()=>second({success:true,data:{slots:['10:00']}}));expect(host.textContent).toContain('10:00');await act(async()=>first({success:true,data:{slots:['09:00']}}));expect(host.textContent).not.toContain('09:00');expect(button(host,'下一步：確認預約').disabled).toBe(true);});
it('offers an in-place retry on read failure and keeps service and identity data',async()=>{const host=mount();await schedule(host);m.read.mockRejectedValueOnce(new Error('offline'));await selectDate(host);expect(host.textContent).toContain('時段讀取失敗');expect(button(host,'下一步：確認預約').disabled).toBe(true);await click(host,'重新讀取時段');expect(host.textContent).toContain('09:00');await click(host,'返回修改服務與資料');expect(field(host,'姓名').value).toBe('預約人');expect(field(host,'手機').value).toBe('0900000000');});
it('separates a full open day from a closed business day',async()=>{const host=mount();await schedule(host);m.read.mockResolvedValueOnce({success:true,data:{slots:[]}});await selectDate(host);expect(host.textContent).toContain('當日沒有可安排');expect(host.querySelector<HTMLButtonElement>(`button[aria-label^="${day} "]`)!.disabled).toBe(false);expect(button(host,'下一步：確認預約').disabled).toBe(true);});
it('disables weekly closure and special closure but permits a special reopening',async()=>{const host=mount({catalog:{...catalog,publicCalendar:{weekdays:[true,false,true,true,true,true,true],exceptions:{'2026-10-27':false,'2026-10-26':true}}}});await schedule(host);expect(host.querySelector<HTMLButtonElement>('[aria-label="2026-10-27 公休"]')!.disabled).toBe(true);expect(host.querySelector<HTMLButtonElement>('[aria-label="2026-10-26 選擇日期"]')!.disabled).toBe(false);await click(host,'下個月');expect(host.querySelector<HTMLButtonElement>('[aria-label="2026-11-02 公休"]')!.disabled).toBe(true);expect(m.read).not.toHaveBeenCalled();});
it('preserves time on back navigation and refreshes availability after editing contact and service requirements',async()=>{const host=mount();await chooseTime(host);await click(host,'返回修改日期與時段');expect(button(host,'09:00').getAttribute('aria-pressed')).toBe('true');await click(host,'返回修改服務與資料');set(field(host,'姓名'),'修改姓名');set(field(host,'手機'),'+886 911 111 111');await click(host,'下一步：選擇日期與時段');expect(m.read.mock.lastCall?.[2].people[0].phone).toBe('0911111111');expect(button(host,'09:00').getAttribute('aria-pressed')).toBe('true');await click(host,'下一步：確認預約');await click(host,'確認預約');expect(m.submit.mock.lastCall?.[1]).toMatchObject({people:[{name:'修改姓名',phone:'0911111111'}]});});
it('uses the separate contact and notes entered on page one',async()=>{const host=mount({entry:'entry'});fill(host);set(field(host,'本次備註'),'方便時聯絡');act(()=>field(host,'另設聯絡人').click());set(field(host,'聯絡人姓名'),'代約人');set(field(host,'聯絡人手機'),'0922222222');await click(host,'下一步：選擇日期與時段');await selectDate(host);await click(host,'09:00');await click(host,'下一步：確認預約');await click(host,'確認預約');expect(m.submit.mock.lastCall).toMatchObject(['soulife',{contactName:'代約人',phone:'0922222222',people:[{name:'預約人',notes:'方便時聯絡'}]},'entry']);});
it('retries an uncertain submission using the same request and blocks double clicks and editing',async()=>{const host=mount();await chooseTime(host);m.submit.mockRejectedValueOnce(new Error('offline'));await act(async()=>{button(host,'確認預約').click();button(host,'確認預約').click();});expect(m.submit).toHaveBeenCalledOnce();const sent=m.submit.mock.calls[0][1];expect(host.querySelector('fieldset')!.disabled).toBe(true);expect(button(host,'返回修改日期與時段').disabled).toBe(true);await click(host,'重試確認');expect(m.submit.mock.calls[1][1]).toEqual(sent);expect(host.textContent).toContain('預約成功');});
it('shows rejected eligibility without displaying a success receipt',async()=>{const host=mount();await chooseTime(host);m.submit.mockResolvedValueOnce({success:false,error:'已使用體驗資格'});await click(host,'確認預約');expect(host.textContent).toContain('已使用體驗資格');expect(host.querySelector('[aria-label="預約成功"]')).toBeNull();});
it('only marks LINE linked from an authoritative result and retries notification using the original request',async()=>{const host=mount({entry:'verified-entry'});await chooseTime(host);await click(host,'確認預約');expect(host.textContent).toContain('LINE 通知尚未連結');const sent=m.submit.mock.calls[0][1];m.submit.mockResolvedValueOnce({success:true,data:{groupId:'group',ids:['booking'],notificationSetup:{status:'linked'}}});await click(host,'重新確認 LINE 連結');expect(m.submit.mock.calls[1]).toEqual(['soulife',sent,'verified-entry']);expect(host.textContent).toContain('LINE 通知已連結');expect(host.textContent).not.toContain('已送達');});
it('starts a new verified booking through a fresh entry after success',async()=>{const host=mount({entry:'used-entry',publicInfo:{lineEntryHref:'https://liff.line.me/902-synthetic/public-trial'}});await chooseTime(host);await click(host,'確認預約');expect([...host.querySelectorAll('a')].find(a=>a.textContent==='再預約一筆')?.href).toBe('https://liff.line.me/902-synthetic/public-trial');});
it('keeps shared goods quantities through steps and submits the original catalog revision',async()=>{const sharedGoodsCatalog={revision:3,groups:[{id:'drinks',subjectIds:['massage'],title:'飲品',kind:'SHARED_GOODS' as const,required:false,multiple:true,options:[{id:'tea',name:'茶',price:80,duration:0,active:true}]}]};const host=mount({catalog:{...catalog,sharedGoodsCatalog}});fill(host);act(()=>host.querySelector<HTMLInputElement>('[aria-label="共同商品選購"] input[type="checkbox"]')!.click());act(()=>host.querySelector<HTMLButtonElement>('[aria-label="增加茶"]')!.click());await click(host,'下一步：選擇日期與時段');await selectDate(host);await click(host,'09:00');await click(host,'下一步：確認預約');expect(host.textContent).toContain('預約總額 NT$910');await click(host,'返回修改日期與時段');await click(host,'返回修改服務與資料');expect(host.querySelector('output')?.textContent).toBe('2');await click(host,'下一步：選擇日期與時段');await click(host,'下一步：確認預約');await click(host,'確認預約');expect(m.submit.mock.lastCall?.[1]).toMatchObject({sharedGoods:{revision:3,selections:[{id:'tea',quantity:2}]}});});
it('does not show contact inputs when trials are unavailable or self-booking is off',()=>{expect(mount({catalog:{...catalog,services:[]}}).querySelector('input')).toBeNull();expect(mount({catalog:{...catalog,policy:{...catalog.policy!,selfBooking:false}}}).querySelector('input')).toBeNull();});
