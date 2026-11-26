import * as T from 'three';
import type { Race } from '../../lib/races';
import { courseOf, courseElevation, courseGrade } from '../../lib/course-data';
import { clamp, seedFrom, smooth } from './motion';

const pi=Math.PI;
const mod=(n:number,d:number)=>((n%d)+d)%d;
class Bend extends T.Curve<T.Vector3>{
 constructor(private x:number,private r:number,private side:number,private left:boolean){super();}
 getLength(){return pi*this.r;}
 getPointAt(t:number,v=new T.Vector3()){return this.getPoint(t,v);}
 getPoint(t:number,v=new T.Vector3()){
  const a=this.left?pi*t+pi:pi*t;
  return v.set(this.x+this.r*Math.sin(a),0,this.r*Math.cos(a)*this.side);
 }
}

export function pathFor(race:Race,surface=race.surface){
 const venue=courseOf(race,surface);
 const {straight,lap,width,runout}=venue;
 const side=venue.turn==='左'?1:-1;
 const halfStraight=(straight+runout)/2;
 const radius=(lap-4*halfStraight)/(2*pi);
 const path=new T.CurvePath<T.Vector3>(),a=halfStraight;
 path.add(new T.LineCurve3(new T.Vector3(-a,0,radius*side),new T.Vector3(a,0,radius*side)));
 path.add(new Bend(a,radius,side,false));
 path.add(new T.LineCurve3(new T.Vector3(a,0,-radius*side),new T.Vector3(-a,0,-radius*side)));
 path.add(new Bend(-a,radius,side,true));
 const length=path.getLength();
 const table=Array.from({length:Math.ceil(length/1.3)+1},(_,i)=>path.getPoint(i/Math.ceil(length/1.3)));
 const finish=straight;
 const start=finish-race.distance;
 const turf=surface==='芝';
 const pocket=race.venue==='東京'&&turf&&race.distance===1800;
 function point(station:number,out:T.Vector3){
  const v=mod(station,length)/length*(table.length-1);
  const i=Math.floor(v);
  return out.copy(table[i]).lerp(table[i+1],v-i);
 }
 function elevation(station:number){return courseElevation(venue,finish-station);}
 const v=new T.Vector3(),w=new T.Vector3(),mapPoint=new T.Vector3();
 function frame(station:number,pos:T.Vector3,tangent:T.Vector3,outer:T.Vector3){
  point(station,pos);point(station+0.65,v);point(station-0.65,w);
  v.y=elevation(station+.65);w.y=elevation(station-.65);
  tangent.subVectors(v,w).normalize();
  outer.set(-tangent.z*side,0,tangent.x*side).normalize();
  pos.y=elevation(station);
 }
 function at(d:number,lane:number,pos:T.Vector3,tangent:T.Vector3,outer:T.Vector3){
  const station=start+d;
  frame(station,pos,tangent,outer);
  const offset=pocket?(1-smooth(d/105))*8:0;
  return pos.addScaledVector(outer,lane-width/2+offset);
 }
 return {path,length,finish,start,width,side,radius,straight,halfStraight,pocket,frame,at,elevation,
  grade(d:number){return courseGrade(venue,race.distance-d);},
  map(d:number){const p=point(start+d,mapPoint);return {x:p.x,y:p.z};}
 };
}
export type Track=ReturnType<typeof pathFor>;

export function canvasTexture(size:number,paint:(g:CanvasRenderingContext2D)=>void){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');
 if(ctx)paint(ctx);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 return texture;
}

