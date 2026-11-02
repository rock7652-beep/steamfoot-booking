import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AddOnFields,AddOnChoices} from '@/components/add-ons/fields';
const groups=[{id:'g',title:'額外加購',required:false,multiple:false,options:[{id:'tea',name:'養生茶',price:80,duration:0,active:true}]}];
it.each(['STEAMFOOT','FITNESS','MUSIC'] as const)('%s hides duration and quantity controls while retaining optional single selection',module=>{
 const editor=renderToStaticMarkup(createElement(AddOnFields,{module,storeId:'s',initial:groups}));
 expect(editor).not.toContain('增加時間（分鐘）');expect(editor).not.toContain('服務圖片 ·');
 expect(editor).toContain('增加金額');expect(editor).not.toMatch(/<input[^>]*(?:name|aria-label)="(?:quantity|數量)"/);
 const choices=renderToStaticMarkup(createElement(AddOnChoices,{module,groups,selected:[],onChange:()=>{}}));
 expect(choices).toContain('不選');expect(choices).toContain('type="radio"');expect(choices).not.toContain('分鐘');expect(choices).not.toContain('不增加時間');
});
it('beauty retains duration inputs',()=>{
 expect(renderToStaticMarkup(createElement(AddOnFields,{module:'BEAUTY',storeId:'s',initial:groups}))).toContain('aria-label="時間（分鐘）"');
});
