import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Entry } from '../../lib/game';
import { appearanceOf } from '../horse-art';
import { capOf } from '../race-picture';
import { canvasTexture, type Track } from './course';
import { clamp, seedFrom, smooth, type Place } from './motion';

const bodyColors=['#895037','#503a34','#34363e','#a45e34','#a8aaa4','#e1ded1'];
const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.46,metalness:0});
const up=new T.Vector3(0,1,0);
const orientation=(t:T.Vector3)=>Math.atan2(t.x,t.z);

type Slice={geometry:T.BufferGeometry;color:string};
function assembled(slices:Slice[]){
 const parts=slices.map(({geometry,color})=>{
  const col=new T.Color(color), n=geometry.getAttribute('position').count;
  const values=new Float32Array(n*3);
  for(let i=0;i<n;i++)col.toArray(values,i*3);
  geometry.setAttribute('color',new T.BufferAttribute(values,3));return geometry;
 });
 const mesh=new T.Mesh(mergeGeometries(parts)!,material);
 parts.forEach(g=>g.dispose());return mesh;
}
function ellipsoid(color:string,x:number,y:number,z:number,a:number,b:number,c:number,rotation=0):Slice{
 return {color,geometry:new T.SphereGeometry(1,10,7).scale(a,b,c).rotateX(rotation).translate(x,y,z)};
}
function link(color:string,x:number,y:number,z:number,x2:number,y2:number,z2:number,r:number):Slice{
 const start=new T.Vector3(x,y,z),end=new T.Vector3(x2,y2,z2),delta=end.clone().sub(start);
 const center=start.addScaledVector(delta,.5);
 const q=new T.Quaternion().setFromUnitVectors(up,delta.clone().normalize());
 return {color,geometry:new T.CylinderGeometry(r*.82,r,delta.length(),8).applyQuaternion(q).translate(center.x,center.y,center.z)};
}
function jockey(entry:Entry){
 const {silks}=appearanceOf(entry.horse),rider=new T.Group();
 const body=assembled([
  ellipsoid(silks.body,0,.30,.10,.193,.292,.126,1.12),
  ellipsoid('#eee9d9',0,.098,-.10,.185,.135,.207),
  ellipsoid('#b48966',0,.42,.37,.102,.12,.098),
  ellipsoid(capOf(entry),0,.485,.372,.135,.108,.137),
  ellipsoid(capOf(entry),0,.445,.475,.106,.022,.113),
  ellipsoid('#282c2a',0,.423,.445,.093,.026,.031),
  ...[-1,1].flatMap(side=>[
   link('#f1ebdd',side*.095,.11,-.125,side*.27,.025,.145,.104),
   link('#e5dfd3',side*.27,.025,.145,side*.31,-.22,-.11,.075),
   link('#252426',side*.31,-.16,-.08,side*.323,-.42,-.20,.059),
   ellipsoid('#242624',side*.324,-.42,-.16,.07,.046,.113),
  ]),
 ]);
 rider.add(body);
 const arms=[-1,1].map(side=>{
  const group=new T.Group();group.position.set(side*.155,.328,.23);
  group.add(assembled([
    link(silks.sleeve,0,0,0,side*.075,-.13,.10,.068),
    link(silks.sleeve,side*.075,-.13,.10,side*.022,-.16,.30,.054),
    ellipsoid('#aaa38e',side*.022,-.16,.315,.036,.031,.039),
  ]));
  rider.add(group);return group;
 });
 const crop=new T.Mesh(new T.CylinderGeometry(.011,.014,.51,5),new T.MeshStandardMaterial({color:'#312823'}));
 crop.position.set(.033,.015,.42);crop.rotation.x=1.13;crop.visible=false;arms[1].add(crop);
 rider.position.set(0,1.49,-.05);
 return {rider,arms,crop};
}
function saddle(entry:Entry){
 const tex=canvasTexture(128,g=>{
  g.fillStyle='#4c2835';g.fillRect(0,0,128,128);g.strokeStyle='#78666c';g.lineWidth=4;g.strokeRect(3,3,122,122);
  g.font='900 82px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff8e7';g.fillText(String(entry.number),64,63);
  g.font='bold 14px sans-serif';g.fillText('KEIBA LIFE',64,109);
 });
 const cloth=new T.MeshStandardMaterial({map:tex,side:T.DoubleSide,roughness:.98});
 const group=new T.Group();
 for(const side of [-1,1]){
  const pad=new T.Mesh(new T.PlaneGeometry(.57,.42),cloth);
  pad.rotation.y=side*Math.PI/2;pad.rotation.x=side*.04;pad.position.set(side*.271,1.13,-.20);group.add(pad);
 }
 return group;
}

