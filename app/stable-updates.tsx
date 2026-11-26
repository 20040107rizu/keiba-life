'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { aptitudes, forms, formatTime, prizeFor, stats, styles, type Entry, type Game, type Horse, type Result } from '../lib/game';
import { formatYen } from '../lib/economy';
import { jockeyName, jockeyOf } from '../lib/jockeys';
import type { Race } from '../lib/races';
import { Grade, RankBadge } from './ui';

export function PrizeList({ race }: { race: Race }) {
 return <details className="prize-list"><summary>このレースの賞金</summary><dl>{[0,1,2,3,4].map(i => <div key={i}><dt>{i+1}着</dt><dd>{formatYen(prizeFor(race,i))}</dd></div>)}</dl></details>;
}

export function Sheet({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="entry-sheet" aria-label={title} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
  <div><header><h2>{title}</h2><button type="button" className="text-button" onClick={close}>閉じる</button></header>{children}</div>
 </dialog>;
}

export function HorseRaceHistory({horse,game,close,open}:{horse:Horse;game:Game;close:()=>void;open:(result:Result)=>void}){
 const runs=game.history.flatMap(result=>{
  const rank=result.order.findIndex(entry=>entry.owned&&entry.horse.id===horse.id);
  return rank<0?[]:[{result,rank}];
 });
 return <Sheet title={horse.name+'の出走履歴'} close={close}>
  <p><RankBadge horse={horse}/> {horse.starts}戦 {horse.wins}勝 · 獲得賞金 {formatYen(horse.earnings)}</p>
  {runs.length?runs.map(({result,rank})=><article className="past-run" key={result.key}>
   <small>第{result.key.split('-')[0]}年 第{result.race.week}週 · {result.race.venue}</small>
   <strong>{result.race.title}</strong><Grade level={result.race.level}/>
   <p>{result.race.surface}{result.race.distance}m · <b>{rank+1}着</b> / {result.order.length}頭 · {result.times[rank]?formatTime(result.times[rank]):'—'} · 着差 {result.margins[rank]||'—'}</p>
   <button className="button outline" onClick={()=>open(result)}>レース結果を見る</button>
  </article>):<p className="muted">記録された出走はありません。</p>}
 </Sheet>;
}

export function RunnerSheet({ entry, race, game, close }: { entry: Entry; race: Race; game: Game; close: () => void }) {
 const h=entry.horse;
 const past=game.history.flatMap(r=>{
  const i=r.order.findIndex(e=>e.horse.id===h.id);
  return i<0?[]:[{r,i}];
 }).slice(0,8);
 const d=race.distance<=1400?0:race.distance<=1800?1:race.distance<=2400?2:3;
 const surface=race.surface==='芝'?4:5;
 const jockey=jockeyOf(entry.jockeyId);
 const score=(entry.strength-(450+race.level*50))/34+h.form*.75+(h.apt[d]+h.apt[surface])*.19-h.fatigue*.04+(jockey.style===h.style ? .7 : 0)-(entry.frame-1)*.07;
 const mark=score>=5?'◎':score>=3.5?'○':score>=2?'▲':'△';
 const ability=entry.strength>=450+race.level*50?'クラスに通用する力があります。':'このクラスでは展開の助けが欲しいところです。';
 const state=h.injury?'休養の必要があります。':h.fatigue>=60?'疲労が残っています。':h.form>=3?'調子は上向きです。':'気配は平常です。';
 const suitability=h.apt[d]>=5&&h.apt[surface]>=5?'今回の距離と馬場に合います。':h.apt[d]<3||h.apt[surface]<3?'距離か馬場に課題があります。':'距離と馬場への対応は標準的です。';
 const tactics=jockey.style===h.style?'騎手の得意脚質と合います。':entry.frame<=3?'内枠を生かしたいところです。':'枠順を見て早めに位置を取れるかが鍵です。';
 return <Sheet title={h.name} close={close}>
  <section><h3>アドバイザーの見解</h3><p><strong className="advisor-mark">{mark}</strong> {ability}{state}{suitability}{tactics}</p></section>
  <section><h3>状態と適性</h3><p><RankBadge horse={h}/> {forms[h.form]} · 疲労 {h.fatigue}% · {styles[h.style]} · {jockeyName(entry)}</p>
  <div className="apt">{stats.map((label,i)=><div key={label}>{label}<b>{h.values[i]}</b></div>)}{aptitudes.map((label,i)=><div key={label}>{label}<b>{'GFEDCBAS'[h.apt[i]]}</b></div>)}</div></section>
  <section><h3>直近のレース成績</h3>{past.length?past.map(({r,i})=><div className="past-run" key={r.key}>
   <small>シーズン{r.key.split('-')[0]}・第{r.race.week}週</small>
   <strong>{r.race.title}</strong><Grade level={r.race.level}/>
   <p>{r.race.surface}{r.race.distance}m · {i+1}着 · {r.times[i]?formatTime(r.times[i]):'—'} · 着差 {r.margins[i]||'—'}</p>
  </div>):<p className="muted">このセーブに記録された出走成績はありません。</p>}</section>
 </Sheet>;
}

export function RunnerButton({ children, picked, select, details }: { children: ReactNode; picked: boolean; select: () => void; details: () => void }) {
 const hold=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const start=useRef({x:0,y:0});
 const opened=useRef(false);
 const stop=()=>clearTimeout(hold.current);
 useEffect(()=>()=>clearTimeout(hold.current),[]);
 return <button type="button" className={'runner '+(picked?'picked':'')} aria-pressed={picked}
  onPointerDown={e=>{opened.current=false; if(!e.isPrimary||e.button!==0||!(e.target as HTMLElement).closest('.runner-identity'))return;
   start.current={x:e.clientX,y:e.clientY};hold.current=setTimeout(()=>{opened.current=true;details();},500);}}
  onPointerMove={e=>{if(Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>10)stop();}}
  onPointerCancel={stop} onPointerUp={stop} onPointerLeave={stop} onContextMenu={e=>e.preventDefault()}
  onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();details();}}}
  onClick={()=>{if(!opened.current)select();opened.current=false;}}>{children}</button>;
}

export function nameProblem(name: string, horse: Horse, game: Game) {
 const normalized=name.trim();
 if(!normalized||Array.from(normalized).length>9)return '空白のみを除き、1〜9文字で入力してください。';
 if(game.horses.some(h=>h.id!==horse.id&&h.name.normalize('NFKC')===normalized.normalize('NFKC')))return '同じ名前の所有馬がいます。';
 return '';
}
