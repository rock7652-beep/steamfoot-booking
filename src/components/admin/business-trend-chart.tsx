"use client";
import dynamic from 'next/dynamic';
import {TrendChartBoundary,TrendChartLoading} from '@/components/trend-chart-loading';
import type {BusinessTrendPlotProps} from '@/components/trend-chart-plots';

const Plot=dynamic(()=>import('@/components/trend-chart-plots').then(module=>module.BusinessTrendPlot),{ssr:false,loading:TrendChartLoading});

export function BusinessTrendChart({rows,label,unit,monthly=false,year=false}:BusinessTrendPlotProps){
 return rows.length?<div className="overflow-x-auto"><div className={`h-60 ${monthly&&year?"min-w-[840px]":"min-w-[480px]"}`}><TrendChartBoundary><Plot rows={rows} label={label} unit={unit} monthly={monthly} year={year}/></TrendChartBoundary></div></div>:<p className="py-8 text-center text-sm text-earth-500">本期尚無紀錄。</p>;
}