function smoothNormals(geometry:T.BufferGeometry){
 geometry.computeVertexNormals();
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
 const averages=new Map<string,T.Vector3>();
 const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*200)).join('/');
 const v=new T.Vector3();
 for(let i=0;i<p.count;i++){
  const hash=key(i),sum=averages.get(hash)??new T.Vector3();
  sum.add(v.fromBufferAttribute(n,i));averages.set(hash,sum);
 }
 for(let i=0;i<p.count;i++){
  v.copy(averages.get(key(i))!).normalize();n.setXYZ(i,v.x,v.y,v.z);
 }
}

function coloredHorse(geometry:T.BufferGeometry,index:number){
 const g=geometry.clone(),p=g.getAttribute('position'),source=g.getAttribute('color');
 const coat=new T.Color(bodyColors[index]??bodyColors[0]);
 const dark=new T.Color(index>=4?'#777873':'#272021');
 const values=new Float32Array(p.count*3), c=new T.Color();
 for(let i=0;i<p.count;i++){
  const y=p.getY(i)/.0094,z=p.getZ(i)/.0094;
  const luminance=source?Math.sqrt((source.getX(i)*.4+source.getY(i)*.45+source.getZ(i)*.15)):0.4;
  const tail=smooth((-z-87)/50)*.87;
  const points=(1-smooth((y-21)/61))*(index>=4?.31:.74);
  const mane=smooth((y-125)/32)*smooth((57-z)/31);
  c.copy(coat).lerp(dark,Math.max(tail,points,mane*.78));
  c.multiplyScalar(.72+luminance*.58);
  c.toArray(values,i*3);
 }
 g.setAttribute('color',new T.BufferAttribute(values,3));return g;
}
export async function horseField(scene:T.Scene,entries:Entry[],key:string){
 const gltf=await new GLTFLoader().loadAsync('/models/Horse.glb');
 const source=gltf.scene.children.find((o):o is T.Mesh=>o instanceof T.Mesh);
 const clip=gltf.animations[0];
 if(!source||!clip)throw new Error('Horse animation unavailable');
 source.geometry.scale(.0094,.0094,.0094);
 // GLTF stores relative morphs. Scale them with the base mesh.
 if(source.geometry.morphTargetsRelative)for(const target of source.geometry.morphAttributes.position??[]){
  const p=target as T.BufferAttribute;
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)*.0094,p.getY(i)*.0094,p.getZ(i)*.0094);
 }
 smoothNormals(source.geometry);
 const base=source.geometry.getAttribute('position');
 const nose=Array.from({length:base.count},(_,i)=>i).filter(i=>base.getY(i)>.94&&base.getZ(i)>1.0);
 const geometryCache=new Map<number,T.BufferGeometry>();
 const random=seedFrom(key+':gait');
 const shadowTex=canvasTexture(64,g=>{
  const shade=g.createRadialGradient(32,32,4,32,32,31);shade.addColorStop(0,'#17221990');shade.addColorStop(.66,'#17221953');shade.addColorStop(1,'#17221900');
  g.fillStyle=shade;g.fillRect(0,0,64,64);
 });
 const blobGrid=new T.PlaneGeometry(2.1,4.9);
 const blobMat=new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 const mounts=entries.map(entry=>{
  const coat=appearanceOf(entry.horse).coatIndex;
  if(!geometryCache.has(coat)){
   // Material shading accents use the original centimetre coordinates.
   geometryCache.set(coat,coloredHorse(source.geometry,coat));
  }
  const mesh=new T.Mesh(geometryCache.get(coat)!,material);
  mesh.name=source.name;mesh.updateMorphTargets();
  const mix=new T.AnimationMixer(mesh),action=mix.clipAction(clip);
  action.play();
  const {rider,arms,crop}=jockey(entry);
  const body=new T.Group(),root=new T.Group();
  body.add(mesh,rider,saddle(entry));root.add(body);scene.add(root);
  const shadow=new T.Mesh(blobGrid,blobMat);shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  return {mesh,body,root,shadow,mix,action,rider,arms,crop,phase:random(),jersey:rider.position.y};
 });
 const originalMaterial=source.material;
 if(Array.isArray(originalMaterial))originalMaterial.forEach(m=>m.dispose());else originalMaterial.dispose();
 source.geometry.dispose();
 const pos=new T.Vector3(),dir=new T.Vector3(),outer=new T.Vector3();
 function animate(track:Track,places:Place[],time:number,distance:number,camera:T.Camera,quality:boolean){
  for(const r of places){
   const a=mounts[r.rank];
   if(!a)continue;
   track.at(r.distance,r.lane,pos,dir,outer);
   a.root.position.copy(pos);a.root.rotation.y=orientation(dir);
   const blend=smooth(r.speed/5);
   const cycle=(r.distance/7+a.phase)*clip.duration;
   a.action.setEffectiveWeight(.24+.76*blend);
   a.mix.setTime(cycle);
   const points=a.mesh.geometry.getAttribute('position');
   const morphs=a.mesh.geometry.morphAttributes.position??[];
   let z=1.17;
   for(const i of nose){
    let at=points.getZ(i);
    for(let m=0;m<morphs.length;m++){
     const weight=a.mesh.morphTargetInfluences?.[m]??0;
     if(weight)at+=(morphs[m].getZ(i)-(a.mesh.geometry.morphTargetsRelative?0:points.getZ(i)))*weight;
    }
    z=Math.max(z,at);
   }
   a.body.position.z=-z;
   const withinStraight=r.distance>distance-track.straight;
   const wave=Math.sin(cycle/clip.duration*2*Math.PI);
   a.rider.position.y=a.jersey+wave*(withinStraight?.047:.026)*blend;
   a.rider.rotation.x=blend*(withinStraight?.12:.055)+wave*.055;
   a.arms[0].rotation.x=withinStraight?wave*.25:wave*.09;
   a.arms[1].rotation.x=withinStraight?wave*.25:-wave*.07;
   const whip=time>0&&distance-r.distance<200&&r.distance<distance&&Math.sin(time*3.4+a.phase*8)>.78;
   a.crop.visible=whip;
   if(whip)a.arms[1].rotation.x=-.88+wave*.42;
   a.shadow.position.copy(pos).addScaledVector(dir,-1.38);a.shadow.position.y+=.055;
   a.shadow.rotation.z=orientation(dir);
   const shadow=quality&&r.rank<3&&camera.position.distanceToSquared(pos)<18500;
   a.mesh.castShadow=shadow;
   a.shadow.visible=!shadow;
  }
 }
 function labelPositions(points:T.Vector3[]){
  for(let i=0;i<points.length;i++)mounts[i].root.localToWorld(points[i].set(0,2.87,-1.23));
 }
 return {animate,labelPositions,dispose(){for(const a of mounts){a.mix.stopAllAction();a.mix.uncacheRoot(a.mesh);}}};
}

