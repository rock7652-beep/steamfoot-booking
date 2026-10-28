// @vitest-environment jsdom
import React,{act,useEffect} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({router:{refresh:vi.fn()},read:vi.fn(),preview:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>m.router,useSearchParams:()=>new URLSearchParams('view=customers'),usePathname:()=>'/s/lubymusic/admin/dashboard/courses'}));
vi.mock('@/lib/music-panel-transport',()=>({musicPanelRead:m.read}));
vi.mock('@/lib/music-finance-sync',async original=>({...await original<typeof import('@/lib/music-finance-sync')>(),isMusicPreviewPage:()=>m.preview()}));
import {PanelReadProvider,usePanelReader} from '@/components/operations/panel-read-cache';
import {capturePurchaseSnapshotReceiver,MUSIC_PURCHASE_APPLY,type MusicPurchaseSnapshot} from '@/lib/music-purchase-snapshot';
import {MUSIC_FINANCE_SIGNAL} from '@/lib/music-finance-sync';
let root:Root,host:HTMLDivElement,seq=0;
let cardReader:ReturnType<typeof usePanelReader<[unknown],unknown>>;
const fallback=async()=>({success:true});
const snapshot={customerId:'learner',overview:{success:true,data:{}},cards:{success:true,rows:[{id:'fresh'}],hasMore:false}} as MusicPurchaseSnapshot;
let browserReader:ReturnType<typeof usePanelReader<[unknown],unknown>>;
function Consumer(){cardReader=usePanelReader('course-card',fallback);browserReader=usePanelReader('course-card-browse',fallback,'1');return null;}
async function render(key='store-a'){await act(async()=>root.render(React.createElement(PanelReadProvider,{key},React.createElement(Consumer))));}
async function signal(kind='purchase'){await act(async()=>{window.dispatchEvent(new CustomEvent(MUSIC_FINANCE_SIGNAL,{detail:`${kind}:test-${seq++}`}));});}
beforeEach(()=>{m.router.refresh.mockClear();m.preview.mockReturnValue(true);Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');root=createRoot(host);m.read.mockReset();m.read.mockResolvedValue({success:true,rows:[{id:'queried'}]});});
afterEach(async()=>{await act(async()=>root.unmount());});
it('uses the submitted authorized projection without a second GET, then resumes live reads',async()=>{await render();const accept=capturePurchaseSnapshotReceiver();accept?.(snapshot);await signal();expect(await cardReader.read({customerId:'learner'})).toEqual(snapshot.cards);expect(m.read).not.toHaveBeenCalled();await cardReader.read({customerId:'learner'});expect(m.read).toHaveBeenCalledTimes(1);});
it('rejects an old purchase response after another invalidation or newer purchase',async()=>{await render();const old=capturePurchaseSnapshotReceiver();await signal('general');old?.(snapshot);await signal();await cardReader.read({customerId:'learner'});expect(m.read).toHaveBeenCalledTimes(1);const first=capturePurchaseSnapshotReceiver();capturePurchaseSnapshotReceiver();first?.(snapshot);await signal();await cardReader.read({customerId:'learner'});expect(m.read).toHaveBeenCalledTimes(2);});
it('rejects late data after switching permission/store scope',async()=>{await render();const accept=capturePurchaseSnapshotReceiver();await render('store-b');accept?.(snapshot);await signal();await cardReader.read({customerId:'learner'});expect(m.read).toHaveBeenCalledTimes(1);});
it('external purchase signals have no data and use authorized reads',async()=>{await render();await signal();await cardReader.read({customerId:'learner'});expect(m.read).toHaveBeenCalledTimes(1);});
it('clears pending reads so an earlier reply cannot replace the new seed',async()=>{await render();let finish!:(value:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(r=>finish=r));const previous=cardReader.read({customerId:'learner'});await Promise.resolve();const accept=capturePurchaseSnapshotReceiver();accept?.(snapshot);await signal();expect(await cardReader.read({customerId:'learner'})).toEqual(snapshot.cards);finish({success:true,rows:[{id:'stale'}]});await previous;await cardReader.read({customerId:'learner'});expect(m.read).toHaveBeenCalledTimes(2);});

it('connects the actual card-browser revision namespace to the one-use scoped projection',async()=>{await render();const accept=capturePurchaseSnapshotReceiver();accept?.(snapshot);await signal();expect(await browserReader.read({customerId:'learner'})).toEqual(snapshot.cards);expect(m.read).not.toHaveBeenCalled();await browserReader.read({customerId:'learner'});expect(m.read).toHaveBeenCalledTimes(1);});

it('applies the same-window projection on ordinary production-style course pages without the Preview finance bus',async()=>{m.preview.mockReturnValue(false);await render();const accept=capturePurchaseSnapshotReceiver();expect(accept).toBeTypeOf('function');accept?.(snapshot);await act(async()=>window.dispatchEvent(new Event(MUSIC_PURCHASE_APPLY)));expect(await cardReader.read({customerId:'learner'})).toEqual(snapshot.cards);expect(m.read).not.toHaveBeenCalled();expect(m.router.refresh).not.toHaveBeenCalled();});
