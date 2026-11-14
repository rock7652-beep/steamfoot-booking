import {expect,it,vi} from 'vitest';
import {canNavigateSettingsPanel} from '@/components/admin/settings-panel-context';
it('can discard only the replaced plan draft without a navigation confirmation',()=>{
 const confirm=vi.fn(()=>false),states=new Map([['plan',{dirty:true,pending:false}]]);
 expect(canNavigateSettingsPanel(states,confirm,{ignoreDirtyFor:'plan'})).toBe(true);expect(confirm).not.toHaveBeenCalled();
 expect(canNavigateSettingsPanel(states,confirm)).toBe(false);expect(confirm).toHaveBeenCalledOnce();
});
it('still guards another unsaved editor and never ignores pending or uncertain work',()=>{
 const confirm=vi.fn(()=>false),states=new Map([['plan',{dirty:true,pending:false}],['note',{dirty:true,pending:false}]]);
 expect(canNavigateSettingsPanel(states,confirm,{ignoreDirtyFor:'plan'})).toBe(false);expect(confirm).toHaveBeenCalledOnce();
 confirm.mockClear();states.set('plan',{dirty:true,pending:true});expect(canNavigateSettingsPanel(states,confirm,{ignoreDirtyFor:'plan'})).toBe(false);expect(confirm).not.toHaveBeenCalled();
});
