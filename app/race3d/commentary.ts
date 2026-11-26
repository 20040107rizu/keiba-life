import { formatTime, type Result } from '../../lib/game';
import type { Motion } from './motion';

type Call={text:string;priority:number;at:number};

export function raceCalls(result:Result,motion:Motion){
 const name=(rank:number)=>{
  const entry=result.order[rank];
  return entry?entry.number+'番、'+entry.horse.name:'';
 };
 let prev=-3,lastLead=-1,lastMover=-1,lastRanks:number[]=[];
 let nextRankSample=0,lastPass=-20;
 let visible:Call|undefined;
 const named=new Set<string>();
 function update(t:number):Call[]{
  if(t<prev){visible=undefined;lastLead=-1;lastRanks=[];lastPass=-20;lastMover=-1;nextRankSample=t;named.clear();}
  const last=prev;
  prev=t;
  const calls:Call[]=[];
  function once(key:string,when:boolean,text:string,priority:number){
   if(when&&!named.has(key)){named.add(key);calls.push({text,priority,at:t});}
  }
  const field=motion.field(Math.max(0,t)),lead=field[0],second=field[1];
  if(!lead)return calls;
  const left=Math.max(0,motion.distance-lead.distance);
  const shot=motion.shot(t);
  once('gate',t<0&&t>=-2,'各馬、ゲートに収まりました。',5);
  once('break',last<0&&t>=0&&t<3,'スタートしました！',10);
  once('quick',t>=2.5&&t<6,'好スタートは'+name(lead.rank)+'。',7);
  const late=result.notes.find(note=>note.includes('出遅れ'));
  once('late',!!late&&t>=4&&t<8,(late??'')+'。',8);
  if(t>=motion.winner){
   const margin=result.margins[1];
   once('finish',true,name(0)+'、1着でゴールイン！'+
    (motion.close?'際どい！ 写真判定です！':margin?'2着との差は'+margin+(/^\d/.test(margin)?'馬身':'')+'。':''),20);
   return calls;
  }
  once('early',t>=Math.min(12,motion.winner*.15)&&t<22,
   '先頭は'+name(lead.rank)+(second?'。2番手に'+name(second.rank):'')+'。',6);
  const lengths=Math.round((lead.distance-(field.at(-1)?.distance??lead.distance))/2.5);
  once('stretch',t>19&&(shot==='S4'||shot==='S5'),'先頭から最後方まで、およそ'+lengths+'馬身。',5);
  if(motion.lap!==undefined&&t-motion.lap>=0&&t-motion.lap<2.5){
   const [minutes,rest]=formatTime(motion.lap).split(':');
   const [seconds,tenths]=rest.split('.');
   const lap=(Number(minutes)>0?Number(minutes)+'分':'')+Number(seconds)+'秒'+tenths;
   once('lap',true,'1000メートル通過、'+lap+'。',6);
  }
  once('turn',shot==='S6','3、4コーナー。各馬、直線に向かいます。',6);
  once('straight',left<=motion.straight,'4コーナーを回って直線コースへ！',8);
  const earlyFight=t>=3&&t<19;
  const lateFight=left<=motion.straight+225&&left>18;
  if((earlyFight||lateFight)&&lastLead!==-1&&lastLead!==lead.rank&&t-lastPass>=1.4){
   calls.push({text:earlyFight?name(lead.rank)+'がハナを奪う！':name(lead.rank)+'が先頭に立った！',priority:9,at:t});
   lastPass=t;
  }
  if(t>=nextRankSample){
   if(left<=motion.straight+300&&left>45&&lastRanks.length&&t-lastPass>1.8){
    const mover=field.slice(1,5).find((r,i)=>lastRanks.indexOf(r.rank)>=i+3&&r.speed>lead.speed+.25&&r.rank!==lastMover);
    if(mover){calls.push({text:(mover.lane>lead.lane+1?'外から':'後方から')+name(mover.rank)+(left>motion.straight?'がまくってきた！':'が伸びてくる！'),priority:7,at:t});lastPass=t;lastMover=mover.rank;}
   }
   lastRanks=field.map(p=>p.rank);nextRankSample=t+2.1;
  }
  once('duel',left<=145&&left>18&&!!second&&lead.distance-second.distance<1.8,name(lead.rank)+'と'+name(second?.rank??lead.rank)+'のたたき合い！',11);
  once('last100',left<=100,second&&lead.distance-second.distance<5?'残り100メートル！ '+name(lead.rank)+'、粘れるか！':'残り100メートル！ '+name(lead.rank)+'が先頭！',10);
  lastLead=lead.rank;
  return calls;
 }
 let active:SpeechSynthesisUtterance|undefined,pending:Call|undefined,spokenAt=0;
 const supported=()=>typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
 function stop(){
  pending=undefined;
  if(active&&supported()){active=undefined;window.speechSynthesis.cancel();}
 }
 function speak(next:Call,t:number,speed:number){
  const speech=window.speechSynthesis;
  const utterance=new SpeechSynthesisUtterance(next.text);
  utterance.lang='ja-JP';
  utterance.voice=speech.getVoices().find(voice=>voice.lang.toLowerCase()==='ja-jp')??
   speech.getVoices().find(voice=>/^ja\b/i.test(voice.lang))??null;
  utterance.rate=speed===2?1.41:1.16;
  utterance.pitch=1.12;
  utterance.volume=.97;
  utterance.onstart=()=>console.info('[競馬ライフ 実況]',{race:result.key,seconds:Number(t.toFixed(2)),text:next.text});
  utterance.onend=utterance.onerror=()=>{if(active===utterance)active=undefined;};
  active=utterance;spokenAt=performance.now();
  try{speech.speak(utterance);}catch{active=undefined;}
 }
 return {
  stop,
  caption(t:number){return visible&&t>=visible.at&&t-visible.at<4?visible.text:undefined;},
  get speaking(){return !!active;},
  tick(t:number,enabled:boolean,speed:number){
   const available=update(t).sort((a,b)=>b.priority-a.priority);
   if(available[0]&&(!visible||available[0].priority>=visible.priority||t-visible.at>2.4))visible=available[0];
   if(!enabled||!supported()){stop();return;}
   if(pending&&t-pending.at>(pending.priority>=20?3:2.65))pending=undefined;
   const next=available[0];
   if(next&&(!pending||next.priority>=pending.priority))pending=next;
   if(active&&(performance.now()-spokenAt>5600||next&&next.priority>=20)){
    active=undefined;window.speechSynthesis.cancel();
   }
   if(!active&&pending){const call=pending;pending=undefined;speak(call,t,speed);}
  },
 };
}
