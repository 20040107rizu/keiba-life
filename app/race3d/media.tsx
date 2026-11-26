'use client';

import { useEffect, useRef } from 'react';
import type { Surface } from '../../lib/races';
import { seedFrom } from './motion';

export const clipIds=['01_prerace','02_gate'] as const;
type ClipId=typeof clipIds[number];
type Take={file:string;duration:number;surface:Surface|'共通'};
export type Clips=Partial<Record<ClipId,Take>>;

export async function videoClips(surface:Surface,key:string,signal:AbortSignal):Promise<Clips>{
 try{
  const response=await fetch('/video/race/manifest.json',{signal,cache:'no-cache'});
  if(!response.ok)return {};
  const data=await response.json();
  if(!Array.isArray(data.clips))return {};
  const result:Clips={},random=seedFrom(key+':video');
  for(const id of clipIds){
   const selection:Take[]=[];
   for(const record of data.clips.filter((r:Record<string,unknown>|null)=>r?.id===id)){
    const variants=Array.isArray(record.variants)?record.variants.map((v:unknown)=>v&&typeof v==='object'?{...record,...v}:null):[];
    for(const take of [record,...variants]){
     if(!take||typeof take.file!=='string'||!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.mp4$/i.test(take.file)||
      (take.surface!==surface&&take.surface!=='共通')||!Number.isFinite(take.duration)||take.duration<=0)continue;
     selection.push({...take,file:'/video/race/'+take.file});
    }
   }
   const exact=selection.filter(t=>t.surface===surface);
   const pool=exact.length?exact:selection;
   if(pool.length)result[id]=pool[Math.floor(random()*pool.length)];
  }
  return result;
 }catch{return {};}
}

export function Interlude({take,speed,paused,sound,onEnd}:{take:Take;speed:number;paused:boolean;sound:boolean;onEnd:()=>void}){
 const ref=useRef<HTMLVideoElement>(null),state=useRef({last:0,at:0,ended:false});
 const controls=useRef({speed,paused,sound,onEnd});
 controls.current={speed,paused,sound,onEnd};
 const finish=()=>{
  if(!state.current.ended){state.current.ended=true;controls.current.onEnd();}
 };
 useEffect(()=>{
  const video=ref.current;
  if(!video)return;
  state.current={last:0,at:performance.now(),ended:false};
  function watchdog(){
   if(!video)return;
   const now=performance.now();
   if(controls.current.paused||document.hidden||Math.abs(video.currentTime-state.current.last)>0.015){
    state.current.last=video.currentTime;state.current.at=now;
   }else if(now-state.current.at>=3000)finish();
  }
  const handle=setInterval(watchdog,180);
  return ()=>{clearInterval(handle);video.pause();};
 },[take]);
 useEffect(()=>{
  const video=ref.current;
  if(!video)return;
  video.playbackRate=speed;
  video.muted=!sound;
  if(paused){video.pause();return;}
  void video.play().catch(()=>{
   video.muted=true;
   void video.play().catch(()=>{});
  });
 },[take,speed,paused,sound]);
 return <video className="three-clip" ref={ref} muted playsInline {...{'webkit-playsinline':''}} autoPlay={!sound} preload="auto"
  aria-label="レースの実写風映像" src={take.file} onEnded={finish} onError={finish}
  onPlaying={()=>{state.current.at=performance.now();}}/>;
}
