'use client';

import { useEffect, useRef } from 'react';
import { horsePhotoRegions } from './horse-photo-regions';
import { raceGaitRegions } from './race-gait-regions';
import type { Horse, Silks } from '../lib/game';

export const coats = [
 ['鹿毛','#935535','#633821','#282322'], ['黒鹿毛','#554037','#392721','#211c20'],
 ['青鹿毛','#373640','#25252e','#151418'], ['栗毛','#b56b3e','#874327','#623522'],
 ['芦毛','#a8a9a6','#777978','#545760'], ['白毛','#ece4dc','#b6aba6','#8b8585'],
];
export const caps = ['#f8f7f2','#22232a','#d73c47','#265bd1','#f4d338','#288145','#ed8529','#f288ad'];
const colors = ['#287850','#a93848','#254f9c','#8d49a1','#474653','#cf8940','#e2e9ed'];

export function appearanceOf(horse: Horse) {
 let seed = 2166136261;
 const sourceId = horse.id.startsWith('friend:') ? horse.id.split(':').slice(2).join(':') : horse.id;
 for (const char of sourceId) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
 const roll = (shift: number, count: number) => (seed >>> shift) % count;
 const requested = horse.appearance?.coat ?? roll(1, 6);
 const coatIndex = coats[requested] ? requested : 0;
 const coat = coats[coatIndex];
 const silks: Silks = horse.appearance?.silks ?? { body: colors[roll(8, 7)], sleeve: colors[roll(14, 7)], pattern: roll(19, 6), cap: colors[roll(25, 7)] };
 return { coat, coatIndex, silks, blaze: horse.appearance?.blaze ?? roll(5, 4), hood: horse.appearance?.hood ?? (roll(11, 4) === 0 ? silks.body : '') };
}

type Look = ReturnType<typeof appearanceOf>;
export type HorseView = 'portrait' | 'charge' | 'side' | 'side2' | 'front' | 'rear';
type RGB = [number, number, number];
export type Region = [left: number, top: number, right: number, bottom: number];
export type PhotoRegions = { cap?: Region; silks?: Region; saddle?: Region; hood?: Region; blaze?: Region };

const pictures = new Map<string, Promise<HTMLImageElement>>();
const readyPictures = new Map<string, HTMLImageElement>();

function photoPath(view: HorseView, coat: number) { return '/horses/' + view + '-' + coat + '.webp'; }

function loadPicture(path: string) {
 const cached = pictures.get(path);
 if (cached) return cached;
 const image = new Image();
 const loading = new Promise<HTMLImageElement>((resolve, reject) => {
  image.onload = () => { readyPictures.set(path,image); resolve(image); };
  image.onerror = () => { pictures.delete(path); reject(new Error('Horse image unavailable')); };
  image.src = path;
 });
 pictures.set(path, loading);
 return loading;
}

function rgb(color: string): RGB {
 const value = Number.parseInt(color.slice(1), 16);
 return [(value>>16)&255,(value>>8)&255,value&255];
}
const clamp = (value: number, lo = 0, hi = 1) => Math.max(lo,Math.min(hi,value));
const inRegion = (x: number, y: number, region?: Region): region is Region =>
 !!region && x >= region[0] && y >= region[1] && x <= region[2] && y <= region[3];

function tint(ctx: CanvasRenderingContext2D, width: number, height: number, marks: PhotoRegions, look: Look, cap: string, view: HorseView) {
 if (!marks.cap && !marks.silks && !marks.hood && !marks.blaze) return;
 const top = Math.floor(Math.min(marks.cap?.[1] ?? 1,marks.silks?.[1] ?? 1,marks.hood?.[1] ?? 1,marks.blaze?.[1] ?? 1) * height);
 const bottom = Math.ceil(Math.max(marks.cap?.[3] ?? 0,marks.silks?.[3] ?? 0,marks.hood?.[3] ?? 0,marks.blaze?.[3] ?? 0) * height);
 if(bottom<=top)return;
 const image = ctx.getImageData(0,top,width,bottom-top);
 const data = image.data;
 const main = rgb(look.silks.body);
 const sleeve = rgb(look.silks.sleeve);
 const helmet = rgb(cap);
 const hood = look.hood ? rgb(look.hood) : undefined;
 const pale: RGB = [234,225,212];
 for (let y=0;y<image.height;y++) for (let x=0;x<width;x++) {
  const i=(y*width+x)*4;
  if (data[i+3]<32) continue;
  const u=x/width, v=(y+top)/height;
  const [r,g,b]=[data[i],data[i+1],data[i+2]];
  const luma = r*0.21+g*0.72+b*0.07;
  const green = Math.min(g-r*1.03,g-b*1.05);
  // Portraits include a background, so keep face changes inside the diagonal forehead.
  const face = view!=='portrait' || (
   u < 0.748+(v-0.139)*0.40 && u > 0.733+(v-0.139)*0.22
  );
  let mix=0;
  let color: RGB = main;
  if (inRegion(u,v,marks.cap) && green>3) {
   color=helmet;
   mix=clamp((green-3)/17);
  } else if (inRegion(u,v,marks.silks) && green>4) {
   const [left,upper,right,lower]=marks.silks;
   const sx=(u-left)/(right-left), sy=(v-upper)/(lower-upper);
   const pattern=look.silks.pattern;
   const stripe = pattern===0 ? Math.abs(sx-0.4)<0.08 : pattern===1 ? Math.abs(sy-sx)<0.12 :
    pattern===2 ? Math.abs(sy-0.35-Math.abs(sx-0.5)*0.6)<0.08 : pattern===3 ? Math.abs(sy-0.52)<0.1 :
    pattern===5 && Math.hypot(sx-0.45,sy-0.43)<0.16;
   color = sx>0.76 || stripe ? sleeve : main;
   mix=clamp((green-4)/16);
  } else if (face && hood && inRegion(u,v,marks.hood) && luma>37 && luma<195) {
   const [left,upper,right,lower]=marks.hood;
   const nx=(u-(left+right)/2)*2/(right-left), ny=(v-(upper+lower)/2)*2/(lower-upper);
   mix=clamp((1-Math.hypot(nx,ny))*3)*0.54;
   color=hood;
  }
  if (face && look.blaze && inRegion(u,v,marks.blaze) && luma>42) {
   const [left,upper,right,lower]=marks.blaze;
   const nx=(u-left)/(right-left)-0.5;
   const ny=(v-upper)/(lower-upper);
   const breadth=[0,0.19,0.20,0.34][look.blaze] ?? 0.19;
   const length=look.blaze===1?0.38:0.92;
   const edge=Math.min((breadth-Math.abs(nx-(ny-0.4)*0.14))*11,ny*12,(length-ny)*10);
   if(edge>0) {color=pale;mix=clamp(edge)*0.62;}
  }
  if(mix<=0)continue;
  // Apply color to the photographed material while retaining its shadows and highlights.
  const light=color===pale ? 0.46+luma/430 : 0.23+luma/125;
  for(let channel=0;channel<3;channel++) {
   const target=clamp(color[channel]*light+Math.max(0,luma-155)*0.35,0,255);
   data[i+channel]=data[i+channel]*(1-mix)+target*mix;
  }
 }
 ctx.putImageData(image,0,top);
}

