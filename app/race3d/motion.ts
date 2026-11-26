import type { Result } from '../../lib/game';
import { venueOf } from '../../lib/races';

export const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const smooth=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};
export type Shot='S2'|'S3'|'S4'|'S5'|'S6'|'S7'|'S7b'|'S8'|'PHOTO';
export type Place={rank:number;distance:number;speed:number;lane:number};

function curve(times:number[],values:number[]){
 const slopes=times.slice(1).map((t,i)=>(values[i+1]-values[i])/(t-times[i]));
 const tangent=times.map((_,i)=>{
  if(i===0)return 0;
  if(i===times.length-1)return slopes[i-1];
  const a=slopes[i-1],b=slopes[i];return a>0&&b>0?2*a*b/(a+b):0;
 });
 return (time:number)=>{
  let lo=1,hi=times.length-1;
  while(lo<hi){
   const mid=(lo+hi)>>1;
   if(time>times[mid])lo=mid+1;else hi=mid;
  }
  const i=lo;
  const h=times[i]-times[i-1],u=clamp((time-times[i-1])/h);
  const a=values[i-1],b=values[i],m=tangent[i-1],n=tangent[i];
  return {distance:a+(b-a)*u*u*(3-2*u)+h*(m*u*(1-u)**2-n*u*u*(1-u)),
   speed:Math.max(0,(b-a)*6*u*(1-u)/h+m*(1-4*u+3*u*u)+n*(3*u*u-2*u))};
 };
}

export function seedFrom(key:string){
 let n=2166136261;
 for(const c of key)n=Math.imul(n^c.charCodeAt(0),16777619);
 return ()=>{
  n=(Math.imul(n,1664525)+1013904223)>>>0;
  return n/4294967296;
 };
}

