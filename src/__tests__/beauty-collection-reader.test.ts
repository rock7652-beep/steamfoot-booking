import {afterEach,expect,it,vi} from 'vitest';
import {readBeautyCollectionQuote,readBeautyCollectionStatus} from '@/lib/beauty/collection-reader';
afterEach(()=>vi.unstubAllGlobals());
it('quotes use an independent authenticated HTTP read with an explicit store, not a Next Action',async()=>{
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({success:true,data:[]})}));vi.stubGlobal('fetch',fetch);
 await readBeautyCollectionQuote(['a'],'store');const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('/api/beauty/collection-read');expect(init).toMatchObject({method:'POST',credentials:'same-origin',cache:'no-store'});expect(JSON.parse(String(init.body))).toEqual({store:'store',operation:'quote',ids:['a']});expect(init.headers).not.toHaveProperty('Next-Action');
});
it('status lookup never exposes collection writes and retains its exact original key',async()=>{
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({success:true,data:null})}));vi.stubGlobal('fetch',fetch);const requestKey=crypto.randomUUID();await readBeautyCollectionStatus({expectedStoreId:'store',ids:['a'],requestKey});const [,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(JSON.parse(String(init.body))).toEqual({store:'store',operation:'status',ids:['a'],requestKey});
});
it('does not guess a missing store or accept a malformed successful response',async()=>{
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({})}));vi.stubGlobal('fetch',fetch);await expect(readBeautyCollectionQuote(['a'])).rejects.toThrow('門市資訊遺失');expect(fetch).not.toHaveBeenCalled();await expect(readBeautyCollectionQuote(['a'],'store')).rejects.toThrow('回應不正確');
});
it('passes original access failures to the panel instead of treating them as a successful quote',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({success:false,error:'denied'})})));expect(await readBeautyCollectionQuote(['a'],'store')).toEqual({success:false,error:'denied'});
});