export function makeGate(scene:T.Scene,track:Track,size:number){
 const slots=Math.max(12,Math.min(18,size)),width=slots*1.48;
 const root=new T.Group(),p=new T.Vector3(),t=new T.Vector3(),o=new T.Vector3();
 track.at(0,.75,p,t,o);root.position.copy(p);root.rotation.y=orientation(t);
 // Group local x is outward when facing positive z at left-handed tracks.
 const sign=-track.side;
 const greens=new T.MeshStandardMaterial({color:'#41635a',roughness:.77});
 const metal=new T.MeshStandardMaterial({color:'#b1c0ae',roughness:.68});
 const wheel=new T.MeshStandardMaterial({color:'#252827',roughness:1});
 const box=new T.BoxGeometry(1,1,1);
 function part(x:number,y:number,z:number,w:number,h:number,d:number,m:T.Material){
  const mesh=new T.Mesh(box,m);mesh.position.set(sign*x,y,z);mesh.scale.set(w,h,d);root.add(mesh);
 }
 part(width/2,2.75,-.91,width+.5,.21,2.35,greens);
 part(width/2,2.48,.34,width+.3,.13,.12,metal);
 const m=new T.Matrix4(),k=new T.Vector3(),q=new T.Quaternion();
 const beams=new T.InstancedMesh(box,metal,(slots+1)*3);
 for(let i=0;i<=slots;i++)for(let j=0;j<3;j++){
  m.makeScale(.071,j===2?.065:2.36,j===2?2.43:.086);
  m.setPosition(sign*i*1.48,j===2?1.14:1.2,j===0?.34:j===1?-2.01:-.84);
  beams.setMatrixAt(i*3+j,m);
 }
 root.add(beams);
 const doors=new T.InstancedMesh(box,greens,slots*2);
 doors.frustumCulled=false;root.add(doors);
 part(width+.98,1.14,-.82,2.1,1.1,2.64,greens);
 part(width+1.36,1.9,-1.34,1.24,.63,1.03,metal);
 const tires=new T.CylinderGeometry(.48,.48,.36,12).rotateZ(Math.PI/2);
 for(const dx of [-.86,.86])for(const z of [-1.82,.08]){
  const tire=new T.Mesh(tires,wheel);tire.position.set(sign*(width+1.12+dx),.47,z);root.add(tire);
 }
 scene.add(root);
 return (time:number)=>{
  root.visible=time<2.8;
  if(!root.visible)return;
  const angle=smooth(time/.38)*Math.PI*.47;
  for(let i=0;i<slots;i++)for(let j=0;j<2;j++){
   const hand=j?-1:1,start=(i+j)*1.48;
   q.setFromAxisAngle(up,angle*hand*sign);
   k.set(sign*(start+hand*.365*Math.cos(angle)),.91,.33-.365*Math.sin(angle));
   m.compose(k,q,new T.Vector3(.70,1.56,.065));doors.setMatrixAt(i*2+j,m);
  }
  doors.instanceMatrix.needsUpdate=true;
 };
}