const pos=new T.Vector3(),forward=new T.Vector3(),outer=new T.Vector3();
const q=new T.Quaternion(),matrix=new T.Matrix4(),axes=new T.Vector3(),up=new T.Vector3(0,1,0);
function verge(track:Track,neighbor:Track|undefined,edge:-1|1,lane:-1|1,p:T.Vector3,o:T.Vector3){
 const offset=track.width*lane/2;
 if(!neighbor||lane!==edge)return offset;
 const radiusAt=(v:number)=>Math.hypot(Math.max(0,Math.abs(p.x+o.x*v)-neighbor.halfStraight),p.z+o.z*v);
 const border=neighbor.radius-edge*(neighbor.width/2+0.12);
 const overlaps=(v:number)=>edge*(radiusAt(v)-border)>0;
 if(!overlaps(offset))return offset;
 let lo=-track.width/2,hi=track.width/2;
 for(let j=0;j<12;j++){
  const mid=(lo+hi)*.5;
  if(overlaps(mid)===(edge===1))hi=mid;else lo=mid;
 }
 return (lo+hi)*.5;
}
function ribbon(track:Track,neighbor:Track|undefined,edge:-1|1){
 const n=Math.ceil(track.length/3),v:number[]=[],uv:number[]=[],indices:number[]=[];
 for(let i=0;i<=n;i++){
  const s=track.length*i/n;
  track.frame(s,pos,forward,outer);
  for(const side of [-1,1] as const){
   const offset=verge(track,neighbor,edge,side,pos,outer);
   v.push(pos.x+outer.x*offset,pos.y+0.035,pos.z+outer.z*offset);
   uv.push(i*track.length/n/18,(offset+track.width/2)/18);
  }
  if(i<n){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setIndex(indices);g.computeVertexNormals();return g;
}

function embankment(track:Track){
 const steps=Math.ceil(track.length/5),vertices:number[]=[],indices:number[]=[];
 for(const sign of [-1,1]){
  const base=vertices.length/3;
  for(let i=0;i<=steps;i++){
   track.frame(i*track.length/steps,pos,forward,outer);
   const edge=sign*track.width/2,toe=edge+sign*(4+pos.y*1.6);
   vertices.push(pos.x+outer.x*edge,pos.y,pos.z+outer.z*edge,pos.x+outer.x*toe,-.23,pos.z+outer.z*toe);
   if(i<steps){const a=base+i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
 geometry.setIndex(indices);geometry.computeVertexNormals();
 return new T.Mesh(geometry,new T.MeshStandardMaterial({color:'#596c43',side:T.DoubleSide,roughness:1}));
}

function trackMaterial(dirt:boolean){
 const tex=canvasTexture(256,g=>{
  const random=seedFrom(dirt?'sand':'grass');
  g.fillStyle=dirt?'#8c7967':'#67784a';g.fillRect(0,0,256,256);
  for(let i=0;i<11000;i++){
   const x=random()*256,y=random()*256;
   g.fillStyle=dirt?(i%3===0?'#c4ad902c':'#59493a26'):(i%3===0?'#c5bd6a25':'#23371621');
   g.fillRect(x,y,dirt?1.8:0.9,dirt?1.4:2.6);
  }
  g.fillStyle=dirt?'#bd9e8227':'#17291318';g.fillRect(0,0,126,256);
 });
 tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=2;
 return new T.MeshStandardMaterial({map:tex,roughness:0.97,side:T.DoubleSide});
}

function rail(scene:T.Scene,track:Track,yellow:boolean,neighbor?:Track){
 const step=5.2,n=Math.ceil(track.length/step),actual=track.length/n;
 const metal=new T.MeshStandardMaterial({color:0xe9e6ce,roughness:0.78});
 const top=new T.MeshStandardMaterial({color:yellow?0xd3ad51:0xf7f4e3,roughness:0.68});
 const segments=new T.InstancedMesh(new T.BoxGeometry(1,1,1),top,n*2);
 const posts=new T.InstancedMesh(new T.BoxGeometry(1,1,1),metal,n*2);
 for(let side=0;side<2;side++)for(let i=0;i<n;i++){
  const edge=yellow?1:-1;
  track.frame((i+0.5)*actual,pos,forward,outer);
  const lane=verge(track,neighbor,edge,side?1:-1,pos,outer);
  pos.addScaledVector(outer,lane);pos.y+=1.03;
  q.setFromUnitVectors(axes.set(1,0,0),forward);
  const k=side*n+i;
  matrix.compose(pos,q,axes.set(actual*(1+lane/track.radius)+0.09,0.105,0.12));
  segments.setMatrixAt(k,matrix);
  track.frame(i*actual,pos,forward,outer);
  pos.addScaledVector(outer,verge(track,neighbor,edge,side?1:-1,pos,outer));pos.y+=0.49;
  q.setFromAxisAngle(up,Math.atan2(-forward.z,forward.x));
  matrix.compose(pos,q,axes.set(0.085,1,0.12));posts.setMatrixAt(k,matrix);
 }
 scene.add(segments,posts);
}

function markers(scene:T.Scene,track:Track,distance:number){
 const values=new Set<number>([100,300,500,600,0]);
 for(let left=200;left<=distance;left+=200)values.add(left);
 const stripes=new T.InstancedMesh(new T.CylinderGeometry(.116,.116,.39,10),new T.MeshStandardMaterial({color:0xffffff}),values.size*7);
 const white=new T.Color('#f6f2df'),red=new T.Color('#bd3436');
 let index=0;
 for(const left of values){
  if(left>distance)continue;
  track.at(distance-left,-0.8,pos,forward,outer);
  for(let j=0;j<7;j++){
   matrix.makeTranslation(pos.x,pos.y+0.196+j*.39,pos.z);
   stripes.setMatrixAt(index,matrix);stripes.setColorAt(index++,j%2?white:red);
  }
  const tex=canvasTexture(96,g=>{
   g.fillStyle='#f8eed2';g.beginPath();g.arc(48,48,43,0,pi*2);g.fill();g.strokeStyle='#ac3036';g.lineWidth=7;g.stroke();
   g.fillStyle='#a6292b';g.font='bold 54px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(left?String(left/100):'G',48,51);
  });
  const label=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));label.position.copy(pos).add(new T.Vector3(0,2.85,0));label.scale.set(1.42,1.42,1);
  scene.add(label);
 }
 stripes.count=index;scene.add(stripes);
 const finishTrack=new T.Mesh(new T.BoxGeometry(track.width,.024,.44),new T.MeshBasicMaterial({color:0xfffcf2}));
 track.at(distance,track.width/2,pos,forward,outer);
 finishTrack.position.copy(pos);finishTrack.position.y+=.079;
 finishTrack.rotation.y=Math.atan2(forward.x,forward.z);
 scene.add(finishTrack);
 track.at(distance,-1.15,pos,forward,outer);
 const panel=new T.Group();
 panel.position.copy(pos);
 panel.rotation.y=Math.atan2(forward.x,forward.z);
 const stripe=new T.BoxGeometry(.31,.52,.30);
 for(let i=0;i<9;i++){
  const segment=new T.Mesh(stripe,new T.MeshStandardMaterial({color:i%2?0xf9f4e8:0xbb2934}));
  segment.position.y=.26+i*.52;panel.add(segment);
 }
 const boardMap=canvasTexture(128,g=>{
  g.fillStyle='#be2831';g.fillRect(0,0,128,128);
  g.fillStyle='#fff7e3';g.fillRect(6,6,116,116);
  g.fillStyle='#be2831';g.fillRect(12,12,104,104);
  g.font='900 25px sans-serif';g.textAlign='center';g.fillStyle='#fff9e7';g.fillText('FINISH',64,72);
 });
 const flag=new T.Sprite(new T.SpriteMaterial({map:boardMap}));
 flag.scale.set(2.0,2.0,1);flag.position.y=4.6;panel.add(flag);
 scene.add(panel);
}

function landscape(scene:T.Scene,turf:Track){
 const random=seedFrom('tokyo-stands');
 const stand=new T.Group();const z=turf.side*(turf.radius+113);
 const body=new T.MeshStandardMaterial({color:'#d7d6c8'});
 const shade=new T.MeshStandardMaterial({color:'#55696c',roughness:.83});
 const glass=new T.MeshStandardMaterial({color:'#607c81',metalness:.23,roughness:.35});
 const box=new T.BoxGeometry(1,1,1);
 function piece(parent:T.Object3D,x:number,y:number,z0:number,w:number,h:number,d:number,m:T.Material){
  const mesh=new T.Mesh(box,m);mesh.position.set(x,y,z0);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
 }
 piece(stand,60,4,z,340,8,23,body);
 for(let level=0;level<4;level++){
  piece(stand,60,8.8+level*4.2,z+level*3*turf.side,338,1.15,26,body);
  piece(stand,60,10.7+level*4.2,z+level*3*turf.side,333,2.7,23,level===3?glass:shade);
 }
 piece(stand,60,27,z+5*turf.side,352,1.15,43,body);
 scene.add(stand);
 const audience=new T.InstancedMesh(new T.PlaneGeometry(0.24,0.32),new T.MeshBasicMaterial({side:T.DoubleSide}),1296);
 const palette=['#c8c8b9','#394751','#3e515f','#83636b','#728998','#e1d5aa','#5b514a'].map(c=>new T.Color(c));
 for(let i=0;i<audience.count;i++){
  const level=i%4;
  matrix.makeTranslation(-100+random()*322,9.15+level*4.2+random()*1.8,z+(level*3-11.61)*turf.side);
  audience.setMatrixAt(i,matrix);audience.setColorAt(i,palette[Math.floor(random()*palette.length)]);
 }
 scene.add(audience);
 const crown=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({roughness:1}),260);
 const trunks=new T.InstancedMesh(new T.CylinderGeometry(.25,.44,1,5),new T.MeshStandardMaterial({color:'#524733'}),260);
 const foliage=['#586039','#728146','#506940','#8e7142','#ad763c','#8e4e37','#5a7749'].map(c=>new T.Color(c));
 for(let i=0;i<crown.count;i++){
  turf.frame(random()*turf.length,pos,forward,outer);
  const primary=pos.z*turf.side<-20;
  pos.addScaledVector(outer,36+random()*(primary?28:100));
  if(pos.z*turf.side>turf.radius&&pos.x>-280&&pos.x<320){pos.z+=turf.side*112;}
  const tall=5+random()*8;
  matrix.makeScale(1,tall,1);matrix.setPosition(pos.x,tall/2,pos.z);trunks.setMatrixAt(i,matrix);
  matrix.makeScale(3.3+random()*4,tall*.46,3.2+random()*4);
  matrix.setPosition(pos.x,tall+1,pos.z);crown.setMatrixAt(i,matrix);crown.setColorAt(i,foliage[Math.floor(random()*foliage.length)]);
 }
 scene.add(crown,trunks);
 const hedgeMap=canvasTexture(128,g=>{
  g.fillStyle='#364a31';g.fillRect(0,0,128,128);
  for(let i=0;i<2300;i++){
   g.fillStyle=['#8d8b4b6b','#6577485e','#73855255','#273e2e6b'][i%4];
   g.fillRect(random()*128,random()*128,1+random()*5,1+random()*5);
  }
 });
 const shrubs=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({map:hedgeMap,roughness:1}),78);
 for(let i=0;i<shrubs.count;i++){
  const station=turf.straight+(turf.length-turf.straight)*i/78;
  turf.frame(station,pos,forward,outer);
  pos.addScaledVector(outer,29);pos.y+=2.15;
  q.setFromUnitVectors(axes.set(1,0,0),forward);matrix.compose(pos,q,axes.set(27,4.3,4.2));
  shrubs.setMatrixAt(i,matrix);
 }
 scene.add(shrubs);
 for(let i=0;i<21;i++){
  const h=11+random()*29;
  piece(scene,-420+i*40,h/2,(-turf.radius-200-random()*100)*turf.side,23+random()*24,h,24,shade);
 }
 const tower=new T.Group();tower.position.set(-430,0,-320*turf.side);
 const points:T.Vector3[]=[];
 for(let level=0;level<6;level++){
  const y=level*7,w=5-level*.67;
  for(const sign of [-1,1]){
   points.push(new T.Vector3(sign*w,y,0),new T.Vector3(sign*(w-.67),y+7,0));
   points.push(new T.Vector3(sign*w,y,0),new T.Vector3(-sign*(w-.67),y+7,0));
  }
  points.push(new T.Vector3(-12+level,y+5,0),new T.Vector3(12-level,y+5,0));
 }
 tower.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#676f61'})));scene.add(tower);
 const vision=canvasTexture(256,g=>{
  g.fillStyle='#20353a';g.fillRect(0,0,256,256);g.fillStyle='#5b826f';g.fillRect(12,38,232,182);
  g.fillStyle='#ece8be';g.font='bold 23px sans-serif';g.textAlign='center';g.fillText('KEIBA LIFE',128,129);
 });
 piece(scene,181,5,11,2.2,10,2.2,shade);piece(scene,212,5,11,2.2,10,2.2,shade);
 piece(scene,196,15,11,43,13,.8,shade);
 const screen=new T.Mesh(new T.PlaneGeometry(39,11),new T.MeshBasicMaterial({map:vision,side:T.DoubleSide}));
 screen.position.set(196,15,11+turf.side*.45);scene.add(screen);
}

export function makeCourse(scene:T.Scene,race:Race){
 const turf=pathFor(race,'芝'),dirt=pathFor(race,'ダート'),track=race.surface==='芝'?turf:dirt;
 const ground=new T.Mesh(new T.PlaneGeometry(2500,1900),new T.MeshStandardMaterial({color:'#596c43',roughness:1}));
 ground.rotation.x=-pi/2;ground.position.y=-0.23;ground.receiveShadow=true;scene.add(ground,embankment(track));
 // Simplified secondary ovals sometimes intersect. Leave the active racing line unobstructed.
 const secondary=track===turf?dirt:turf;
 const clearance=(track===turf?-1:1);
 const nested=Array.from({length:48},(_,i)=>{
  secondary.frame(i*secondary.length/48,pos,forward,outer);
  const radiusAt=Math.hypot(Math.max(0,Math.abs(pos.x)-track.halfStraight),pos.z);
  return clearance*(radiusAt-track.radius);
 }).every(gap=>gap>track.width/2+4);
 for(const path of nested?[track,secondary]:[track]){
  const isDirt=path===dirt;
  const mesh=new T.Mesh(ribbon(path,path===track?undefined:track,isDirt?1:-1),trackMaterial(isDirt));
  mesh.receiveShadow=true;scene.add(mesh);rail(scene,path,isDirt,path===track?undefined:track);
 }
 const shadeTex=canvasTexture(64,g=>{
  const fog=g.createRadialGradient(32,32,3,32,32,30);
  fog.addColorStop(0,'#182a2b6a');fog.addColorStop(.55,'#182a2b4b');fog.addColorStop(1,'#182a2b00');
  g.fillStyle=fog;g.fillRect(0,0,64,64);
 });
 const shadeMesh=new T.InstancedMesh(new T.PlaneGeometry(1,1).rotateX(-pi/2),
  new T.MeshBasicMaterial({map:shadeTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),38);
 const random=seedFrom('autumn light');
 for(let i=0;i<shadeMesh.count;i++){
  track.frame(track.straight+57+((track.length-track.straight-85)*i/shadeMesh.count),pos,forward,outer);
  pos.y+=.064;pos.addScaledVector(outer,(random()-.5)*24);
  q.setFromAxisAngle(up,-.56);
  matrix.compose(pos,q,axes.set(7+random()*12,1,23+random()*18));shadeMesh.setMatrixAt(i,matrix);
 }
 scene.add(shadeMesh);
 markers(scene,track,race.distance);landscape(scene,turf);
 return track;
}
