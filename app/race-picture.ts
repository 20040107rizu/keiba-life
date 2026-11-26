import type { Entry, Result } from '../lib/game';
import { venueOf } from '../lib/races';
import { appearanceOf, caps, raceHorseFallback, raceHorsePhoto, saddleOf, type HorseView } from './horse-art';

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo,Math.min(hi,v));
const smooth = (x: number) => { const t = clamp(x); return t*t*(3-2*t); };

export function racePlayback(result: Result) {
 const distance = result.race.distance;
 const times=result.finishTimes?.length===result.order.length?result.finishTimes:result.times;
 const finish = times[0] || distance / 17;
 const last = Math.max(finish, ...times);
 const snapshots = result.timeline ?? [];
 const finalSnapshot = snapshots.at(-1)?.t || finish;
 const runners = result.order.map((entry,i) => ({ entry, finish: times[i] || finish, look: appearanceOf(entry.horse), sprites: new Map<HorseView|number,HTMLCanvasElement>() }));
 function position(index: number, time: number) {
  const runner = runners[index];
  if (time <= 0) return 0;
  if (time >= runner.finish) return distance + Math.min(75,(time-runner.finish)*12);
  const clock = Math.min(finish,time);
  let metres: number;
  if (snapshots.length < 2) {
   const t = clamp(time/runner.finish);
   return distance * (t - 0.029 * (1-Math.exp(-t*35)) * (1-t));
  }
  const simulated = times===result.finishTimes?time:clock / finish * finalSnapshot;
  let upper = 1;
  while (upper < snapshots.length-1 && snapshots[upper].t < simulated) upper++;
  const a = snapshots[upper-1];
  const b = snapshots[upper];
  const lane = runner.entry.number - 1;
  const start = a.d[lane] ?? 0;
  const end = b.d[lane] ?? start;
  const step=Math.max(0.001,b.t-a.t);
  const u=clamp((simulated-a.t)/step);
  const secant=(end-start)/step;
  const previous=snapshots[upper-2], next=snapshots[upper+1];
  const before=previous ? (start-(previous.d[lane]??start))/(a.t-previous.t) : 0;
  const after=next ? ((next.d[lane]??end)-end)/(next.t-b.t) : secant;
  const tangent=(left:number,right:number)=>left>0&&right>0?2*left*right/(left+right):0;
  const m0=tangent(before,secant)*step, m1=tangent(secant,after)*step;
  metres=start+(end-start)*u*u*(3-2*u)+m0*u*(1-u)**2-m1*u*u*(1-u);
  if (time > finish && times!==result.finishTimes) metres += (distance-metres)*clamp((time-finish)/Math.max(0.001,runner.finish-finish));
  return Math.min(distance,metres);
 }
 function field(time: number) {
  return runners.map((runner,i) => ({
   ...runner, distance: position(i,time), velocity: (position(i,time+0.14)-position(i,Math.max(0,time-0.14)))/(time<0.14?time+0.14:0.28),
  })).sort((a,b) => b.distance-a.distance || (time<finish ? a.entry.number-b.entry.number : a.finish-b.finish));
 }
 let lo = 0;
 let hi = finish;
 for (let i=0;i<26;i++) {
  const mid = (lo+hi)*0.5;
  if (field(mid)[0]?.distance >= 1000) hi=mid;
  else lo=mid;
 }
 const lap=distance>=1000 ? hi : undefined;
 lo=0;
 hi=finish;
 for(let i=0;i<24;i++){
  const mid=(lo+hi)*0.5;
  if(position(0,mid)>=distance-100)hi=mid;
  else lo=mid;
 }
 return { distance, finish, last, field, lap, lastHundred:hi };
}

export type Playback = ReturnType<typeof racePlayback>;
export type Runner = ReturnType<Playback['field']>[number];
export type Shot = 'paddock'|'gate'|'pan'|'leaders'|'rear'|'split'|'corner'|'tele'|'finish'|'replay';
export function capOf(entry: Entry) { return caps[(entry.frame || entry.number)-1] ?? caps[(entry.number-1)%8]; }