function paintPhoto(ctx: CanvasRenderingContext2D, image: HTMLImageElement, view: HorseView, look: Look, width: number, height: number, cap: string) {
 ctx.drawImage(image,0,0,width,height);
 const marks=horsePhotoRegions[view]?.[look.coatIndex];
 if (marks) tint(ctx,width,height,marks,look,cap,view);
}

export function preloadRaceHorses(looks: Look[]) {
 const views: HorseView[] = ['side','side2','front','charge','rear'];
 const coats = [...new Set(looks.map(look=>look.coatIndex))];
 return Promise.allSettled([loadPicture('/racehorse.webp'),...views.flatMap(view=>coats.map(coat=>loadPicture(photoPath(view,coat))))]);
}

const gaitPath=(coat:number)=>'/horses/gait-'+coat+'.webp';
export function preloadRaceGait(coats:number[]) {
 return Promise.allSettled(coats.map(coat=>loadPicture(gaitPath(coat))));
}

export function raceHorsePhoto(view: HorseView | number, look: Look, cap: string) {
 const image=readyPictures.get(typeof view==='number'?gaitPath(look.coatIndex):photoPath(view,look.coatIndex));
 if(!image)return;
 const canvas=document.createElement('canvas');
 canvas.width=224;
 canvas.height=156;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)return;
 if(typeof view==='number'){
  const w=image.naturalWidth/4,h=image.naturalHeight/2;
  ctx.drawImage(image,view%4*w,Math.floor(view/4)*h,w,h,0,0,canvas.width,canvas.height);
  const marks=raceGaitRegions[view];
  if(marks)tint(ctx,canvas.width,canvas.height,marks,look,cap,'side');
 }else paintPhoto(ctx,image,view,look,canvas.width,canvas.height,cap);
 return canvas;
}

export function raceHorseFallback(look: Look) {
 return readyPictures.get(photoPath('side',look.coatIndex)) ?? readyPictures.get('/racehorse.webp');
}

export function saddleOf(view: HorseView|number, look: Look): Region | undefined {
 return typeof view==='number'?raceGaitRegions[view]?.saddle:horsePhotoRegions[view]?.[look.coatIndex]?.saddle;
}

export function HorsePortrait({ horse, className = '', view = 'portrait', detail = false }: {
 horse: Horse; className?: string; view?: 'portrait' | 'charge'; detail?: boolean;
}) {
 const ref=useRef<HTMLCanvasElement>(null);
 const look=appearanceOf(horse);
 const path=photoPath(view,look.coatIndex);
 useEffect(()=>{
  const canvas=ref.current;
  if(!canvas)return;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return;
  let current=true;
  void loadPicture(path).then(image=>{
   if(!current)return;
   const fullSize=detail || view==='charge';
   canvas.width=fullSize?image.naturalWidth:180;
   canvas.height=fullSize?image.naturalHeight:120;
   const appearance=appearanceOf(horse);
   paintPhoto(ctx,image,view,appearance,canvas.width,canvas.height,appearance.silks.cap);
   canvas.dataset.ready='true';
  }).catch(()=>{});
  return ()=>{current=false;delete canvas.dataset.ready;};
 },[horse,path,view,detail]);
 return <canvas ref={ref} width={480} height={320} className={className} role="img"
  style={{backgroundImage:'url('+path+')'}}
  aria-label={horse.name+'（'+look.coat[0]+'）'}/>;
}
