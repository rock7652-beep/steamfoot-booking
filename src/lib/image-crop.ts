/** Square crop in source pixels, shared by the live preview and canvas export. */
export function imageCrop(width:number,height:number,zoom:number,x:number,y:number){
 const clamp=(value:number)=>Math.max(0,Math.min(1,value));
 const side=Math.min(width,height)/Math.max(1,Math.min(3,zoom));
 return {side,left:(width-side)*clamp(x),top:(height-side)*clamp(y)};
}

export type ImageCropState={zoom:number;x:number;y:number};
/** Pointer coordinates relative to the square frame (one frame width = 1). */
export type ImageCropPoint={x:number;y:number};
/** Keep the source pixel under the gesture centre anchored while zooming/panning. */
export function imageCropGesture(width:number,height:number,start:ImageCropState,from:ImageCropPoint[],to:ImageCropPoint[]):ImageCropState{
 if(!width||!height||!from.length||from.length!==to.length)return start;
 const centre=(points:ImageCropPoint[])=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length});
 const distance=(points:ImageCropPoint[])=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
 const previous=centre(from),current=centre(to),spread=from.length===2?distance(from):0;
 const zoom=Math.max(1,Math.min(3,start.zoom*(spread>0.001?distance(to)/spread:1)));
 const crop=imageCrop(width,height,start.zoom,start.x,start.y),nextSide=Math.min(width,height)/zoom;
 const left=crop.left+previous.x*crop.side-current.x*nextSide,top=crop.top+previous.y*crop.side-current.y*nextSide;
 const clamp=(v:number)=>Math.max(0,Math.min(1,v));
 return {zoom,x:width===nextSide?0.5:clamp(left/(width-nextSide)),y:height===nextSide?0.5:clamp(top/(height-nextSide))};
}