export function runnerLane(runner: Runner, size: number, time: number, spread: number) {
 const gate = (runner.entry.number-1)/Math.max(1,size-1);
 const settle = smooth((time-1.25)/8);
 const style = clamp(runner.entry.horse.style,0,3);
 const course = 0.12 + 0.66*gate + style*0.055;
 const outer = style>=2 ? 0.47+0.51*gate : 0.07+0.53*gate;
 return gate+(course+(outer-course)*spread-gate)*settle;
}

function sprite(runner: Runner, view: HorseView | number) {
 const cached = runner.sprites.get(view);
 if (cached) return cached;
 const photo = raceHorsePhoto(view,runner.look,capOf(runner.entry));
 if(photo) runner.sprites.set(view,photo);
 return photo;
}

export function warmRacePhotos(runners: Runner[], views: (HorseView | number)[]) {
 const jobs = runners.flatMap(runner=>views.map(view=>({runner,view})));
 let next = 0;
 let frame = 0;
 function warm() {
  const job = jobs[next++];
  if(!job)return;
  sprite(job.runner,job.view);
  if(next<jobs.length)frame=requestAnimationFrame(warm);
 }
 frame=requestAnimationFrame(warm);
 return ()=>cancelAnimationFrame(frame);
}

type Scenery={stand:HTMLImageElement;forest:HTMLImageElement};
const W=760;

function photoStrip(ctx:CanvasRenderingContext2D,img:HTMLImageElement, height:number,shift:number,soft:boolean) {
 if(!img.complete||!img.naturalWidth)return;
 const tileWidth=W*1.42;
 const position=((shift%(2*tileWidth))+2*tileWidth)%(2*tileWidth);
 const first=Math.floor(position/tileWidth);
 if(soft)ctx.globalAlpha=0.65;
 for(let i=first;i<=first+1;i++){
  ctx.save();
  ctx.translate(i*tileWidth-position+(i%2?tileWidth:0),0);
  if(i%2)ctx.scale(-1,1);
  ctx.drawImage(img,0,0,tileWidth,height);
  ctx.restore();
 }
 if(soft){
  ctx.translate(-2,0);
  ctx.globalAlpha=0.35;
  for(let i=first;i<=first+1;i++){
   ctx.save();
   ctx.translate(i*tileWidth-position+(i%2?tileWidth:0),0);
   if(i%2)ctx.scale(-1,1);
   ctx.drawImage(img,0,0,tileWidth+2,height);
   ctx.restore();
  }
  ctx.translate(2,0);
  ctx.globalAlpha=1;
 }
}

const turfPattern=new WeakMap<CanvasRenderingContext2D,CanvasPattern>();
function turfTexture(ctx:CanvasRenderingContext2D) {
 const cached=turfPattern.get(ctx);
 if(cached)return cached;
 const tile=document.createElement('canvas');
 tile.width=164;tile.height=90;
 const g=tile.getContext('2d');
 if(!g)return;
 let seed=481;
 for(let i=0;i<1050;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  g.fillStyle=i%3?'#122e141d':'#fcdf9f19';
  g.fillRect(seed%164,(seed>>>10)%90,3+(seed%4),1);
 }
 const pattern=ctx.createPattern(tile,'repeat');
 if(pattern)turfPattern.set(ctx,pattern);
 return pattern;
}

