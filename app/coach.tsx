'use client';

import { useEffect, useRef, useState } from 'react';

export type Tip = { target: string; text: string };

export function Coach({ tip, skip }: { tip: Tip; skip: () => void }) {
 const callout=useRef<HTMLDivElement>(null);
 const [box,setBox]=useState<DOMRect>();
 useEffect(()=>{
  const node=callout.current;
  try{if(node?.matches(':popover-open'))node.hidePopover();node?.showPopover?.();}catch{/* use the same fixed overlay on older browsers */}
  const target=document.querySelector<HTMLElement>(tip.target);
  const found=target?.getBoundingClientRect();
  if(found&&(found.top<80||found.bottom>innerHeight-140)&&target&&!target.closest('.dock')){
   target.scrollIntoView({block:'center'});
  }
  const update=()=>{
   const current=document.querySelector<HTMLElement>(tip.target)?.getBoundingClientRect();
   setBox(last=>last?.x===current?.x&&last?.y===current?.y&&last?.width===current?.width&&last?.height===current?.height?last:current);
  };
  update();
  const tick=window.setInterval(update,140);
  return ()=>{clearInterval(tick);};
 },[tip.target]);
 return <div ref={callout} popover="manual" className="coach-layer">
  {box&&box.width>0&&box.height>0&&<div className="coach-spot" style={{top:box.top-4,left:box.left-4,width:box.width+8,height:box.height+8}}/>}
  <div className={'coach-tip '+(box&&box.bottom>innerHeight*.55?'coach-top':'')} role="status">
   <p>{tip.text}</p><button className="button outline" onClick={skip}>スキップ</button>
  </div>
 </div>;
}
