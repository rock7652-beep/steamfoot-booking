"use client";
/* eslint-disable @next/next/no-img-element -- immutable generated thumbnail endpoint */
import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {imageCrop,imageCropGesture,type ImageCropState,type ImageCropPoint} from '@/lib/image-crop';
import {compressImageUpload,imageUploadFilename} from '@/lib/image-upload';
export function AddOnImage({id,basePath="/api/beauty/service-images"}:{id?:string|null;basePath?:string}){
 const dialog=useRef<HTMLDialogElement>(null),[opened,setOpened]=useState(false),[failed,setFailed]=useState(false);
 if(!id||failed)return null;
 const url=basePath+'/'+encodeURIComponent(id);
 return <><button type="button" className="shrink-0 rounded-lg" aria-label="放大服務圖片" onClick={()=>{setOpened(true);dialog.current?.showModal();}}><img src={url} width={64} height={64} loading="lazy" alt="服務參考圖片" className="h-16 w-16 rounded-lg object-cover" onError={()=>setFailed(true)}/></button><dialog ref={dialog} className="m-auto max-h-[90dvh] max-w-[95vw] rounded-xl p-3 backdrop:bg-black/60" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><button type="button" className="min-h-11 px-4" onClick={()=>dialog.current?.close()}>關閉圖片</button>{opened&&<img src={url+'?size=full'} alt="完整服務參考圖片" className="max-h-[75dvh] max-w-full object-contain"/>}</dialog></>;
}
export function AddOnImageUpload({storeId,value,onChange,basePath="/api/beauty/service-images"}:{basePath?:string;storeId:string;value?:string|null;onChange:(id:string|null)=>void}){
 const input=useRef<HTMLInputElement>(null),editor=useRef<HTMLDialogElement>(null),frame=useRef<HTMLDivElement>(null);
 const pointers=useRef(new Map<number,ImageCropPoint>());
 const gesture=useRef<{start:ImageCropState;points:ImageCropPoint[]}|null>(null);
 const gestureFrame=useRef<number|null>(null);
 const currentCrop=useRef<ImageCropState>({zoom:1,x:0.5,y:0.5});
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[size,setSize]=useState({width:0,height:0});
 const [x,setX]=useState(0.5),[y,setY]=useState(0.5),[zoom,setZoom]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setPreview(url);editor.current?.showModal();return()=>{URL.revokeObjectURL(url);if(gestureFrame.current!==null)cancelAnimationFrame(gestureFrame.current);gestureFrame.current=null;};},[file]);
 currentCrop.current={zoom,x,y};
 function applyCrop(next:ImageCropState){currentCrop.current=next;setZoom(next.zoom);setX(next.x);setY(next.y);}
 function clearGesture(){if(gestureFrame.current!==null)cancelAnimationFrame(gestureFrame.current);gestureFrame.current=null;pointers.current.clear();gesture.current=null;}
 function resetCrop(){clearGesture();applyCrop({zoom:1,x:0.5,y:0.5});}
 function rebaseGesture(){gesture.current=pointers.current.size?{start:{...currentCrop.current},points:[...pointers.current.values()]}:null;}
 // Consume both pointer updates once per frame, then forget any clamped overshoot.
 function flushGesture(){if(gestureFrame.current===null)return;cancelAnimationFrame(gestureFrame.current);gestureFrame.current=null;if(!gesture.current||!pointers.current.size)return;applyCrop(imageCropGesture(size.width,size.height,gesture.current.start,gesture.current.points,[...pointers.current.values()]));rebaseGesture();}
 function point(e:PointerEvent<HTMLDivElement>){const rect=e.currentTarget.getBoundingClientRect();return {x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height};}
 function releasePointer(e:PointerEvent<HTMLDivElement>){if(!pointers.current.has(e.pointerId))return;flushGesture();pointers.current.delete(e.pointerId);rebaseGesture();}
 const crop=size.width?imageCrop(size.width,size.height,zoom,x,y):null;
 function close(){if(busy)return;clearGesture();editor.current?.close();setFile(null);setPreview('');setSize({width:0,height:0});if(input.current)input.current.value='';}
 async function upload(){if(!file||!crop||busy)return;clearGesture();setBusy(true);setError('');try{
  const bitmap=await createImageBitmap(file);let upload:Blob;
  try{if(bitmap.width*bitmap.height>40_000_000)throw new Error('圖片尺寸過大，請使用較小照片');
   const actual=imageCrop(bitmap.width,bitmap.height,zoom,x,y),canvas=document.createElement('canvas');
   canvas.width=canvas.height=Math.max(1,Math.min(1600,Math.round(actual.side)));
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('此裝置暫時無法處理圖片');
   ctx.drawImage(bitmap,actual.left,actual.top,actual.side,actual.side,0,0,canvas.width,canvas.height);
   upload=await compressImageUpload(canvas);
  }finally{bitmap.close();}
  const data=new FormData();data.set('storeId',storeId);data.set('image',upload,imageUploadFilename(upload));data.set('x','0.5');data.set('y','0.5');
  const r=await fetch(basePath,{method:'POST',body:data}),result=await r.json();if(!r.ok)throw new Error(result.error??'上傳失敗');
  onChange(result.id);editor.current?.close();setFile(null);setPreview('');setSize({width:0,height:0});if(input.current)input.current.value='';
 }catch(e){setError(e instanceof Error?e.message:'圖片上傳失敗，可重試');}finally{setBusy(false);}}
 const button="min-h-11 rounded-lg border border-earth-200 bg-white px-4 py-2 text-earth-700 hover:bg-earth-50 disabled:opacity-50";
 return <div className="space-y-2">
  <p className="text-sm text-earth-500">圖片將公開顯示於預約頁。</p><AddOnImage id={value} basePath={basePath}/>
  <button type="button" disabled={busy} className={button} onClick={()=>input.current?.click()}>{value?'更換圖片':'上傳圖片'}</button>
  <input ref={input} className="sr-only" tabIndex={-1} disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" aria-label="上傳服務圖片" onChange={e=>{
   const next=e.target.files?.[0];if(!next)return;if(next.size>10*1024*1024){setError('圖片請小於 10 MB');e.target.value='';return;}
   setSize({width:0,height:0});setFile(next);resetCrop();setError('');
  }}/>
  <dialog ref={editor} aria-label="調整服務圖片" className="m-auto max-h-[90dvh] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-earth-200 bg-white p-5 text-earth-800 backdrop:bg-black/60" onCancel={e=>{e.preventDefault();close();}}>
   <h2 className="font-semibold">調整圖片</h2><p className="my-3 text-sm text-earth-500">單指拖曳、雙指縮放與移動，框內即為顯示範圍。</p>
   <div ref={frame} role="img" aria-label="裁切預覽" className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg bg-earth-100" style={{touchAction:'none',cursor:busy?'wait':'grab'}}
    onPointerDown={e=>{if(busy||!crop||pointers.current.size>=2||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();flushGesture();pointers.current.set(e.pointerId,point(e));e.currentTarget.setPointerCapture(e.pointerId);rebaseGesture();}}
    onPointerMove={e=>{if(busy||!gesture.current||!pointers.current.has(e.pointerId))return;e.preventDefault();pointers.current.set(e.pointerId,point(e));if(gestureFrame.current===null)gestureFrame.current=requestAnimationFrame(flushGesture);}}
    onPointerUp={releasePointer} onPointerCancel={releasePointer} onLostPointerCapture={releasePointer}>
    {preview&&<img src={preview} alt="" draggable={false} onLoad={e=>{const img=e.currentTarget;if(img.naturalWidth*img.naturalHeight>40_000_000){setError('圖片尺寸過大，請使用較小照片');return;}setSize({width:img.naturalWidth,height:img.naturalHeight});}} onError={()=>setError('無法讀取圖片，請更換 JPG、PNG 或 WebP 圖片')} style={crop?{position:'absolute',maxWidth:'none',width:`${size.width/crop.side*100}%`,height:`${size.height/crop.side*100}%`,left:`${-crop.left/crop.side*100}%`,top:`${-crop.top/crop.side*100}%`,pointerEvents:'none'}:{visibility:'hidden'}}/>}
   </div>
   <label className="mt-4 flex min-h-11 items-center gap-3">縮放<input className="min-h-11 min-w-0 flex-1" type="range" min={1} max={3} step={0.01} value={zoom} disabled={busy} onChange={e=>{clearGesture();applyCrop({...currentCrop.current,zoom:Number(e.target.value)});}}/><span className="w-12 text-right text-sm">{Math.round(zoom*100)}%</span></label>
   <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-earth-600">微調位置</summary>{([{name:'左右',value:x,set:setX},{name:'上下',value:y,set:setY}]).map(({name,value,set})=><label key={name} className="flex min-h-11 items-center gap-3">{name}<input className="min-h-11 min-w-0 flex-1" aria-label={name+'裁切位置'} type="range" min={0} max={1} step={0.01} value={value} disabled={busy} onChange={e=>{clearGesture();set(Number(e.target.value));}}/></label>)}</details>
   {error&&<p role="alert" className="my-2 text-red-700">{error}</p>}
   <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-earth-100 pt-4">
    <button type="button" className={button} disabled={busy} onClick={resetCrop}>重設</button>
    <button type="button" className={button} disabled={busy} onClick={close}>取消</button>
    <button type="button" className="min-h-11 rounded-lg bg-primary-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy||!crop} onClick={upload}>{busy?'圖片處理中…':'套用圖片'}</button>
   </div><p className="mt-2 text-sm text-earth-500">套用後，請儲存設定。</p>
  </dialog>
  {value&&<button type="button" disabled={busy} className="min-h-11 px-3" onClick={()=>onChange(null)}>移除圖片</button>}
  {error&&!file&&<p role="alert" className="text-red-700">{error}</p>}
 </div>;
}