export function drawRace(ctx:CanvasRenderingContext2D,result:Result,field:Runner[],shot:Shot,time:number,elapsed:number,scenery:Scenery,focused:number,h:number,detail=true,inset=false) {
 if(!field.length)return;
 const {distance,surface}=result.race;
 const venue=venueOf(result.race);
 const sign=venue.turn==='左'?1:-1;
 const leader=field[0];
 const lead=leader.distance;
 const remaining=distance-lead;
 const finishTime=result.times[0]||distance/17;
 const intro=shot==='paddock';
 const gate=shot==='gate';
 const end=shot==='finish'||shot==='replay';
 const replay=shot==='replay';
 const front=shot==='tele';
 const corner=shot==='corner';
 const close=shot==='leaders'||shot==='split';
 const rear=shot==='rear';
 const focusedRunner=field.find(r=>r.entry.number===focused)??leader;
 const cornerU=smooth((distance*0.44-remaining)/(distance*0.245));
 const approach=1-smooth((finishTime-time-3.7)/(finishTime*0.19-3.7));
 const gateOpen=gate?smooth(time/0.36):0;
 const angle=front?0.77+0.20*approach:corner?0.18+0.58*cornerU:
  end?(replay?0.61-0.50*smooth((110-remaining)/115):0.77*(1-smooth((time-finishTime+3.7)/3.7))):gate?0.48*(1-smooth(time/4)):intro?0.32:0.045;
 const spread=front||end?0.62+0.38*approach:corner?0.48*cornerU:0;
 const measuredGap=lead-field.at(-1)!.distance;
 const replayHorses=replay?result.order.slice(0,2).map(entry=>field.find(r=>r.entry.number===entry.number)).filter((r):r is Runner=>!!r):[];
 const replayGap=replayHorses.length===2?Math.abs(replayHorses[0].distance-replayHorses[1].distance):0;
 const replayCentre=replayHorses.length?replayHorses.reduce((total,r)=>total+r.distance,0)/replayHorses.length:lead;
 const focus=intro?0:gate?lead*0.69:rear?field[Math.max(0,field.length-3)].distance:replay?replayCentre:lead;
 const nominalSize=h/(inset?4.8:4.4);
 const scale=intro?h*0.61/127:gate?nominalSize/142:front?nominalSize*(0.85+approach*0.53)/127:
  replay?h*(0.43-0.10*smooth(replayGap/45))/127:end?h*0.37/127:close?h*0.31/127:rear?h*0.27/127:nominalSize/127;
 const perMetre=intro?19:gate?16:front?9:replay?Math.min(34,590/Math.max(12,replayGap)):close||rear||end?29:Math.min(22,550/(Math.max(19,measuredGap)+8));
 const focalX=intro?371:gate?395:front||corner?393:replay?380:rear?405:close||end?482:521;
 const focalY=h*(intro?0.78:gate?0.68:front?0.66+approach*0.12:end?0.74:0.51);
 const laneWidth=front?540:gate?540:corner?405:240;
 const laneDepth=h*(intro?0.18:front?0.15:gate?0.31:0.37);
 const horizon=h*(intro?0.32:gate?0.28:front?0.23:0.245);
 const curve=corner?(0.045+0.09*cornerU):0;
 const jitter=detail&&front?Math.sin(time*11)*1.1+Math.sin(time*4)*1.4:0;

 function project(station:number,lane:number) {
  const d=station-focus;
  const depth=Math.exp(0.87*Math.tanh(d/108)*angle);
  const bend=curve*laneWidth*(1-Math.cos(d/53));
  const x=focalX+d*perMetre*(1-angle*0.93)+(lane-0.48)*laneWidth*depth+bend+jitter;
  const y=focalY+(lane-0.5)*laneDepth*(1-angle*0.63)*depth+d*angle*h/410*(gate?-0.45:1);
  return {x:sign===1?x:W-x,y,depth};
 }
 type Point=ReturnType<typeof project>;
 function stroke(a:Point,b:Point,color:string,width:number,lift=0) {
  ctx.beginPath();ctx.moveTo(a.x,a.y-lift*a.depth);ctx.lineTo(b.x,b.y-lift*b.depth);
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
 }
 function quad(a:Point,b:Point,c:Point,d:Point,color:string){
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();
  ctx.fillStyle=color;ctx.fill();
 }
 ctx.fillStyle=surface==='芝'?'#58774c':'#a88d70';
 ctx.fillRect(0,0,W,h);
 ctx.fillStyle='#829795';ctx.fillRect(0,0,W,horizon+5);
 photoStrip(ctx,end?scenery.stand:scenery.forest,horizon+7,(intro?elapsed*11:focus*(end?2.3:front?0.84:1.74))*sign,detail&&!corner&&!gate&&!intro&&!front);
 ctx.save();ctx.beginPath();ctx.rect(0,horizon,W,h-horizon);ctx.clip();
 const base=Math.floor(focus/11)*11;
 for(let i=-16;i<17;i++) {
  const m=base+i*11;
  const alt=Math.round(m/11)%2;
  quad(project(m,-1.6),project(m+11,-1.6),project(m+11,2.1),project(m,2.1),surface==='芝'?(alt?'#567348':'#638155'):(alt?'#9d805f':'#aa8c68'));
 }
 const texture=turfTexture(ctx);
 if(texture){
  const x=((focus*perMetre*sign)%164+164)%164;
  ctx.save();ctx.translate(-x,0);ctx.fillStyle=texture;ctx.fillRect(0,horizon,W+164,h);ctx.restore();
 }
 function rail(lane:number, near=false) {
  ctx.strokeStyle=near?'#e8e5ce':'#efefdb';
  ctx.lineWidth=near?4:2.8;
  ctx.beginPath();
  for(let i=-18;i<=18;i++){
   const p=project(base+i*9,lane);
   if(i===-18)ctx.moveTo(p.x,p.y-17*p.depth);
   else ctx.lineTo(p.x,p.y-17*p.depth);
  }
  ctx.stroke();
  ctx.fillStyle='#dfe5d4';
  for(let i=-16;i<=16;i++){
   const p=project(base+i*12,lane);
   ctx.fillRect(p.x,p.y-17*p.depth,near?3:2,17*p.depth);
  }
 }
 rail(-0.14);
 for(const left of [800,600,400,200,0]){
  const mark=distance-left;
  if(mark<=0||Math.abs(mark-focus)>180)continue;
  const p=project(mark,-0.14);
  const edge=project(mark,1.25);
  if(left===0||left===600){
   stroke(p,edge,'#fbf8df',left===0?5:3.5);
   const tag=project(mark,0.98);
   ctx.font='900 24px sans-serif';ctx.fillStyle='#faf6da';ctx.textAlign='center';
   ctx.fillText(left?'600m':'FINISH',tag.x,tag.y-8);
  }
  const length=(left===0?94:61)*p.depth;
  for(let y=0;y<length;y+=10) {ctx.fillStyle=y%20?'#c83734':'#faf4dc';ctx.fillRect(p.x-5,p.y-y-10,10,10);}
  if(left){ctx.fillStyle='#f7f3dd';ctx.fillRect(p.x-17,p.y-length-24,34,22);ctx.fillStyle='#303729';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(String(left),p.x,p.y-length-9);}
 }
 ctx.restore();

 const gateCount=field.length;
 const gateStation=intro?9:0;
 function startingGate(foreground:boolean) {
  const roof=gateStation+(intro?1:2);
  const first=project(roof,-0.09), last=project(roof,1.08);
  const height=intro?Math.min(190,h*0.35):Math.min(151,h*0.29);
  if(!foreground){
   const far=project(roof-3,-0.09), farEnd=project(roof-3,1.08);
   quad({...first,y:first.y-height},{...last,y:last.y-height},{...farEnd,y:farEnd.y-height-13},{...far,y:far.y-height-13},'#273f3a');
   stroke(first,last,'#a5b6af',6,height);
   stroke(first,last,'#34494a',13,height-16);
  }
  if(foreground) {
   const spanA={...first,y:first.y-height};
   const spanB={...last,y:last.y-height};
   quad(spanA,spanB,{...spanB,y:spanB.y+20},{...spanA,y:spanA.y+20},'#3b5d56');
   stroke(spanA,spanB,'#d6dfd4',4);
  }
  for(let i=0;i<=gateCount;i++){
   const lane=-0.08+i*1.16/gateCount;
   const p=project(roof,lane), back=project(roof-3.5,lane);
   if(!foreground){stroke(back,p,'#8eaaa1',5,height-23);stroke(back,p,'#758a87',4,42);continue;}
   ctx.fillStyle='#a8bab4';ctx.fillRect(p.x-3,p.y-height,6,height+3);
   ctx.fillStyle='#4e6866';ctx.fillRect(p.x+3,p.y-height,2,height);
   if(i===gateCount)continue;
   const to=project(roof+gateOpen*2.5,lane+(1-gateOpen*0.76)*0.49/gateCount);
   const other=project(roof,lane+1.16/gateCount);
   const swing=project(roof+gateOpen*2.5,lane+(0.67+gateOpen*0.45)/gateCount);
   ctx.globalAlpha=0.82;
   for(const [hinge,edge] of [[p,to],[other,swing]]){
    quad({...hinge,y:hinge.y-64},{...edge,y:edge.y-64},{...edge,y:edge.y-29},{...hinge,y:hinge.y-29},'#344f49');
    stroke(hinge,edge,'#d2d7c5',2,63);
    stroke(hinge,edge,'#a7b5ab',2,31);
   }
   ctx.globalAlpha=1;
   ctx.fillStyle='#f1ebce';ctx.font='bold 13px sans-serif';ctx.textAlign='center';
   ctx.fillText(String(i+1),(p.x+other.x)/2,(p.y+other.y)/2-height+14);
  }
 }
 const showGate=intro||gate&&lead<115;
 if(showGate)startingGate(false);

 const candidates=intro?[focusedRunner]:replay?replayHorses:
  close?field.slice(0,4):rear?field.slice(-4):end?field.slice(0,4):field;
 const placed=candidates.map(runner=>{
  const lane=intro?0.39:runnerLane(runner,field.length,time,spread);
  const station=intro?-8+Math.min(8,elapsed)*1.87:runner.distance;
  const p=project(station,lane);
  return {runner,...p,zoom:scale*p.depth};
 }).sort((a,b)=>a.y-b.y);
 for(const {runner,x,y,zoom} of placed) {
  if(x<-240||x>W+240||y<horizon+15||y>h+140)continue;
  const {entry}=runner;
  const fading=front&&entry.horse.values[1]<570&&runner.velocity<leader.velocity-0.5;
  const effort=front||end?0.75+entry.horse.values[4]/2600:0.36;
  const rhythm=intro?elapsed*6+entry.number:runner.distance*1.04+entry.number*0.88;
  const frozen=gate&&time<=0;
  const phase=((Math.floor(rhythm)%8)+8)%8;
  const view:HorseView|number=intro?'charge':gate&&time<1.1?'rear':front?'front':angle>0.32?'charge':phase;
  const photo=sprite(runner,view);
  const substitute=typeof view==='number' ? sprite(runner,phase<4?'side':'side2') : undefined;
  const horse=photo??substitute??raceHorseFallback(runner.look);
  if(!horse)continue;
  const size=127;
  const nearView=view==='front'||view==='rear';
  const width=nearView?180:186;
  const strideWave=Math.sin(rhythm*Math.PI/4);
  const wobble=frozen?0:strideWave*(2+effort*4)*(fading?0.7:1);
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(zoom,zoom);
  ctx.fillStyle='#13231472';
  ctx.beginPath();ctx.ellipse(-37,4,78,7,-0.205,0,Math.PI*2);ctx.fill();
  if(detail&&!frozen&&!intro&&runner.velocity>8){
   ctx.fillStyle=surface==='芝'?'#b3b88688':'#cfad778c';
   for(let j=0;j<5;j++){
    const age=((rhythm*0.14+j*0.17)%1+1)%1;
    ctx.fillRect((-28-age*56)*sign+Math.sin(j*9)*7,-2-age*14+age*age*13,2+age,1.5);
   }
  }
  ctx.translate(0,-wobble+(fading?3:0));
  ctx.rotate(sign*((fading?-0.028:0)+Math.sin(rhythm*Math.PI/4)*(effort*0.016)));
  ctx.scale(sign,1);
  const neckMotion=(front||end)?strideWave*4.2+(fading?-4:0):0;
  if(typeof view==='number'&&neckMotion){
   const cut=horse.width*0.73;
   const tail=horse.width-cut;
   ctx.drawImage(horse,0,0,cut,horse.height,-width/2,-size,width*0.73,size);
   ctx.save();
   ctx.translate(width*0.23,-size);
   ctx.transform(1,neckMotion/(width*0.27),0,1,0,0);
   ctx.drawImage(horse,cut,0,tail,horse.height,0,0,width*0.27,size);
   ctx.restore();
  }else ctx.drawImage(horse,-width/2,-size,width,size);
  if((front||end)&&runner.distance<distance&&runner.velocity>12){
   const cue=(time+entry.number*0.73)%2.2;
   if(cue>1.72&&cue<2.03){
    const sweep=(cue-1.72)/0.31;
    const hand=nearView?(Math.floor(time/2.2+entry.number)%2?13:-13):19;
    const y=nearView?-98:-99;
    const swing=nearView?Math.sign(hand):-1;
    ctx.beginPath();ctx.moveTo(hand,y);
    ctx.quadraticCurveTo(hand+swing*14,y-8+10*sweep,hand+swing*(25+6*sweep),y-20+34*sweep);
    ctx.strokeStyle='#281e19';ctx.lineWidth=1.8;ctx.stroke();
   }
  }
  const saddle=photo?saddleOf(view,runner.look):substitute?saddleOf(phase<4?'side':'side2',runner.look):undefined;
  if(saddle){
   const [left,top,right,bottom]=saddle;
   ctx.translate(((left+right)/2-0.5)*width,((top+bottom)/2-1)*size);
   ctx.scale(sign,1);
   ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.font='italic 900 '+Math.min(17,(right-left)*width*0.7)+'px sans-serif';
   ctx.fillStyle='#fff9ef';ctx.strokeStyle='#251e17aa';ctx.lineWidth=1;
   ctx.strokeText(String(entry.number),0,0);
   ctx.fillText(String(entry.number),0,0);
  }
  ctx.restore();
 }
 if(showGate)startingGate(true);
 if(!intro&&!gate&&!front&&!end&&detail){
  ctx.save();ctx.beginPath();ctx.rect(0,h*0.76,W,h*0.24);ctx.clip();rail(1.48,true);ctx.restore();
 }
 if(inset)return;
 const labelIds = new Set([field.find(r=>r.entry.owned)?.entry.number,leader.entry.number,field[1]?.entry.number,focused]);
 ctx.font='700 21px system-ui,sans-serif';ctx.textBaseline='alphabetic';ctx.textAlign='center';
 const labels:{x:number;y:number;width:number}[]=[];
 const marked=placed.filter(p=>labelIds.has(p.runner.entry.number)).sort((a,b)=>
  Number(b.runner===leader)-Number(a.runner===leader)||Number(b.runner.entry.owned)-Number(a.runner.entry.owned));
 for(const {runner,x,y,zoom} of marked){
  if(intro||gate&&time<0||x<28||x>W-28||y<horizon+20||y>h*0.94)continue;
  const name=runner.entry.number+' '+runner.entry.horse.name;
  const w=ctx.measureText(name).width+10;
  const centered=clamp(x,w/2+7,W-w/2-7);
  let top=clamp(y-108*zoom-12,65,h-92);
  for(let i=0;i<4;i++){
   if(!labels.some(l=>Math.abs(l.y-top)<26&&Math.abs(l.x-centered)<(l.width+w)/2))break;
   top-=27;
  }
  if(top<59||labels.some(l=>Math.abs(l.y-top)<24&&Math.abs(l.x-centered)<(l.width+w)/2))continue;
  labels.push({x:centered,y:top,width:w});
  ctx.strokeStyle='#071916e8';ctx.lineWidth=4;ctx.lineJoin='round';
  ctx.strokeText(name,centered,top);
  ctx.fillStyle=runner.entry.owned?'#ffe49a':'#fffef2';ctx.fillText(name,centered,top);
 }
}
