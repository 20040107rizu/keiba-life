// 画面で共通に使う小さな部品
import { classes } from '../lib/races';
import { HorsePortrait } from './horse-art';
import type { Entry, Horse, Silks } from '../lib/game';

export const amount=(n:number)=>n.toLocaleString('ja-JP');
export const rail=['#fff','#182023','#d83739','#2254a1','#f0ce31','#218340','#e97825','#e880a3'];
export const grade=(level:number)=>classes[level];
export const marker=(n:number)=> <span className="gate" style={{background:rail[n-1],color:n===1||n===5?'#141f2a':'white'}}>{n}</span>;
/** 出走馬の名前（友だちの馬は持ち主のニックネーム付き） */
export const runnerName=(e:Entry)=>e.horse.name+(e.owned?' ★':e.owner?'（'+e.owner+'）':'');

export function Silk({silk}:{silk:Silks}){
 return <div className="silk-art"><div className="cap" style={{backgroundColor:silk.cap}}/><div className="jersey" style={{backgroundColor:silk.sleeve}}><div className={'jersey-body pattern-'+silk.pattern} style={{backgroundColor:silk.body}}>{silk.pattern===5?'✦ ✦ ✦':''}</div></div></div>;
}
export function Grade({level}:{level:number}){return <span className={'grade '+(level===8?'gold':'')}>{grade(level)}</span>}
export function Meter({value,max=100}:{value:number;max?:number}){
 return <span className="meter"><span style={{width:(value/max*100)+'%',background:max===100 && value>=60?'#bf443f':max===100 && value>=30?'#d99b27':undefined}}/></span>;
}
export function HorsePhoto({horse,detail=false}:{horse:Horse;detail?:boolean}){return <HorsePortrait horse={horse} detail={detail} className="horse-photo"/>}

export function RankBadge({horse}:{horse:Horse}) {
 const rank=['R','SR','SSR'][horse.rarity]??'R';
 return <span className={'rarity-badge rarity-'+rank.toLowerCase()}>{rank}</span>;
}
