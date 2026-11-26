'use client';

import { useEffect, useRef, useState } from 'react';
import { rarity, stats, styles, type Horse } from '../lib/game';
import { appearanceOf, HorsePortrait } from './horse-art';

const durations = [600, 650, 450, 560];
const confetti = Array.from({ length: 24 }, (_, i) => ({
 left: ((i * 37) % 100) + '%',
 background: ['#fff1a2','#ff82b1','#8eeafa','#d4a4ff'][i % 4],
 animationDelay: ((i * 73) % 400) + 'ms',
 transform: 'rotate(' + i*31 + 'deg)',
}));

export function Gacha({ horses, onClose }: { horses: Horse[]; onClose: () => void }) {
 const dialog = useRef<HTMLDialogElement>(null);
 const audio = useRef<AudioContext | null>(null);
 const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const [index, setIndex] = useState(0);
 const [stage, setStage] = useState(0);
 const [sound, setSound] = useState(false);
 const horse = horses[index];
 const summary = !horse;

 useEffect(() => {
  const node = dialog.current;
  node?.showModal();
  return () => {
   node?.close();
   clearTimeout(hold.current);
   if (audio.current) void audio.current.close().catch(() => {});
   audio.current = null;
   if (typeof navigator.vibrate === 'function') navigator.vibrate(0);
  };
 }, []);

 useEffect(() => {
  if (summary || stage >= durations.length) return;
  const timer = setTimeout(() => setStage(stage + 1), durations[stage]);
  return () => clearTimeout(timer);
 }, [index, stage, summary]);

 useEffect(() => {
  if (!horse) return;
  if (typeof navigator.vibrate === 'function' && (stage === 3 || (stage === 1 && horse.rarity === 2))) {
   navigator.vibrate(horse.rarity === 2 ? [45,45,85] : 28);
  }
 }, [horse, stage]);

 useEffect(() => {
  const context = audio.current;
  if (!horse || !sound || !context || context.state !== 'running') return;
  const now = context.currentTime;
  const notes = [[108], [240, 360 + horse.rarity * 120], [155], [95, 145], [392, 523, 659, 784].slice(0, 2 + horse.rarity)][stage] ?? [];
  notes.forEach((freq, i) => {
   const start = now + i * 0.073;
   const osc = context.createOscillator();
   const gain = context.createGain();
   osc.type = stage === 0 || stage === 3 ? 'triangle' : 'sine';
   osc.frequency.setValueAtTime(freq, start);
   osc.frequency.exponentialRampToValueAtTime(freq * (stage === 3 ? 0.46 : 1.02), start + 0.19);
   gain.gain.setValueAtTime(0.001, start);
   gain.gain.exponentialRampToValueAtTime(0.13, start + 0.023);
   gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
   osc.connect(gain).connect(context.destination);
   osc.start(start);
   osc.stop(start + 0.25);
  });
 }, [horse, stage, sound]);

 async function toggleSound() {
  if (!sound) {
   const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
   if (!Audio) return;
   audio.current ??= new Audio();
   try { await audio.current.resume(); } catch { return; }
  } else if (audio.current) {
   void audio.current.suspend().catch(() => {});
  }
  setSound(!sound);
 }

 function clearHold() { clearTimeout(hold.current); }
 function skip() { clearHold(); setIndex(horses.length); }
 function advance() {
  if (stage < 4) { setStage(4); return; }
  setIndex(index + 1);
  setStage(0);
 }

 return <dialog ref={dialog} className="gacha-dialog" aria-label="新馬ガチャ" onCancel={event => {event.preventDefault(); if(summary) onClose(); else skip();}}>
  <header className="gacha-header">
   <strong>{summary ? '入厩した馬' : '新馬ガチャ'}</strong>
   {!summary && <span>{index + 1} / {horses.length}</span>}
   {!summary && <button className="button" aria-pressed={sound} onClick={() => void toggleSound()}>効果音 {sound ? 'オン' : 'オフ'}</button>}
  </header>
  {horse ? <>
   <button className={'gacha-scene gacha-rarity-'+horse.rarity+' gacha-stage-'+stage} key={horse.id}
     aria-label={stage < 4 ? '登場演出を進める' : '次へ'}
     onClick={advance} onPointerDown={() => {hold.current = setTimeout(skip, 550);}}
     onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold}>
    <div className="gacha-light"/>
    <div className="gacha-door left"/><div className="gacha-door right"/>
    <div className="gacha-horse"><HorsePortrait horse={horse} view="charge"/></div>
    {horse.rarity === 2 && stage >= 1 && <div className="gacha-cutin">SSR確定</div>}
    {horse.rarity === 2 && stage >= 3 && <div className="gacha-confetti" aria-hidden="true">{confetti.map((style, i) => <i key={i} style={style}/>)}</div>}
    {stage === 4 && <strong className="gacha-name">{rarity[horse.rarity]}　{horse.name}</strong>}
   </button>
   {stage === 4 && <div className="gacha-result" aria-live="polite">
    <p>{appearanceOf(horse).coat[0]} · {styles[horse.style]}</p>
    <dl>{stats.map((label,i) => <div key={label}><dt>{label}</dt><dd>{horse.values[i]}</dd></div>)}</dl>
   </div>}
   <footer className="gacha-actions"><button className="button outline" onClick={skip}>スキップ</button><button className="button gold-button" onClick={advance}>{stage < 4 ? '登場を見る' : index + 1 < horses.length ? '次の馬へ' : '結果を見る'}</button></footer>
  </> : <>
   <ul className="gacha-summary">{horses.map(h => <li key={h.id}><HorsePortrait horse={h}/><span><b className={'gacha-label-'+h.rarity}>{rarity[h.rarity]}</b> {h.name}<small>{stats.slice(0,2).map((label,i)=>label+' '+h.values[i]).join(' · ')} · 根性 {h.values[4]}</small></span></li>)}</ul>
   <footer className="gacha-actions"><button className="button gold-button" onClick={onClose}>厩舎へ</button></footer>
  </>}
 </dialog>;
}
