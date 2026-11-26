import { Vector3, type Camera } from 'three';
import type { Entry } from '../../lib/game';

export function horseMarkers(layer:HTMLDivElement,entries:Entry[]){
 const labels=Array.from(layer.querySelectorAll<HTMLElement>('[data-horse-number]'));
 const anchors=entries.map(()=>new Vector3());
 const projected=new Vector3(),depth=new Vector3();
 const positions=entries.map((entry,i)=>({i,r:entry.owned?16:13,x:0,y:0,depth:0,visible:false}));
 const sorted=[...positions];
 return {
  anchors,
  paint(camera:Camera,width:number,height:number,band:number){
   for(const marker of positions){
    const anchor=anchors[marker.i];
    const {x,y,z}=projected.copy(anchor).project(camera);
    marker.visible=Number.isFinite(x+y+z)&&z>=-1&&z<=1&&Math.abs(x)<=1.12&&Math.abs(y)<=1.12;
    marker.x=(x+1)*width/2;
    marker.y=band+(1-y)*(height-band)/2;
    marker.depth=-depth.copy(anchor).applyMatrix4(camera.matrixWorldInverse).z;
   }
   sorted.sort((a,b)=>a.depth-b.depth||a.i-b.i);
   for(let i=0;i<sorted.length;i++){
    const m=sorted[i],label=labels[m.i];
    label.hidden=!m.visible;
    if(!m.visible)continue;
    let dim=0;
    // Fade progressively at the edge of an overlap, without moving either label.
    for(let j=0;j<i;j++){
     const front=sorted[j];
     if(!front.visible)continue;
     const shared=m.r+front.r-Math.hypot(m.x-front.x,m.y-front.y);
     dim=Math.max(dim,Math.min(1,Math.max(0,shared/10)));
    }
    label.style.transform='translate3d('+(m.x-m.r)+'px,'+(m.y-m.r)+'px,0)';
    label.style.opacity=String(1-.49*dim);
    label.style.zIndex=String(sorted.length-i);
   }
  }
 };
}
