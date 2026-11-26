'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Pause, Play, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { formatTime, styles, type Entry, type Result } from '../lib/game';
import { courseGrade } from '../lib/course-data';
import { venueOf } from '../lib/races';
import { capOf, drawRace, racePlayback, runnerLane, warmRacePhotos, type Runner, type Shot } from './race-picture';
import { raceProgram, startAt } from './race-program';
import { raceMotion } from './race3d/motion';
import { raceCalls } from './race3d/commentary';
import { RaceTickets } from './race3d/tickets';
import { unlockRaceVoice, type RaceAudioMode } from './race-voice-unlock';
import { createRaceSound } from './race-sound';
import { Grade } from './ui';
import { preloadRaceHorses, preloadRaceGait } from './horse-art';

const clockText=(value:number)=>{
 const tenths=Math.floor(value*10+0.000001);
 return Math.floor(tenths/600)+':'+((tenths%600)/10).toFixed(1).padStart(4,'0');
};
const names:Record<Shot,string>={paddock:'発走前',gate:'スタート',pan:'道中',leaders:'先頭集団',split:'道中・全景',rear:'後方集団',corner:'3〜4コーナー',tele:'最後の直線',finish:'ゴール前',replay:'スローリプレイ'};

function Cap({entry}:{entry:Entry}){
 return <i className="race-cap" style={{background:capOf(entry),color:[1,5,7,8].includes(entry.frame||entry.number)?'#132621':'#fff'}}>{entry.number}</i>;
}

function Formation({runners,time,spread}:{runners:Runner[];time:number;spread:number}) {
 const lead=runners[0]?.distance??0;
 const gap=Math.max(0,lead-(runners.at(-1)?.distance??lead));
 const lanes=runners.map(r=>runnerLane(r,runners.length,time,spread));
 // Blend lateral placement into the display while keeping the front of the field on the right.
 const positions=runners.map((r,i)=>({r,x:85-(lead-r.distance)*64/Math.max(12,gap)-lanes[i]*9,y:15+lanes[i]*64}));
 for(let i=0;i<positions.length;i++){
  for(let j=0;j<i;j++){
   const a=positions[i], b=positions[j];
   if(Math.abs(a.x-b.x)<13&&Math.abs(a.y-b.y)<20)a.x=Math.max(8,b.x-13);
  }
 }
 return <div className="race-formation" role="img" aria-label={'隊列 '+runners.map(r=>r.entry.number+'番').join('、')}>
  {positions.map(({r,x,y})=><span key={r.entry.number} style={{left:x+'%',top:y+'%'}}><Cap entry={r.entry}/></span>)}
 </div>;
}

function Course({progress,reverse}:{progress:number;reverse:boolean}){
 const angle=(reverse?-1:1)*progress*Math.PI*2+Math.PI*0.5;
 return <svg className="race-course" viewBox="0 0 74 32" role="img" aria-label="コース上の先頭馬の位置">
  <ellipse cx="37" cy="16" rx="31" ry="11" transform="rotate(-9 37 16)" fill="#132820a6" stroke="#f9f7df" strokeWidth="1.5"/>
  <ellipse cx="37" cy="16" rx="27" ry="8" transform="rotate(-9 37 16)" fill="none" stroke="#92aa86" strokeWidth="1"/>
  <circle cx={37+31*Math.cos(angle)} cy={16+11*Math.sin(angle)} r="3.6" fill="#ffcd67" stroke="#172b1e" transform="rotate(-9 37 16)"/>
 </svg>;
}

