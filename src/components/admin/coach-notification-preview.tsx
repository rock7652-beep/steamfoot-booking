'use client';
import { courseDisplayText } from "@/lib/course-display-text";
import { coachNoticeFlex,type CoachNoticeKind } from '@/lib/course-coach-notifications';
type Node={type:string;text?:string;color?:string;weight?:string;size?:string;layout?:string;contents?:Node[];action?:{label:string}};
function FlexNode({node}:{node:Node}){
 if(node.type==='text')return <p className={`${node.weight==='bold'?'font-semibold':''} whitespace-pre-wrap break-words text-sm`} style={{color:node.color}}>{node.text}</p>;
 if(node.type==='button')return <div className="rounded-lg px-3 py-3 text-center text-sm font-medium text-white" style={{backgroundColor:node.color}}>{node.action?.label}</div>;
 return <div className={`flex ${node.layout==='horizontal'?'flex-row items-start':'flex-col'} gap-2`}>{node.contents?.map((child,i)=><FlexNode key={i} node={child}/>)}</div>;
}
export function CoachNotificationPreview({kind,music=false}:{kind:CoachNoticeKind;music?:boolean}){
 const rows=[{name:music?'吉他個別課':'肌力訓練',startsAt:'2026-10-03T01:00:00Z',endsAt:'2026-10-03T02:00:00Z',room:'A 空間',color:'#40986F',detail:kind==='DIGEST'?'體驗 2 位':kind==='CHANGE'?'授課安排已更新':'王小美 · 新增體驗',...(kind==='CHANGE'?{previous:'原 2026-10-03 08:00–09:00'}:{})}];
 const message=coachNoticeFlex(kind,'示範教室',rows,'https://example.com',kind==='DIGEST'?'2026-10-03':undefined);
 const bubble=message.contents as {body:Node;footer:Node};
 return <div className="py-3"><p className="mb-3 text-center text-xs text-earth-500">示意資料 · 與實際通知共用內容及配色，預覽不發送</p><div aria-label={courseDisplayText("教練通知卡片預覽", music)} className="mx-auto max-w-[360px] rounded-2xl border border-earth-200 bg-white p-4 shadow-sm"><FlexNode node={bubble.body}/><div className="mt-4"><FlexNode node={bubble.footer}/></div></div></div>;
}
