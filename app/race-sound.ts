// Original procedural ambience. No recorded samples or pitched oscillator effects.
export function createRaceSound(context: AudioContext) {
 const master=context.createGain();
 master.gain.value=0;
 master.connect(context.destination);
 const crowdGain=context.createGain();crowdGain.gain.value=0;
 crowdGain.connect(master);
 const stereo=context.createBuffer(2,context.sampleRate*9,context.sampleRate);
 let seed=63721;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let ch=0;ch<2;ch++){
  const wave=stereo.getChannelData(ch);
  let slow=0,fast=0,body=0;
  for(let i=0;i<wave.length;i++){
   const n=random()*2-1;
   slow+=(n-slow)*.015;fast+=(n-fast)*.16;body+=(n-body)*.052;
   const t=i/context.sampleRate;
   const swell=.63+.13*Math.sin(2*Math.PI*t/3)+.095*Math.sin(2*Math.PI*t/1.125+ch);
   const edge=Math.min(1,i/550,(wave.length-1-i)/550);
   wave[i]=((fast-body)*.48+(body-slow)*.91+slow*.37)*swell*edge;
  }
 }
 const crowd=context.createBufferSource();
 crowd.buffer=stereo;crowd.loop=true;crowd.connect(crowdGain);crowd.start();
 const hits=Array.from({length:5},(_,variant)=>{
  const buffer=context.createBuffer(1,Math.round(context.sampleRate*.16),context.sampleRate);
  const wave=buffer.getChannelData(0);
  let bottom=0,middle=0;
  for(let i=0;i<wave.length;i++){
   const t=i/context.sampleRate,n=random()*2-1;
   bottom+=(n-bottom)*(.023+variant*.004);middle+=(n-middle)*.16;
   const body=bottom*Math.exp(-t*(31+variant*1.5))*1.85;
   const impact=(middle-bottom)*Math.exp(-t*73)*.59;
   const surface=(n-middle)*Math.exp(-Math.max(0,t-.012)*75)*.07;
   wave[i]=(body+impact+surface)*Math.min(1,t*800);
  }
  return buffer;
 });
 let next=0,index=0,duck=1,ambience=0,muted=false;
 function crowdLevel(value:number){
  if(Math.abs(ambience-value)<.008)return;
  ambience=value;crowdGain.gain.setTargetAtTime(value,context.currentTime,value===0?.17:.34);
 }
 function duckSpeech(speaking:boolean){
  const target=speaking?.34:1;
  if(target===duck)return;
  duck=target;
  master.gain.setTargetAtTime(muted?0:.30*duck,context.currentTime,.09);
 }
 function hoof(time:number,volume:number){
  const sound=context.createBufferSource(),gain=context.createGain();
  sound.buffer=hits[index++%hits.length];sound.playbackRate.value=.84+random()*.34;
  gain.gain.value=volume;
  sound.connect(gain).connect(master);
  sound.onended=()=>{sound.disconnect();gain.disconnect();};
  sound.start(time);
 }
 return {
  intro(){crowdLevel(.16);},
  gate(){crowdLevel(.59);},
  finish(){crowdLevel(.88);},
  ambient(){crowdLevel(.16);},
  play(velocity:number,count:number,final:number,speed:number,opening=0){
   crowdLevel(.24+Math.max(0,Math.min(1,final))*.43+opening*.34);
   if(velocity<2.3)return;
   const now=context.currentTime;
   if(now<next)return;
   const stride=7/Math.max(4,velocity)/Math.sqrt(speed);
   next=now+stride*(.44+random()*.15);
   const gain=(.19+Math.min(count,12)*.018)*Math.min(1,velocity/13);
   hoof(now,gain);
   hoof(now+stride*.12,gain*.59);
   if(count>3)hoof(now+stride*.25,gain*.44);
  },
  duckSpeech,
  mute(value:boolean){muted=value;master.gain.setTargetAtTime(value?0:.30*duck,context.currentTime,.045);},
  quiet(){crowdLevel(0);},
  dispose(){crowd.stop();crowd.disconnect();crowdGain.disconnect();master.disconnect();},
 };
}
