// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {ReferralActionForm} from '@/components/subscription-referrals/action-form';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it('retains receipt input, checks and the original retry command on business failure and lost response',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const action=vi.fn().mockResolvedValueOnce({success:false,message:'收款資料需要核對'}).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({success:true,message:'核對已保存'});
 try{
  await act(async()=>root.render(createElement(ReferralActionForm,{action,button:'核對並保存'},[createElement('input',{key:'command',type:'hidden',name:'commandId',defaultValue:'stable-command'}),createElement('input',{key:'receipt',name:'receiptRef',defaultValue:''}),createElement('input',{key:'checked',name:'confirmed',type:'checkbox'})])));
  const receipt=host.querySelector<HTMLInputElement>('[name="receiptRef"]')!,checkbox=host.querySelector<HTMLInputElement>('[name="confirmed"]')!;
  receipt.value='bank-receipt-1';checkbox.checked=true;
  await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('需要核對');expect(receipt.value).toBe('bank-receipt-1');expect(checkbox.checked).toBe(true);
  await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('結果尚未確認');expect(receipt.value).toBe('bank-receipt-1');
  await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
  expect(action).toHaveBeenCalledTimes(3);for(const call of action.mock.calls)expect([...call[1].entries()]).toEqual([['commandId','stable-command'],['receiptRef','bank-receipt-1'],['confirmed','on']]);
  expect(host.querySelector('[role="status"]')?.textContent).toBe('核對已保存');
 }finally{await act(async()=>root.unmount());host.remove();}
});
