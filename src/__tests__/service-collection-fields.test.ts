// @vitest-environment jsdom
import {act,createElement as h} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ServiceCollectionFields} from '@/components/admin/service-collection-fields';
let host:HTMLDivElement,root:Root;const onValue=vi.fn();const charge={id:'b',revision:3,personName:'顧客',serviceName:'做臉',price:1000,discount:{kind:'AMOUNT' as const,value:0},reduction:0,netPrice:1000,collected:200,due:800};
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});onValue.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});afterEach(()=>{act(()=>root.unmount());host.remove();});
async function render(canDiscount=true,value=charge){await act(async()=>root.render(h(ServiceCollectionFields,{charge:value,canDiscount,onValue})));}
async function change(selector:string,value:string){const el=host.querySelector<HTMLInputElement|HTMLSelectElement>(selector)!;await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
it('uses the original discount selector and separates original, discounted due, collected and this payment',async()=>{await render();await change('select','RATE');expect(host.textContent).toContain('原價');expect(host.textContent).toContain('NT$ 900');expect(host.textContent).toContain('已收款 NT$ 200');expect(host.textContent).toContain('未收 NT$ 700');expect(onValue).toHaveBeenLastCalledWith({id:'b',amount:700,valid:true,discount:{kind:'PERCENT',value:10}});await change('[aria-label="本次收款 顧客"]','300');expect(onValue.mock.calls.at(-1)![0]).toMatchObject({amount:300,valid:true});});
it('rejects excessive reduction and collection instead of accepting a negative balance',async()=>{await render();await change('select','AMOUNT');await change('[aria-label="優惠數值"]','900');expect(onValue.mock.calls.at(-1)![0].valid).toBe(false);await change('[aria-label="優惠數值"]','100');await change('[aria-label="本次收款 顧客"]','701');expect(onValue.mock.calls.at(-1)![0].valid).toBe(false);});
it('shows existing discount without editable controls to accounts without discount permission',async()=>{await render(false,{...charge,discount:{kind:'AMOUNT',value:100},reduction:100,netPrice:900,due:700});expect(host.querySelector('select')).toBeNull();expect(onValue.mock.calls.at(-1)![0]).toMatchObject({amount:700,valid:true});});
it('hides the payment input and method when fully discounted, including an old manually entered amount',async()=>{
 await render(true,{...charge,collected:0,due:1000});
 await change('[aria-label="本次收款 顧客"]','500');
 await change('select','AMOUNT');await change('[aria-label="優惠數值"]','1000');
 expect(host.textContent).toContain('全額折抵，免收款');
 expect(host.querySelector('[aria-label="本次收款 顧客"]')).toBeNull();
 expect(onValue.mock.calls.at(-1)![0]).toMatchObject({amount:0,valid:true});
});
