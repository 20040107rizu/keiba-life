import * as T from 'three';
import type { Track } from './course';
import { clamp, smooth, type Motion, type Place, type Shot } from './motion';

export const lenses:Record<Shot,number>={S2:200,S3:450,S4:800,S5:150,S6:600,S7:300,S7b:200,S8:200,PHOTO:180};
export const horizontal=(lens:number)=>2*Math.atan(18/lens)*180/Math.PI;
function lens(camera:T.PerspectiveCamera,mm:number,aspect:number){
 const vertical=2*Math.atan(18/mm/aspect)*180/Math.PI;
 camera.fov=vertical;camera.aspect=aspect;camera.updateProjectionMatrix();
}

export function cameraDirector(track:Track,motion:Motion){
 let previous:Shot|undefined,clock=0;
 const camera=new T.PerspectiveCamera(15,1,.6,2000);
 const wide=new T.PerspectiveCamera(11,1,.6,2000);
 const center=new T.Vector3(),anchor=new T.Vector3(),ahead=new T.Vector3(),side=new T.Vector3();
 const target=new T.Vector3(),cameraGoal=new T.Vector3(),position=new T.Vector3(),look=new T.Vector3();
 const pv=new T.Vector3(),lv=new T.Vector3(),diff=new T.Vector3(),change=new T.Vector3();
 const startingCut=motion.points.find(p=>p.shot==='S3')?.time??0;
 const origin=new T.Vector3(),heading=new T.Vector3(),bank=new T.Vector3(), projected=new T.Vector3();
 let zoom=1,shiftX=0,shiftY=0;
 function framePack(entries:Place[],shot:Shot,dt:number,cut:boolean){
  camera.updateMatrixWorld();
  const sideView=shot==='S3'||shot==='S4'||shot==='S5'||shot==='S6'||shot==='S7b'||shot==='S8';
  let left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity,mainLeft=Infinity,mainRight=-Infinity;
  let noseX=0,noseY=0,noseBody=0,direction=0;
  for(let i=0;i<entries.length;i++){
   const p=entries[i];
   track.at(p.distance,p.lane,origin,heading,bank);
   if(i===0){
    projected.copy(origin).project(camera);
    noseX=projected.x;
    noseY=projected.y;
    noseBody=projected.copy(origin).setY(origin.y+2.1).project(camera).y-noseY;
    direction=projected.copy(origin).addScaledVector(heading,5).project(camera).x-noseX;
   }
   for(const end of [-3.25,.42])for(const side of [-.46,.46])for(const y of [0,2.85]){
    projected.copy(origin).addScaledVector(heading,end).addScaledVector(bank,side);
    projected.y+=y;
    projected.project(camera);
    left=Math.min(left,projected.x);right=Math.max(right,projected.x);
    bottom=Math.min(bottom,projected.y);top=Math.max(top,projected.y);
    if(i<Math.ceil(entries.length*.64)){mainLeft=Math.min(mainLeft,projected.x);mainRight=Math.max(mainRight,projected.x);}
   }
  }
  const wanted=clamp(Math.min((sideView?1.50:1.57)/Math.max(.05,mainRight-mainLeft),
   1.81/Math.max(.05,right-left),1.22/Math.max(.05,top-bottom),
   sideView?1.46/Math.max(.05,noseX-left,right-noseX):Infinity),.025,3.6);
  if(shot==='S6'){
   const closer=clamp(wanted,.32/Math.max(.006,noseBody),.47/Math.max(.006,noseBody));
   zoom=cut?closer:zoom+(closer-zoom)*(1-Math.exp(-dt*9));
   const pan=Math.tanh(direction*zoom*18);
   shiftX=.31*pan-noseX*zoom;
   shiftY=-.22-noseY*zoom;
   const e=camera.projectionMatrix.elements;
   e[0]*=zoom;e[5]*=zoom;e[8]-=shiftX;e[9]-=shiftY;
   camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
   return;
  }
  zoom=cut||wanted<zoom?wanted:zoom+(wanted-zoom)*(1-Math.exp(-dt*5.5));
  const xMiddle=-(left+right)*zoom*.5;
  const pan=sideView?Math.tanh(direction*zoom*13):0;
  const preferred=xMiddle+(pan*.31-noseX*zoom-xMiddle)*Math.abs(pan);
  const vertical=.12-(top+bottom)*zoom*.5;
  const blend=cut?1:1-Math.exp(-dt*12);
  const leftLimit=Math.max(-.91-left*zoom,sideView?-.56-noseX*zoom:-Infinity);
  const rightLimit=Math.min(.91-right*zoom,sideView?.56-noseX*zoom:Infinity);
  shiftX=clamp(shiftX+(preferred-shiftX)*blend,leftLimit,rightLimit);
  shiftY=clamp(shiftY+(vertical-shiftY)*blend,-.74-bottom*zoom,.86-top*zoom);
  const e=camera.projectionMatrix.elements;
  e[0]*=zoom;e[5]*=zoom;e[8]-=shiftX;e[9]-=shiftY;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 }
 function ease(current:T.Vector3,velocity:T.Vector3,destination:T.Vector3,dt:number,omega:number){
  const decay=Math.exp(-omega*dt);
  diff.subVectors(current,destination);
  change.copy(velocity).addScaledVector(diff,omega).multiplyScalar(dt);
  current.copy(destination).addScaledVector(diff,decay).addScaledVector(change,decay);
  velocity.addScaledVector(change,-omega).multiplyScalar(decay);
 }
 function aim(places:Place[],shot:Shot,time:number,aspect:number,wideAspect:number){
  const leader=places[0], tail=places.at(-1)??leader;
  if(!leader)return {camera,wide};
  const remaining=motion.distance-leader.distance;
  const gap=leader.distance-tail.distance;
  const packWeight=places.reduce((sum,_,i)=>sum+1/(1+i*.42),0);
  const centroid=places.reduce((sum,r,i)=>sum+r.distance/(1+i*.42),0)/packWeight;
  const laneMean=places.reduce((sum,r,i)=>sum+r.lane/(1+i*.42),0)/packWeight;
  let d=leader.distance*.34+centroid*.66-1.25;
  let lane=leader.lane*.24+laneMean*.76;
  let range=63,advance=6,height=15,mm=lenses[shot],cross=1;
  switch(shot){
   case 'S2':
    d=leader.distance*.75+centroid*.25-1.1;lane=track.width*.26;range=76;advance=-22;height=10.2;cross=-1;break;
   case 'S3':{
    const turn=smooth((time-startingCut)/3.8);
    const move=smooth((time-startingCut)/2.6);
    range=8+turn*96;advance=-32+move*7+turn*10;
    height=8+turn*9.5;cross=-1;break;
   }
   case 'S4':
    range=32;advance=-94;height=12;cross=-1;break;
   case 'S5':
    range=22;advance=-107;height=14;cross=-1;break;
   case 'S6':{
    const progress=1-clamp((remaining-motion.straight)/330);
    const rotation=.74+.73*smooth(progress/.85)-.22*smooth((progress-.84)/.16);
    const radius=97+Math.min(29,gap*.50);
    range=radius*Math.cos(rotation);advance=radius*Math.sin(rotation);
    height=5.4;cross=-1;
    break;
   }
   case 'S7':{
    const zoom=1-clamp((remaining-150)/Math.max(1,motion.straight-150));
    mm=300-92*zoom;
    range=84;advance=164; height=77;
    break;
   }
   case 'S7b':
    range=51;advance=33+Math.min(45,gap);height=14.5;break;
   case 'S8':
   case 'PHOTO':
    d=motion.distance;range=53;advance=0;height=8.2;lane=track.width*.5;break;
  }
  track.at(d,lane,anchor,ahead,side);
  center.copy(anchor);
  target.copy(anchor);target.y+=shot==='S5'?3.0:shot==='S7'?1:1.02;
  cameraGoal.copy(anchor).addScaledVector(side,range*cross).addScaledVector(ahead,advance);
  cameraGoal.y=anchor.y+height;
  const fixed=shot==='S8'||shot==='PHOTO';
  const dt=clamp(time-clock,0,.25);
  const cut=shot!==previous||time<clock||time-clock>.28;
  const pace=leader.speed*.34+places.reduce((sum,r,i)=>sum+r.speed/(1+i*.42),0)/packWeight*.66;
  const omega=12+clamp(pace/18)*6;
  if(cut||fixed){
   position.copy(cameraGoal);look.copy(target);pv.set(0,0,0);lv.set(0,0,0);
  }else{
   // Look ahead by the spring's constant-velocity delay, while damping lateral drift.
   const leadMetres=pace*2/omega;
   const limit=Math.max(.6,pace*.24);
   cameraGoal.addScaledVector(ahead,leadMetres);
   target.addScaledVector(ahead,leadMetres);
   ease(position,pv,cameraGoal,dt,omega);
   ease(look,lv,target,dt,omega);
   cameraGoal.addScaledVector(ahead,-leadMetres);
   target.addScaledVector(ahead,-leadMetres);
   if(position.distanceToSquared(cameraGoal)>limit*limit)position.sub(cameraGoal).setLength(limit).add(cameraGoal);
   if(look.distanceToSquared(target)>limit*limit)look.sub(target).setLength(limit).add(target);
  }
  previous=shot;clock=time;
  camera.position.copy(position);
  target.copy(look);
  camera.lookAt(target);
  lens(camera,mm,aspect);
  if(fixed){
   camera.updateMatrixWorld();
   // Stationary camera on the finish line extension. Widen the lens on approach,
   // then close up while keeping the line close to the centre of frame.
   const finish=projected.copy(anchor).project(camera);
   const lineX=finish.x;
   const front=places[0];
   track.at(front.distance,front.lane,origin,heading,bank);
   const hoofY=projected.copy(origin).project(camera).y;
   projected.copy(origin).addScaledVector(heading,-2.9).project(camera);
   const frontX=projected.x;
   const span=Math.abs(frontX-lineX);
   const bodyHeight=(projected.copy(origin).setY(origin.y+2.1).project(camera).y-hoofY);
   const wanted=Math.min(.60/Math.max(.05,bodyHeight),1.10/Math.max(.095,span));
   zoom=cut||wanted<zoom?wanted:zoom+(wanted-zoom)*(1-Math.exp(-dt*9));
   shiftX=clamp((lineX-frontX)*zoom*.20,-.27,.27)-lineX*zoom;
   const mat=camera.projectionMatrix.elements;
   mat[0]*=zoom;mat[5]*=zoom;mat[8]-=shiftX;mat[9]-=.06;
   camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }else framePack(shot==='S6'?places.slice(0,5):places,shot,dt,cut);
  if(shot==='S4'){
   track.at(leader.distance-gap*.51,laneMean,center,ahead,side);
   wide.position.copy(center).addScaledVector(side,-Math.max(103,(gap+8)*2.9)).addScaledVector(ahead,-12);
   wide.position.y=center.y+24;
   target.copy(center);target.y+=1.3;
   wide.lookAt(target);lens(wide,100,wideAspect);
  }
  return {camera,wide};
 }
 return {camera,aim};
}
