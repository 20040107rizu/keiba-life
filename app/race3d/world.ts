import * as T from 'three';
import type { Result } from '../../lib/game';
import { canvasTexture, makeCourse, type Track } from './course';
import { horseMarkers } from './markers';
import { cameraDirector } from './director';
import { horseField, makeGate } from './field';
import { clamp, seedFrom, type Motion, type Place, type Shot } from './motion';

function sky(scene:T.Scene){
 const dome=new T.Mesh(new T.SphereGeometry(1220,14,9),new T.ShaderMaterial({
 side:T.BackSide,depthWrite:false,fog:false,
 vertexShader:'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 p;
 void main(){vec3 d=normalize(p);
 vec3 low=vec3(.80,.75,.61),high=vec3(.30,.48,.68);
 float h=smoothstep(-.05,.68,d.y);
 float sun=pow(max(dot(d,normalize(vec3(-.62,.24,.74))),0.),29.);
 gl_FragColor=vec4(mix(low,high,h)+vec3(.18,.095,.018)*sun,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
 }));
 scene.add(dome);
}
function dust(scene:T.Scene,count:number){
 const total=count*8,positions=new Float32Array(total*3);
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
 const tex=canvasTexture(48,ctx=>{
  const c=ctx.createRadialGradient(24,24,0,24,24,23);c.addColorStop(0,'#e4ca9bcb');c.addColorStop(1,'#e4ca9b00');
  ctx.fillStyle=c;ctx.fillRect(0,0,48,48);
 });
 const particles=new T.Points(g,new T.PointsMaterial({map:tex,size:.52,color:'#d3b395',transparent:true,opacity:.7,depthWrite:false}));
 particles.frustumCulled=false;scene.add(particles);
 const pos=new T.Vector3(),forward=new T.Vector3(),outer=new T.Vector3();
 const random=seedFrom('kickback'),scatter=Array.from({length:total},random);
 return (track:Track,places:Place[],time:number)=>{
  for(const runner of places)for(let j=0;j<8;j++){
   const i=runner.rank*8+j, phase=(Math.max(0,time)*(3+scatter[i]*2)+j*.142)%1;
   track.at(runner.distance-1.85-phase*(1.1+runner.speed*.19),runner.lane+(scatter[i]-.5)*phase*2,pos,forward,outer);
   pos.y+=runner.speed>3?Math.sin(phase*Math.PI)*(.26+scatter[i]*.51):-2;
   pos.toArray(positions,i*3);
  }
  g.getAttribute('position').needsUpdate=true;
 };
}
function disposeScene(scene:T.Scene){
 const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
 scene.traverse(object=>{
  const item=object as T.Mesh;
  if(item.geometry)geometries.add(item.geometry);
  const material=item.material;
  for(const m of Array.isArray(material)?material:material?[material]:[]){
   materials.add(m);
   for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);
  }
  if(object instanceof T.InstancedMesh)object.dispose();
 });
 for(const t of textures)t.dispose();
 for(const m of materials)m.dispose();
 for(const g of geometries)g.dispose();
}

export async function buildWorld(canvas:HTMLCanvasElement,wipe:HTMLCanvasElement,labelLayer:HTMLDivElement,result:Result,motion:Motion,fail:()=>void,signal:AbortSignal){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.17;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
 const scene=new T.Scene();
 scene.background=new T.Color('#bfc3ad');
 scene.fog=new T.Fog('#aeb4a4',300,920);sky(scene);
 scene.add(new T.HemisphereLight('#e3e6ec','#68724a',2.05));
 const light=new T.DirectionalLight('#ffe2ad',2.48);
 light.castShadow=true;light.shadow.mapSize.set(1024,1024);
 light.shadow.camera.left=-32;light.shadow.camera.right=32;
 light.shadow.camera.top=30;light.shadow.camera.bottom=-30;
 light.shadow.camera.near=.6;light.shadow.camera.far=140;
 light.shadow.bias=-.00025;light.shadow.normalBias=.035;
 scene.add(light,light.target);
 const pmrem=new T.PMREMGenerator(renderer);
 const env=new T.Scene();env.background=new T.Color('#a0a79a');
 const environment=pmrem.fromScene(env,0.16,0.5,20,{size:32});
 scene.environment=environment.texture;scene.environmentIntensity=.21;pmrem.dispose();
 const track=makeCourse(scene,result.race);
 const openGate=makeGate(scene,track,result.order.length);
 const spray=result.race.surface==='ダート'?dust(scene,result.order.length):undefined;
 const director=cameraDirector(track,motion);
 const labels=horseMarkers(labelLayer,result.order);
 let field:Awaited<ReturnType<typeof horseField>>|undefined;
 let binned=0,slow=0,level=0,w=0,h=0,drawCalls=0;
 const initialDpr=Math.min(window.devicePixelRatio||1,2);
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const glCaps=navigator as Navigator & {deviceMemory?:number;connection?:{saveData?:boolean}};
 const twoViews=(glCaps.deviceMemory??8)>3&&navigator.hardwareConcurrency>=4&&!glCaps.connection?.saveData;
 let previousShot:Shot|undefined;
 const previousMain=new T.PerspectiveCamera(),previousWide=new T.PerspectiveCamera();
 let previousSplit=false;
 let lost=false,disposed=false,restore:ReturnType<typeof setTimeout>|undefined;
 const anchor=new T.Vector3(),fwd=new T.Vector3(),side=new T.Vector3();
 const onLost=(event:Event)=>{event.preventDefault();lost=true;restore=setTimeout(fail,2500);};
 const onRestore=()=>{
  if(disposed)return;
  clearTimeout(restore);
  try{renderer.compile(scene,director.camera);lost=false;}catch{fail();}
 };
 canvas.addEventListener('webglcontextlost',onLost);
 canvas.addEventListener('webglcontextrestored',onRestore);
 function dispose(){
  if(disposed)return;
  disposed=true;clearTimeout(restore);
  canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestore);
  field?.dispose();disposeScene(scene);light.shadow.dispose();environment.dispose();renderer.dispose();
 }
 signal.addEventListener('abort',dispose,{once:true});
 try{
  field=await horseField(scene,result.order,result.key);
  if(signal.aborted){field.dispose();disposeScene(scene);throw new Error('Race initialization cancelled');}
 }catch(error){dispose();throw error;}
 function render(time:number,delta:number,still=false){
  if(lost||disposed||!field)return;
  if(delta>0&&delta<.16){
   binned++;
   if(delta>1/24)slow++;
   if(binned>=45){
    if(slow>23&&level<2){level++;w=0;}
    binned=0;slow=0;
   }
  }
  const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
  if(w!==width||h!==height){
   w=width;h=height;
   renderer.setPixelRatio(Math.min(initialDpr,[2,1.5,1.25][level]));
   renderer.setSize(w,h,false);renderer.shadowMap.enabled=level===0;
   canvas.dataset.quality=String(level);
  }
  const shot=still?(motion.close?'PHOTO':'S8'):motion.shot(time);
  const sample=still||shot==='PHOTO'?motion.winner:time;
  const places=motion.field(sample);
  const split=shot==='S4'&&level===0&&twoViews;
  const lower=split?Math.round(h*.75):h;
  const {camera,wide}=director.aim(places,shot,sample,w/lower,w/Math.max(1,h-lower));
  const gateTime=shot==='S2'||shot==='S3'?Math.max(0,sample):3;
  openGate(gateTime);canvas.dataset.gate=gateTime<2.8?'visible':'retired';
  spray?.(track,places,sample);
  const lead=places[0];
  if(lead){
   track.at(lead.distance,lead.lane,anchor,fwd,side);
   light.target.position.copy(anchor);
   light.position.copy(anchor).add(new T.Vector3(-42,28,53*track.side));
   light.target.updateMatrixWorld();
  }
  field.animate(track,places,sample,motion.distance,camera,level===0);
  function cameras(main:T.PerspectiveCamera,upper:T.PerspectiveCamera,band:boolean){
   const mainHeight=band?Math.round(h*.75):h;
   renderer.setScissorTest(band);
   renderer.setViewport(0,0,w,mainHeight);renderer.setScissor(0,0,w,mainHeight);
   renderer.render(scene,main);
   if(band){
    renderer.setViewport(0,mainHeight,w,h-mainHeight);renderer.setScissor(0,mainHeight,w,h-mainHeight);
    renderer.shadowMap.autoUpdate=false;renderer.render(scene,upper);renderer.shadowMap.autoUpdate=true;
   }
   renderer.setScissorTest(false);
  }
  if(previousShot==='S4'&&shot==='S5'&&!reduce&&level<2){
   cameras(previousMain,previousWide,previousSplit);
   wipe.width=w;wipe.height=h;
   wipe.getContext('2d')?.drawImage(canvas,0,0,w,h);
   wipe.style.animation='none';void wipe.offsetWidth;
   wipe.style.animation='race-3d-wipe .3s ease-out';
  }
  previousShot=shot;
  if(shot==='S4'){previousMain.copy(camera);previousWide.copy(wide);previousSplit=split;}
  renderer.info.reset();renderer.info.autoReset=false;
  cameras(camera,wide,split);
  drawCalls=renderer.info.render.calls;
  if(!labelLayer.hidden){
   field.labelPositions(labels.anchors);
   labels.paint(camera,w,h,h-lower);
  }
  canvas.dataset.split=split?'true':'false';
 }
 try{render(-2,0);renderer.compile(scene,director.camera);render(-2,0);}catch(error){dispose();throw error;}
 return {render,track,dispose,stats(){return {quality:level,drawCalls,ratio:renderer.getPixelRatio()};}};
}
export type World=Awaited<ReturnType<typeof buildWorld>>;