export function raceMotion(result:Result){
 const timed=!!result.finishTimes?.[0]&&result.timeline.length>1;
 const distance=result.race.distance, winner=(timed?result.finishTimes?.[0]:result.times[0])||distance/17;
 const strip=result.timeline??[];
 const finalSnapshot=strip.at(-1)?.t||winner;
 const straight=venueOf(result.race).straight;
 const finishTimes=result.order.map((_,i)=>(timed?result.finishTimes?.[i]:result.times[i])||winner);
 const runners=result.order.map((entry,rank)=>{
  const finish=finishTimes[rank], t=[0], d=[0];
  for(const snap of strip){
   const s=timed?snap.t:snap.t*(winner/finalSnapshot);
   if(s<=t.at(-1)!||s>=finish-0.005)continue;
   if(!Number.isFinite(snap.d[entry.number-1]))continue;
   t.push(s);d.push(clamp(snap.d[entry.number-1],d.at(-1)!,distance-0.001));
  }
  if(t.length===1){t.push(finish*0.11);d.push(distance*0.09);}
  t.push(finish);d.push(distance);
  const sample=curve(t,d), endSpeed=sample(finish).speed;
  return (time:number)=>{
   if(time<=0)return {distance:0,speed:0};
   if(time<finish)return sample(time);
   const slow=(time-finish)/2.6;
   return {distance:distance+2.6*endSpeed*(1-Math.exp(-slow)),speed:endSpeed*Math.exp(-slow)};
  };
 });
 function crossing(metres:number){
  if(metres<=0)return 0;
  if(metres>=distance)return winner;
  let lo=0,hi=winner;
  for(let i=0;i<30;i++){
   const mid=(lo+hi)/2;
   if(Math.max(...runners.map(fn=>fn(mid).distance))>=metres)hi=mid;else lo=mid;
  }
  return hi;
 }
 function longitudinal(time:number){
  const placed=runners.map(fn=>fn(time));
  if(timed)return placed;
  const lead=Math.max(...placed.map(r=>r.distance));
  const u=clamp((lead-(distance-76))/26), mix=smooth(u);
  const leadSpeed=placed.find(r=>r.distance===lead)?.speed??0;
  const derivative=6*u*(1-u)*leadSpeed/26;
  for(let i=1;i<placed.length;i++){
   const p=placed[i-1],q=placed[i];
   if(q.distance>p.distance){
    const gap=q.distance-p.distance;
    q.distance-=gap*mix;
    q.speed=Math.max(0,q.speed+(p.speed-q.speed)*mix-gap*derivative);
   }
  }
  return placed;
 }
 const random=seedFrom(result.key);
 const base=result.order.map(entry=>({gate:1.5+1.48*(entry.number-1),jitter:random(),style:entry.horse.style}));
 const step=0.20;
 const samples:number[][]=[];
 const maxTime=winner+5;
 for(let tick=0;tick<=Math.ceil(maxTime/step);tick++){
  const t=tick*step;
  const horses=longitudinal(t);
  const prev=samples.at(-1)??base.map(v=>v.gate);
  const lead=Math.max(...horses.map(r=>r.distance));
  const spread=smooth((lead-distance+straight+65)/125);
  const settle=smooth((t-1.0)/9.2);
  const next:number[]=[];
  const order=horses.map((_,i)=>i).sort((a,b)=>horses[b].distance-horses[a].distance||a-b);
  for(const i of order){
   const horse=horses[i],b=base[i];
   const ahead=order.find(j=>j!==i&&horses[j].distance>=horse.distance-0.05&&horses[j].distance-horse.distance<6&&
    horse.speed>horses[j].speed+0.15&&Math.abs(prev[j]-prev[i])<1.8);
   const inside=2.1+b.style*1.05+b.jitter*2.25+(ahead===undefined?0:2.1);
   const stretch=2.1+b.jitter*5+b.style*2.15+(result.order[i].number-1)*0.62;
   const desired=b.gate+(inside+(stretch-inside)*spread-b.gate)*settle;
   const blockers=order.filter(j=>j!==i&&Math.abs(horses[j].distance-horse.distance)<2.5+
    Math.abs(horse.speed-horses[j].speed)*step).map(j=>next[j]??prev[j]);
   const target=prev[i]+clamp(desired-prev[i],-0.40,0.44);
   const candidates=[target,prev[i],...blockers.flatMap(l=>[l-1.25,l+1.25])]
    .filter(l=>l>=1.2&&l<=33&&blockers.every(other=>Math.abs(l-other)>=1.1999))
    .sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
   next[i]=t<0.65?b.gate:candidates[0]??prev[i];
  }
  samples.push(next);
 }
 function field(t:number):Place[]{
  const snapshot=longitudinal(t);
  const p=clamp(t/step,0,samples.length-1);
  const i=Math.min(samples.length-2,Math.floor(p)), blend=smooth(p-i);
  const places=snapshot.map((r,rank)=>({...r,rank,lane:samples[i][rank]+(samples[i+1][rank]-samples[i][rank])*blend}));
  // Keep longitudinal positions authoritative. Resolve close crossings sideways.
  for(let a=0;a<places.length;a++){
   for(let b=0;b<a;b++){
    if(Math.abs(places[a].distance-places[b].distance)<2.5&&Math.abs(places[a].lane-places[b].lane)<1.2){
     const near=places.slice(0,a).filter(other=>Math.abs(other.distance-places[a].distance)<2.5).map(other=>other.lane);
     const target=places[a].lane;
     const open=near.flatMap(l=>[l-1.20001,l+1.20001]).filter(l=>l>=1.1&&l<=34&&near.every(other=>Math.abs(l-other)>=1.2))
      .sort((x,y)=>Math.abs(x-target)-Math.abs(y-target));
     if(open.length)places[a].lane=open[0];
    }
   }
  }
  return places.sort((a,b)=>b.distance-a.distance||a.rank-b.rank);
 }
 const points=[{time:-2,shot:'S2' as Shot}];
 const add=(at:number,shot:Shot)=>{if(at>points.at(-1)!.time+0.035)points.push({time:at,shot});};
 // The gate shot follows the first few metres after the release.
 add(crossing(timed?8:12),'S3');
 const launch=crossing(Math.min(200,distance*0.12));
 if(distance>1400&&distance-straight-400>Math.min(200,distance*0.12))add(launch,'S4');
 add(Math.max(launch,crossing(distance-straight-400)),'S5');
 add(crossing(distance-straight-330),'S6');
 add(crossing(distance-straight),'S7');
 if(straight>350)add(crossing(distance-350),'S7b');
 if(straight>350)add(crossing(distance-250),'S7');
 add(crossing(distance-100),'S8');
 const close=/^(同着|ハナ|アタマ|クビ)$/.test(result.margins[1]??'');
 if(close)add(winner+2,'PHOTO');
 const end=winner+(close?3.5:2);
 return {winner,distance,straight,points,field,end,close,lap:distance>=1000?crossing(1000):undefined,
  shot(t:number){for(let i=points.length-1;i>=0;i--)if(t>=points[i].time)return points[i].shot;return 'S2' as const;},
  speed(t:number){return [0,0.075,0.15,0.225,0.3].reduce((n,lag)=>n+(longitudinal(Math.max(0,t-lag)).sort((a,b)=>b.distance-a.distance)[0]?.speed??0),0)/5;},
  commentRatio(t:number){
   if(t<=0)return 0;if(t>=winner)return 1;if(timed||strip.length<2)return t/winner;
   const k=t*finalSnapshot/winner;let i=1;
   while(i<strip.length-1&&strip[i].t<k)i++;
   return (i-1+(k-strip[i-1].t)/(strip[i].t-strip[i-1].t))/(strip.length-1);
  },
 };
}
export type Motion=ReturnType<typeof raceMotion>;
