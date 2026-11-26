'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Pause, Play, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { liveComment, type Entry, type Result } from '../../lib/game';
import { RaceCanvasFallback } from '../broadcast';
import { appearanceOf } from '../horse-art';
import { capOf } from '../race-picture';
import { raceAudioContext, unlockRaceVoice, type RaceAudioMode } from '../race-voice-unlock';
import { raceCalls } from './commentary';
import { RaceTickets } from './tickets';
import { createRaceSound } from '../race-sound';
import { Grade, Silk } from '../ui';
import { Interlude, clipIds, videoClips, type Clips } from './media';
import { clamp, raceMotion, type Place } from './motion';
import type { Track } from './course';
import { venueOf } from '../../lib/races';
import { buildWorld, type World } from './world';

const TRACK_NAMES:Record<string,string>={東京:'Tokyo',中山:'Nakayama',阪神:'Hanshin',京都:'Kyoto',新潟:'Niigata',札幌:'Sapporo',中京:'Chukyo',函館:'Hakodate',福島:'Fukushima',小倉:'Kokura'};
const decimal=(v:number)=>{
 const tenth=Math.round(Math.max(0,v)*10);
 return Math.floor(tenth/600)+':'+((tenth%600)/10).toFixed(1).padStart(4,'0');
};
const clock=(v:number)=>v<60?Math.floor(v).toString():Math.floor(v/60)+':'+String(Math.floor(v%60)).padStart(2,'0');
function Cap({entry,square=false}:{entry:Entry;square?:boolean}){
 return <i className={'race-cap'+(square?' square':'')} style={{background:capOf(entry),color:[1,5,7,8].includes(entry.frame||entry.number)?'#142720':'#fff'}}>{entry.number}</i>;
}
function MiniMap({track,distance}:{track?:Track;distance:number}){
 if(!track)return null;
 const {halfStraight:a,radius:r}=track;
 const padding=(a+r)*.13;
 const width=a+r+padding,height=r+padding;
 const p=track.map(distance),goal=track.map(track.finish-track.start);
 const outline=`M ${-a} ${-r} H ${a} A ${r} ${r} 0 0 1 ${a} ${r} H ${-a} A ${r} ${r} 0 0 1 ${-a} ${-r} Z`;
 return <svg className="race-course" viewBox={`${-width} ${-height} ${width*2} ${height*2}`} role="img" aria-label="コース上の先頭馬">
  <path d={outline} fill="#182d1c" stroke="#c9d1a3" strokeWidth={padding*.43}/>
  <circle cx={goal.x} cy={goal.y} r={padding*.44} fill="#fff9e7"/>
  <circle cx={p.x} cy={p.y} r={padding*.63} fill="#f2bd53" stroke="#213729" strokeWidth={padding*.16}/>
 </svg>;
}
function Positions({result,field,right}:{result:Result;field:Place[];right:boolean}){
 const reference=field[0]?.distance??0;
 const tail=field.at(-1)?.distance??0;
 const width=Math.max(20,reference-tail+5);
 return <div className="three-form" aria-label={'隊列 '+field.map(p=>result.order[p.rank].number+'番').join('、')}>
  <b className={right?'right':''}>{right?'>':'<'}</b>
  {field.map(p=>{
   const x=81-(reference-p.distance)*64/width-(p.lane-2)*.29;
   const y=17+clamp(p.lane/19)*66;
   const entry=result.order[p.rank];
   return <span key={entry.number} className={entry.owned?'three-owned':''} style={{left:(right?x:100-x)+'%',top:y+'%'}}><Cap entry={entry}/></span>;
  })}
 </div>;
}

