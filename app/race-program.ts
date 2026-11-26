import { formatTime, type Result } from '../lib/game';
import { paceLabel } from '../lib/race-engine';
import type { Playback, Shot } from './race-picture';

export const startAt=8.8;
export const replayLength=9;
const midShots:Shot[]=['pan','leaders','split','rear','pan','leaders','rear'];

export function raceProgram(result:Result,playback:Playback) {
 const {finish,last,distance,field,lastHundred,lap}=playback;
 const straightAt=finish*0.795;
 const replayAt=startAt+Math.max(finish+3.6,last+0.8);
 const end=replayAt+replayLength;
 const closeFinish=!!result.order[1]&&(/同着|ハナ|アタマ|クビ/.test(result.margins[1]??'')||
  (Number.isFinite(result.times[1])&&result.times[1]-finish<=0.15));
 const captions:{time:number;text:string;priority:number}[]=[];
 function announce(time:number,text:string,priority=0) {captions.push({time,text,priority});}
 function name(r:ReturnType<Playback['field']>[number]){return r.entry.number+'番 '+r.entry.horse.name;}
 const early=field(Math.min(5,finish))[0];
 const slow=result.notes?.filter(note=>note.includes('出遅れ'))??[];
 announce(0,slow.length?'スタート！ '+slow[0]:'ゲートが開いた！ 各馬そろってスタート。',4);
 if(early)announce(4,'ハナを切ったのは'+name(early)+'。',3);
 if(lap!==undefined&&lap<finish-2)announce(lap,'1000m通過 '+formatTime(lap)+'、'+paceLabel(result.pace)+'。',5);
 let previous=early?.entry.number;
 let lastAdvance=-8;
 let lastDuel=-8;
 let corner=false;
 for(let t=7;t<finish-0.3;t+=0.65){
  const current=field(t);
  const [first,second]=current;
  if(!first)break;
  const remaining=distance-first.distance;
  if(!corner&&remaining<=distance*0.44&&t<straightAt){
   announce(t,'3〜4コーナー、各馬が外へ広がっていきます。',3);
   corner=true;
  }
  if(first.entry.number!==previous){
   announce(t,name(first)+'が先頭に立った！',3);
   previous=first.entry.number;
  }
  if(t>straightAt&&t-lastAdvance>5){
   const old=field(Math.max(0,t-5));
   const mover=current.slice(0,5).find((r,index)=>r.entry.horse.style>=2&&old.findIndex(o=>o.entry.number===r.entry.number)-index>=2);
   if(mover){announce(t,'外から'+name(mover)+'が来た！',2);lastAdvance=t;}
  }
  if(second&&remaining<260&&first.distance-second.distance<4&&t-lastDuel>4){
   announce(t,name(second)+'が迫る！ '+first.entry.horse.name+'は粘れるか！',4);
   lastDuel=t;
  }
 }
 announce(straightAt,'4コーナーを回って最後の直線！',6);
 announce(Math.max(straightAt+2,finish-7.5),'残りわずか、先頭争いに注目！',1);
 announce(finish,(result.order[0]?.horse.name??'先頭馬')+'、ゴールイン！',8);
 captions.sort((a,b)=>a.time-b.time);

 function frame(value:number) {
  const actual=Math.max(0,value-startAt);
  const replay=value>=replayAt;
  const freeze=actual>=finish&&actual<finish+0.42;
  const replayTime=lastHundred+(value-replayAt)/replayLength*(Math.min(last,finish+0.55)-lastHundred+0.24);
  const time=replay?replayTime:freeze?finish:actual;
  const runners=field(time);
  const remaining=Math.max(0,distance-(runners[0]?.distance??0));
  const shot:Shot=replay?'replay':value<5.45?'paddock':value<startAt||actual<5.5?'gate':
   actual>=finish-3.7?'finish':actual>=straightAt?'tele':
   remaining<=distance*0.44?'corner':midShots[Math.floor((actual-5.5)/12)%midShots.length];
  return {actual,time,field:runners,remaining,shot};
 }
 function subtitle(value:number,shot:Shot) {
  if(value<5.45)return 'ゲートへ向かう注目馬を追います。';
  if(value<startAt)return '各馬、ゲートに入って発走を待ちます。';
  if(shot==='replay')return 'ゴール前100m、上位の攻防をスローで振り返ります。';
  const t=value-startAt;
  const recent=captions.filter(c=>c.time<=t&&t-c.time<4.3).sort((a,b)=>b.priority-a.priority||b.time-a.time)[0];
  if(recent)return recent.text;
  if(shot==='rear')return '後方の各馬は脚をため、前を追います。';
  if(shot==='corner')return 'コーナーを回り、直線へ向けて各馬が動きます。';
  const [leader,next]=field(t);
  if(!leader)return '';
  if(shot==='finish'||shot==='tele'){
   const meters=Math.max(0,Math.round((distance-leader.distance)/50)*50);
   return '残り約'+meters+'m、'+name(leader)+'が先頭。';
  }
  if(next&&leader.distance-next.distance<3)return name(leader)+'を'+name(next)+'がマーク。';
  return name(leader)+'がレースを引っ張ります。'+paceLabel(result.pace)+'です。';
 }
 return {frame,subtitle,finish,last,replayAt,end,closeFinish,straightAt};
}
