import {describe,it,expect} from 'vitest';
import {imageCrop,imageCropGesture} from '@/lib/image-crop';
describe('square source crop',()=>{
 it('keeps a portrait inside its bounds and moves vertically',()=>{
  expect(imageCrop(400,800,1,.5,0)).toEqual({side:400,left:0,top:0});
  expect(imageCrop(400,800,1,.5,1)).toEqual({side:400,left:0,top:400});
 });
 it('zooms a square to allow movement on both axes',()=>{
  expect(imageCrop(600,600,2,1,0)).toEqual({side:300,left:300,top:0});
 });
 it('never exposes empty pixels beyond a landscape edge',()=>{
  const crop=imageCrop(1200,600,3,2,-1);
  expect(crop).toEqual({side:200,left:1000,top:0});
 });
});

describe('touch and mouse crop gestures',()=>{
 it('zooms around the fingers instead of snapping to the image centre',()=>{
  const state=imageCropGesture(1000,1000,{zoom:1,x:.5,y:.5},[{x:.15,y:.25},{x:.35,y:.25}],[{x:.05,y:.25},{x:.45,y:.25}]);
  expect(state.zoom).toBeCloseTo(2);expect(state.x).toBeCloseTo(.25);expect(state.y).toBeCloseTo(.25);
 });
 it('moves both fingers together without changing zoom',()=>{
  const state=imageCropGesture(1000,1000,{zoom:2,x:.5,y:.5},[{x:.3,y:.5},{x:.7,y:.5}],[{x:.4,y:.6},{x:.8,y:.6}]);
  expect(state.zoom).toBeCloseTo(2);expect(state.x).toBeCloseTo(.4);expect(state.y).toBeCloseTo(.4);
 });
 it('continues as one-finger or mouse dragging after rebasing without a jump',()=>{
  const start={zoom:2,x:.4,y:.4},point={x:.8,y:.6};
  expect(imageCropGesture(1000,1000,start,[point],[point])).toEqual(start);
  const moved=imageCropGesture(1000,1000,start,[point],[{x:.9,y:.7}]);
  expect(moved.zoom).toBe(2);expect(moved.x).toBeCloseTo(.3);expect(moved.y).toBeCloseTo(.3);
 });
 it('limits zoom and position so the frame never exposes empty edges',()=>{
  const start={zoom:2,x:.5,y:.5},points=[{x:.4,y:.5},{x:.6,y:.5}];
  const expanded=imageCropGesture(600,1000,start,points,[{x:-3,y:-3},{x:3,y:-3}]);
  expect(expanded.zoom).toBe(3);expect(expanded.x).toBeGreaterThanOrEqual(0);expect(expanded.x).toBeLessThanOrEqual(1);expect(expanded.y).toBe(1);
  expect(imageCropGesture(600,1000,start,points,[{x:.49,y:.5},{x:.51,y:.5}]).zoom).toBe(1);
 });
});
