import {expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
vi.mock('@/server/actions/sports-staging',()=>({loadSportsStaging:vi.fn(),saveSportsSubject:vi.fn(),saveSportsFee:vi.fn(),sportsStagingCommand:vi.fn()}));
import {SportsStagingWorkspace} from '@/components/admin/sports-staging-workspace';
import type {SportsSnapshot} from '@/lib/sports-staging-types';
const initial:SportsSnapshot={storeId:'pilot-store',date:'2026-10-18',subjects:[],fees:[],lessons:[],students:[],customers:[],coaches:[],rooms:[]};
it('identifies real store and never labels real transactions as test data',()=>{
 const html=renderToStaticMarkup(React.createElement(SportsStagingWorkspace,{initial,production:true,storeName:'運動正式入口預覽'}));
 expect(html).toContain('運動正式入口預覽');expect(html).not.toContain('隔離測試站');expect(html).not.toContain('使用獨立測試資料庫');expect(html).toContain('新增排課');
 if(process.env.SPORTS_ENABLE_CAPTURE==='1'){mkdirSync('artifacts/sports-production-enable',{recursive:true});writeFileSync('artifacts/sports-production-enable/presentation.html','<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:system-ui}'+readFileSync('src/components/admin/sports-staging.css','utf8')+'</style>'+html);}
});
it('keeps QA labels in isolated mode',()=>{expect(renderToStaticMarkup(React.createElement(SportsStagingWorkspace,{initial}))).toContain('隔離測試站');});

it.each([['catalog','教學項目'],['plans','收費方式'],['schedule','課表']])('opens the integrated %s entry on the correct tab',(view,tab)=>{
 const html=renderToStaticMarkup(React.createElement(SportsStagingWorkspace,{initial,integratedNavigation:true,initialView:view}));
 expect(html).toContain(`<h1>${tab}</h1>`);expect(html).toContain(`aria-label="${tab}" aria-current="page"`);
});