export function RaceCanvasFallback({result,onFinish,initialRaceTime,audioMode='both',balance=0,settledBalance=balance}:{result:Result;onFinish:()=>void;initialRaceTime?:number;audioMode?:RaceAudioMode;balance?:number;settledBalance?:number}) {
 const voice=useMemo(()=>raceCalls(result,raceMotion(result)),[result]);
 const playback=useMemo(()=>racePlayback(result),[result]);
 const program=useMemo(()=>raceProgram(result,playback),[result,playback]);
 const venue=venueOf(result.race);
 const favorites=useMemo(()=>[...result.order].sort((a,b)=>
  (result.winOdds?.[a.number-1]??999)-(result.winOdds?.[b.number-1]??999)||a.number-b.number),[result]);
 const focused=result.order.find(e=>e.owned)??favorites[0];
 const start=initialRaceTime!==undefined&&initialRaceTime>=0?Math.min(program.end,startAt+initialRaceTime):0;
 const initial=useRef(start);
 const canvas=useRef<HTMLCanvasElement>(null);
 const audio=useRef<{context:AudioContext;engine:ReturnType<typeof createRaceSound>}|null>(null);
 const enabled=useRef(false);
 const vibrated=useRef(false);
 const [sound,setSound]=useState(false);
 const [speed,setSpeed]=useState(1);
 const [paused,setPaused]=useState(false);
 const [elapsed,setElapsed]=useState(start);

 useEffect(()=>{
  let cancelled=false;
  let stop=()=>{};
  const runners=playback.field(0);
  const looks=runners.map(r=>r.look);
  const coats=[...new Set(looks.map(look=>look.coatIndex))];
  void preloadRaceHorses(looks);
  void preloadRaceGait(coats).then(()=>{
   if(!cancelled)stop=warmRacePhotos(runners,[0,4,2,6,1,5,3,7,'front','charge','rear']);
  });
  return ()=>{cancelled=true;stop();};
 },[playback]);

 useEffect(()=>()=>{voice.stop();audio.current?.engine.dispose();void audio.current?.context.close().catch(()=>{});audio.current=null;},[voice]);
 async function toggleSound(){
  if(sound){
   enabled.current=false;voice.stop();
   audio.current?.engine.mute(true);
   audio.current?.engine.quiet();
   setSound(false);
   return;
  }
  if(audioMode!=='ambient')unlockRaceVoice();
  if(audioMode==='voice'){enabled.current=true;setSound(true);return;}
  const Audio=window.AudioContext??(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!Audio)return;
  try{
   if(!audio.current){const context=new Audio();audio.current={context,engine:createRaceSound(context)};}
   const current=audio.current;
   await current.context.resume();
   if(audio.current!==current)return;
   current.engine.mute(false);
   if(initial.current<startAt-0.5)current.engine.intro();
   enabled.current=true;
   setSound(true);
  }catch{}
 }

 useEffect(()=>{
  const node=canvas.current;
  if(!node)return;
  const ctx=node.getContext('2d',{alpha:false});
  if(!ctx)return;
  const stand=new Image(),forest=new Image();
  stand.src='/grandstand.webp';forest.src='/race-woodland.webp';
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width=node.clientWidth,height=node.clientHeight;
  let raf=0,last=0,hud=-Infinity;
  let recent=0,slow=0;
  let quality=Math.min(1.6,window.devicePixelRatio||1);
  const observer=new ResizeObserver(([entry])=>{
   width=entry.contentRect.width;height=entry.contentRect.height;
   if(paused||initial.current>=program.end){cancelAnimationFrame(raf);raf=requestAnimationFrame(render);}
  });
  observer.observe(node);
  function render(now:number){
   const delta=last?(now-last)/1000:0;
   last=now;
   const previous=initial.current;
   if(!paused&&!document.hidden)initial.current=Math.min(program.end,previous+delta*speed);
   const value=initial.current;
   const shot=program.frame(value);
   if(document.hidden||paused||value>=program.end){voice.stop();audio.current?.engine.quiet();}
   else voice.tick(value-startAt,enabled.current&&audioMode!=='ambient',speed);
   if(!(document.hidden||paused||value>=program.end)&&enabled.current&&audio.current?.context.state==='running'){
    audio.current.engine.duckSpeech(voice.speaking);
    const engine=audio.current.engine;
    if(previous<startAt&&value>=startAt)engine.gate();
    if(previous<startAt+program.finish&&value>=startAt+program.finish)engine.finish();
    else if(shot.shot==='replay'||value<startAt)engine.ambient();
    else if(shot.actual>0&&shot.actual<program.finish)engine.play(shot.field[0]?.velocity??0,shot.field.length,(shot.actual-program.straightAt)/(program.finish-program.straightAt),speed);
   }
   if(!vibrated.current&&previous<startAt+program.finish&&value>=startAt+program.finish){
    vibrated.current=true;
    if(!reduced&&typeof navigator.vibrate==='function')navigator.vibrate(28);
   }
   if(delta>0&&delta<0.15&&!document.hidden){
    recent++;if(delta>0.025)slow++;
    if(recent===75){if(slow>15)quality=Math.max(0.8,quality-0.2);recent=0;slow=0;}
   }
   const logicalHeight=760*height/Math.max(1,width);
   const w=Math.max(280,Math.min(1440,Math.round(width*quality)));
   const h=Math.max(200,Math.min(1050,Math.round(height*quality)));
   if(node!.width!==w||node!.height!==h){node!.width=w;node!.height=h;}
   ctx!.setTransform(w/760,0,0,h/logicalHeight,0,0);
   drawRace(ctx!,result,shot.field,shot.shot,value<startAt?-1:shot.time,value,{stand,forest},focused?.number??1,logicalHeight,quality>=1&&!reduced);
   if(shot.shot==='split'&&quality>=1){
    ctx!.save();ctx!.beginPath();ctx!.rect(0,0,760,logicalHeight*0.23);ctx!.clip();
    drawRace(ctx!,result,shot.field,'pan',shot.time,value,{stand,forest},focused?.number??1,logicalHeight*0.23,false,true);
    ctx!.restore();
    ctx!.fillStyle='#eff2cc';ctx!.fillRect(0,logicalHeight*0.23,760,2);
   }
   if(now-hud>=100||value>=program.end){setElapsed(value);hud=now;}
   if(value<program.end&&!paused)raf=requestAnimationFrame(render);
  }
  raf=requestAnimationFrame(render);
  return ()=>{observer.disconnect();cancelAnimationFrame(raf);};
 },[result,program,focused,paused,speed,audioMode,voice]);

 const frame=program.frame(elapsed);
 const started=elapsed>=startAt;
 const done=elapsed>=program.end;
 const crossed=frame.actual>=program.finish;
 const replay=frame.shot==='replay';
 const clock=Math.min(program.finish,frame.actual);
 const showLap=playback.lap!==undefined&&clock>=playback.lap&&clock<playback.lap+4.5&&!crossed;
 const finalOrder=crossed&&!replay;
 const board=finalOrder?result.order:frame.field.map(r=>r.entry);
 const top=(started?board:[...(focused?[focused]:[]),...favorites.filter(e=>e!==focused)]).slice(0,3);
 const grade=Math.round(courseGrade(venue,frame.remaining)*10)/10;
 const leader=frame.field[0];
 const velocity=started&&!finalOrder?(leader?.velocity??0)*3.6:0;
 const status=finalOrder?'ゴール':frame.shot==='gate'&&!started?'発走前':names[frame.shot];
 const deciding=program.closeFinish&&crossed&&frame.actual<program.finish+1.5;
 const spread=frame.shot==='tele'||frame.shot==='finish'||replay?1:frame.shot==='corner'?0.55:0;
 const visibleOrder=started?board:[...board].sort((a,b)=>a.number-b.number);
 const finishVisible=crossed&&!replay;
 const winner=result.order[0];
 const margin=result.margins[1];

 return <section className="broadcast">
  <header className="broadcast-heading">
   <div className="broadcast-name"><Grade level={result.race.level}/><h1>{result.race.title}</h1></div>
   <span>{result.race.venue} · {result.race.surface}{playback.distance}m</span>
  </header>
  <div className="race-scene broadcast-picture" data-shot={frame.shot}>
   <canvas ref={canvas} width={760} height={850} aria-label={result.race.title+'のレース映像'} role="img"/>
   <div className="race-hud race-shot"><i/>{status}</div>
   {started&&<div className="race-hud race-clock">{showLap?clockText(playback.lap!)+' / 1000m':clockText(clock)}</div>}
   {finishVisible&&frame.actual<program.finish+0.34&&<div className="race-flash" aria-hidden="true"/>}
   {finishVisible&&winner&&<div className="race-winner">
    <small>{deciding?'写真判定':program.closeFinish?'写真判定・確定':'着順速報'}</small>
    {deciding?<strong>1着を確認中</strong>:<><strong><Cap entry={winner}/> {winner.horse.name}</strong>
    <span>{clockText(program.finish)}{margin?' ・ 2着との差 '+margin:''}</span>
    <div className="race-podium">{result.order.slice(0,3).map((entry,i)=><span key={entry.number}>{i+1}着 <Cap entry={entry}/></span>)}</div></>}
   </div>}
   {!started&&focused&&<div className="race-feature"><Cap entry={focused}/><div><strong>{focused.horse.name}</strong><small>単勝 {result.winOdds?.[focused.number-1]?.toFixed(1)??'—'}倍 ・ {styles[focused.horse.style]}{focused.owned?' ・ 愛馬':''}</small></div></div>}
   <div className="race-hud race-bottom">
    <div className="race-focus"><strong>{result.race.title} <span>· {result.race.venue}</span></strong><div>
      {top.map(e=><span key={e.number}><Cap entry={e}/>{result.winOdds?.[e.number-1]?.toFixed(1)??'—'}</span>)}
    </div></div>
    <Formation runners={frame.field} time={frame.time} spread={spread}/>
    <div className="race-speed"><Course progress={Math.min(1,(leader?.distance??0)/playback.distance)} reverse={venue.turn==='右'}/>
     <span>{result.race.surface}{playback.distance}m</span>
     <span>{grade>0?'+':''}{grade}%　{velocity.toFixed(1)} km/h</span>
    </div>
   </div>
  </div>
  <div className="race-details">
   <div className="race-commentary"><b>実況</b><p>{voice.caption(elapsed-startAt)??program.subtitle(elapsed,frame.shot)}</p></div>
   <div className="race-running-order">
    <span>{finalOrder?'着順':started?'通過順':'馬番'}</span>
    <div>{visibleOrder.map(e=><span key={e.number} title={e.horse.name} aria-label={e.number+'番 '+e.horse.name}><Cap entry={e}/></span>)}</div>
   </div>
   <div className="race-standings" aria-label={finalOrder?'上位着順':'先頭集団'}>
    {top.map((entry,i)=><div key={entry.number}>
     <small>{started?(i+1)+(finalOrder?'着':'番手'):'注目'}</small><Cap entry={entry}/>
     <span>{entry.horse.name}{entry.owned?' ★':''}</span>
     <em>単勝 {result.winOdds?.[entry.number-1]?.toFixed(1)??'—'}</em>
    </div>)}
   </div>
   <RaceTickets result={result} positions={board.map(e=>e.number)} started={started} finished={crossed}
    balance={crossed?settledBalance:balance}/>
  </div>
  <div className="broadcast-controls">
   {!done&&<><button className="button broadcast-button" aria-label={paused?'再生':'一時停止'} onClick={()=>{setElapsed(initial.current);setPaused(!paused);}}>{paused?<Play size={18}/>:<Pause size={18}/>}</button>
   <button className="button broadcast-button" aria-label={speed+'倍速'} aria-pressed={speed===2} onClick={()=>setSpeed(speed===1?2:1)}>{speed}倍速</button>
   <button className="button broadcast-button" aria-label={sound?'音声をオフ':'音声をオン'} aria-pressed={sound} onClick={()=>void toggleSound()}>{sound?<Volume2 size={18}/>:<VolumeX size={18}/>}</button></>}
   <button className="button gold-button" onClick={onFinish}>{done?<Flag size={17}/>:<SkipForward size={17}/>} {done?'着順・払戻を見る':'結果へスキップ'}</button>
  </div>
 </section>;
}