export default function RaceThree({result,onFinish,showNumbers=true,audioMode='both',balance=0,settledBalance=balance,initialSound=false}:{result:Result;onFinish:()=>void;showNumbers?:boolean;audioMode?:RaceAudioMode;initialSound?:boolean;balance?:number;settledBalance?:number}){
 const motion=useMemo(()=>raceMotion(result),[result]);
 const voice=useMemo(()=>raceCalls(result,motion),[result,motion]);
 const canvas=useRef<HTMLCanvasElement>(null),wipe=useRef<HTMLCanvasElement>(null),screen=useRef<HTMLDivElement>(null);
 const world=useRef<World|null>(null);
 const numberLayer=useRef<HTMLDivElement>(null);
 const time=useRef(-2);
 const setupStarted=useRef(0);
 const [t,setT]=useState(-2);
 const [stage,setStage]=useState(0);
 const [ready,setReady]=useState(false);
 const [failed,setFailed]=useState(false);
 const [clips,setClips]=useState<Clips>();
 const [paused,setPaused]=useState(false);
 const [speed,setSpeed]=useState(1);
 const [sound,setSound]=useState(initialSound);
 const [goalPulse,setGoalPulse]=useState(false);
 const goalSince=useRef(-Infinity);
 const photoElapsed=useRef(0);
 const settings=useRef({paused:false,speed:1,sound:initialSound});
 const soundEngine=useRef<{context:AudioContext;engine:ReturnType<typeof createRaceSound>}|null>(null);
 const race=stage===2;
 const take=stage<2?clips?.[clipIds[stage]]:undefined;
 const endInterlude=()=>setStage(stage+1);

 useEffect(()=>{
  let mounted=true;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),3000);
  void videoClips(result.race.surface,result.key,controller.signal).then(items=>{
   clearTimeout(timeout);
   if(mounted)setClips(items);
  });
  return ()=>{mounted=false;clearTimeout(timeout);controller.abort();};
 },[result]);
 useEffect(()=>{
  const node=canvas.current,blend=wipe.current,labels=numberLayer.current;
  if(!node||!blend||!labels)return;
  const controller=new AbortController();
  setupStarted.current=performance.now();
  const fail=()=>{if(!controller.signal.aborted)setFailed(true);};
  void buildWorld(node,blend,labels,result,motion,fail,controller.signal).then(value=>{
   if(controller.signal.aborted){value.dispose();return;}
   world.current=value;setReady(true);
  }).catch(fail);
  return ()=>{controller.abort();world.current=null;};
 },[motion,result,failed]);

 useEffect(()=>{
  if(clips&&!take&&stage<2)setStage(stage+1);
 },[clips,stage,take]);
 useEffect(()=>{
  if(!race||ready||failed)return;
  const timeout=setTimeout(()=>setFailed(true),Math.max(550,5500-(performance.now()-setupStarted.current)));
  return ()=>clearTimeout(timeout);
 },[race,ready,failed]);

 useEffect(()=>{if(failed){voice.stop();soundEngine.current?.engine.quiet();}},[failed,voice]);
 useEffect(()=>()=>{voice.stop();soundEngine.current?.engine.dispose();void soundEngine.current?.context.close().catch(()=>{});},[voice]);
 useEffect(()=>{
  const engine=soundEngine.current?.engine;
  if(!engine)return;
  if(sound&&audioMode!=='voice'&&!paused&&stage<2)engine.ambient();
  else if(paused||stage>=4||!sound)engine.quiet();
 },[sound,audioMode,paused,stage]);
 async function setAudio(value:boolean){
  settings.current.sound=value;setSound(value);
  if(!value){voice.stop();soundEngine.current?.engine.mute(true);return;}
  if(audioMode!=='ambient')unlockRaceVoice();
  if(audioMode==='voice')return;
  try{
   if(!soundEngine.current){
    const context=raceAudioContext();
    if(!context)return;
    soundEngine.current={context,engine:createRaceSound(context)};
   }
   await soundEngine.current.context.resume();
   soundEngine.current.engine.mute(!settings.current.sound);
   if(time.current<0)soundEngine.current.engine.ambient();
  }catch{}
 }
 useEffect(()=>{if(initialSound)void setAudio(true);},[initialSound]);

 useEffect(()=>{
  if(!race||!ready||failed)return;
  const node=screen.current;
  let inView=true,frame=0,last=0,hud=-Infinity,painted=-Infinity,pixelWidth=0,pixelHeight=0;
  const cancel=()=>{cancelAnimationFrame(frame);frame=0;last=0;soundEngine.current?.engine.quiet();};
  const wake=()=>{if(!frame&&inView&&!document.hidden)frame=requestAnimationFrame(draw);};
  const observer=new IntersectionObserver(([item])=>{inView=item.isIntersecting;if(inView)wake();else cancel();});
  function draw(now:number){
   frame=0;
   if(document.hidden||!inView)return;
   const controls=settings.current,dt=last?(now-last)/1000:0;
   last=now;
   const before=time.current;
   const slow=now-goalSince.current<520;
   if(!controls.paused)time.current=Math.min(motion.end,before+dt*(slow?.22:controls.speed));
   let actual=time.current;
   const goal=before<motion.winner&&actual>=motion.winner;
   if(goal){
    actual=time.current=motion.winner;
    goalSince.current=now;setGoalPulse(true);
   }else if(motion.close&&actual>=motion.winner+2){
    if(before>=motion.winner+2&&!controls.paused)photoElapsed.current+=dt;
    actual=time.current=photoElapsed.current<1.5?motion.winner+2:motion.end;
   }
   if(!goal&&!slow&&now-goalSince.current-dt*1000<520)setGoalPulse(false);
   const toPaint=goal?motion.winner:actual;
   const w=node?.clientWidth??0,h=node?.clientHeight??0;
   if(!controls.paused||painted!==toPaint||w!==pixelWidth||h!==pixelHeight){
    try{world.current?.render(toPaint,controls.paused?0:dt);}catch{setFailed(true);return;}
    painted=toPaint;pixelWidth=w;pixelHeight=h;
   }
   const audio=soundEngine.current;
   if(controls.paused){voice.stop();audio?.engine.quiet();}
   else{
    voice.tick(goal?motion.winner:actual,controls.sound&&audioMode!=='ambient',controls.speed);
    if(controls.sound&&audioMode!=='voice'&&audio?.context.state==='running'){
     audio.engine.duckSpeech(voice.speaking);
     if(actual>=motion.winner){if(goal)audio.engine.finish();}
     else if(actual>=0)audio.engine.play(motion.speed(actual),result.order.length,(actual/motion.winner-.75)*4.2,controls.speed,
      Math.max(0,1-actual/5));
     else audio.engine.ambient();
    }
   }
   if(now-hud>=41||before<motion.winner&&actual>=motion.winner||actual>=motion.end){hud=now;setT(goal?motion.winner:actual);}
   if(actual>=motion.end){
    world.current?.render(motion.winner,0,true);
    setGoalPulse(false);setStage(4);audio?.engine.quiet();
   }
   else wake();
  }
  const visibility=()=>{if(document.hidden){voice.stop();cancel();}else wake();};
  if(node)observer.observe(node);
  document.addEventListener('visibilitychange',visibility);
  wake();
  return ()=>{observer.disconnect();cancel();document.removeEventListener('visibilitychange',visibility);};
 },[race,ready,failed,motion,result,audioMode,voice]);

 if(failed)return <RaceCanvasFallback result={result} onFinish={onFinish} initialRaceTime={time.current} audioMode={audioMode} balance={balance} settledBalance={settledBalance}/>;
 const active=stage===2||stage===4;
 const now=clamp(t,0,motion.winner);
 const shot=motion.shot(t);
 const over=t>=motion.winner;
 const photo=shot==='PHOTO';
 const field=motion.field(Math.max(0,t));
 const leader=field[0];
 const remaining=Math.max(0,motion.distance-(leader?.distance??0));
 const right=remaining<=motion.straight;
 const top=(over?result.order:stage<2?[...result.order].sort((a,b)=>Number(b.owned)-Number(a.owned)||
  (result.winOdds[a.number-1]??999)-(result.winOdds[b.number-1]??999)):field.map(p=>result.order[p.rank])).slice(0,3);
 const lap=motion.lap!==undefined&&now>=motion.lap&&now-motion.lap<3&&!over;
 const traveled=Math.min(leader?.distance??0,motion.distance);
 const track=world.current?.track;
 const course=venueOf(result.race);
 const grade=world.current?.track.grade(Math.min(leader?.distance??0,motion.distance))??0;
 const velocity=t<0?'—':(motion.speed(t)*3.6).toFixed(1);
 const winner=result.order[0],margin=result.margins[1];
 const distanceLabel=(result.race.surface==='芝'?'TURF ':'DIRT ')+motion.distance.toLocaleString('en-US')+'m';

 const highlight=stage===2?voice.caption(t):undefined;
 const subtitle=highlight??(stage<2?stage===0?'注目馬が発走地点へ向かいます。':'各馬、ゲート入りを進めます。':t<0?'各馬、発走を待ちます。':liveComment(result,motion.commentRatio(now)));
 const stats=world.current?.stats();
 function skip(){
  if(stage!==2){endInterlude();return;}
  const next=motion.points.find(p=>p.time>time.current+.04);
  time.current=next?.time??motion.end;
  setT(time.current);
  // Complete the final cut even when playback is paused.
  if(!next){
   world.current?.render(motion.winner,0,true);
   setGoalPulse(false);setStage(4);soundEngine.current?.engine.quiet();
  }
 }

 return <section className="broadcast three-broadcast">
  <header className="broadcast-heading"><div className="broadcast-name"><Grade level={result.race.level}/><h1>{result.race.title}</h1></div><span>{result.race.venue} · {distanceLabel}</span></header>
  <div ref={screen} className="race-scene broadcast-picture three-screen" data-shot={race?shot:stage===4?'FINISHED':take?.file.split('/').at(-1)??'loading'}
   data-ready={ready} data-time={t.toFixed(3)} data-goal={motion.winner} data-quality={stats?.quality} data-draw-calls={stats?.drawCalls}>
   <canvas ref={canvas} className="three-world" data-show={active} aria-label="リアルタイム3Dレース映像" role="img"/>
   <canvas className="three-wipe" ref={wipe} aria-hidden="true"/>
   <div className="three-number-layer" ref={numberLayer} hidden={!showNumbers||!active||!ready} aria-hidden="true">
    {result.order.map(entry=><div key={entry.number} data-horse-number={entry.number} data-owned={entry.owned}
     className="three-horse-number" hidden style={{background:capOf(entry),color:[1,5,7,8].includes(entry.frame||entry.number)?'#142720':'#fff'}}>
     <b>{entry.number}</b>
    </div>)}
   </div>
   {take&&<Interlude key={stage} take={take} speed={speed} paused={paused} sound={false} onEnd={endInterlude}/>}
   {(!active&&!take||active&&!ready)&&<div className="three-loading" role="status">中継を準備中…</div>}
   <div className="three-clock"><strong>{over?decimal(motion.winner):clock(now)}</strong>
    {race&&lap&&<span>{decimal(motion.lap!)} / 1000m</span>}</div>
   {race&&t>=-.8&&t<1.2&&<span className="three-start-signal">{t<0?'発走直前':'スタート！'}</span>}
   {race&&remaining<=200&&!over&&<div className="three-distance-big">残り{Math.max(1,Math.ceil(remaining))}m</div>}
   {race&&remaining<=200&&!over&&<div className="three-plates">
    {field.slice(0,2).map(p=>{const e=result.order[p.rank];return <span key={e.number} className={e.owned?'three-owned':''}><Cap entry={e}/> {e.horse.name}</span>;})}
   </div>}
   {goalPulse&&<><div className="three-goal-flash" aria-hidden="true"/><div className="three-goal-call">ゴール！</div></>}
    <div className="three-hud">
     <div className="three-runners"><b>◆ KEIBA LIFE</b><strong>{result.race.title}</strong>
      <small>{result.race.venue} {TRACK_NAMES[result.race.venue]??''}</small>
      {top.map(e=><span className={e.owned?'three-owned':''} key={e.number} title={e.horse.name}>
       <Cap entry={e} square/><Silk silk={appearanceOf(e.horse).silks}/><em>{result.winOdds[e.number-1]?.toFixed(1)??'—'}</em>
      </span>)}
     </div>
     <Positions result={result} field={field} right={right}/>
     <div className="three-distance"><b>{over?0:Math.min(motion.distance,Math.ceil(remaining/200)*200)}m</b>
      <div><MiniMap track={track} distance={traveled}/><span>{distanceLabel} · {course.turn}{course.layout==='内'||course.layout==='外'?course.layout:''}</span>
       <span>{grade>0?'+':''}{Math.abs(grade)<.05?'0':grade.toFixed(1)}% · {velocity} km/h</span>
      </div>
     </div>
    </div>
  </div>
  {(race&&t>=motion.winner+1||stage===4)&&winner&&<div className="race-winner three-finish three-finish-strip">
    <small>{photo?'写真判定':'着順速報'}</small>
    <strong><Cap entry={winner}/> {winner.horse.name}</strong>
    <span>{decimal(motion.winner)}{margin?' ・ 2着との差 '+margin:''}</span>
  </div>}
  <RaceTickets result={result} started={active&&t>=0} finished={over} positions={field.map(p=>result.order[p.rank].number)}
   balance={over?settledBalance:balance}/>
  <div className="race-details"><div className="race-commentary"><b>実況</b><p className={highlight?'race-call-highlight':undefined}>{subtitle}</p></div></div>
  <div className="broadcast-controls">
   {stage!==4&&<>
    <button className="button broadcast-button" aria-label={paused?'再生':'一時停止'} onClick={()=>{settings.current.paused=!paused;setPaused(!paused);}}>{paused?<Play size={17}/>:<Pause size={17}/>}</button>
    <button className="button broadcast-button" aria-pressed={speed===2} onClick={()=>{settings.current.speed=speed===1?2:1;setSpeed(settings.current.speed);}}>{speed}倍速</button>
    <button className="button broadcast-button" data-audio aria-label={sound?'音声をオフ':'音声をオン'} aria-pressed={sound} onClick={()=>void setAudio(!sound)}>{sound?<Volume2 size={17}/>:<VolumeX size={17}/>}</button>
    <button className="button broadcast-button" onClick={skip}><SkipForward size={16}/>{race?'次のショット':'動画をスキップ'}</button>
   </>}
   <button className="button gold-button" onClick={onFinish}><Flag size={16}/>{stage===4?'着順・払戻を見る':'結果へ'}</button>
  </div>
 </section>;
}
