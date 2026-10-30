import type {LineFlexMessage,LineMessage} from './line';

function textParts(value:string):Record<string,unknown>[] {
 const parts:Record<string,unknown>[]=[];
 const links=[...value.matchAll(/https?:\/\/[^\s<>「」『』]+/g)];
 let offset=0;
 const add=(text:string,uri?:string)=>{
  const chars=Array.from(text);
  for(let i=0;i<chars.length;i+=1000)parts.push({type:'text',text:chars.slice(i,i+1000).join(''),wrap:true,size:'sm',color:uri?'#45685A':'#36584B',...(uri?{action:{type:'uri',uri},decoration:'underline'}:{})});
 };
 for(const match of links){
  const index=match.index!,uri=match[0].replace(/[，。；、）]+$/u,'');
  let safe=false;try{const url=new URL(uri);safe=!url.username&&!url.password&&['https:','http:'].includes(url.protocol)&&uri.length<=1000;}catch{}
  if(!safe)continue;
  add(value.slice(offset,index));add(uri,uri);offset=index+uri.length;
 }
 add(value.slice(offset));
 return parts;
}

/** Every system delivery is Flex. Preserve existing cards and quick-reply actions. */
export function systemLineFlexMessages(messages:LineMessage[]):LineMessage[]{
 return messages.map(message=>{
  if(message.type==='flex')return message;
  const chars=Array.from(message.text||'通知');
  let altText='';
  for(const char of chars){if(altText.length+char.length>350)break;altText+=char;}
  const contents=textParts(message.text||'通知');
  return {type:'flex',altText,contents:{type:'bubble',body:{type:'box',layout:'vertical',spacing:'md',contents}},...(message.quickReply?{quickReply:message.quickReply}:{})} satisfies LineFlexMessage;
 });
}
