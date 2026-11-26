import { useMemo } from 'react';
import { combo, makeOdds, ordered, types, winningCombos, type Result } from '../../lib/game';

const units=(n:number)=>n.toLocaleString('ja-JP')+'円';

export function RaceTickets({result,positions,started,finished,balance}:{
 result:Result;positions:number[];started:boolean;finished:boolean;balance:number;
}){
 const quotes=useMemo(()=>{
  if(!result.tickets.length)return [];
  // The tote model is seeded by draw order, while the stored result uses finish order.
  const field=[...result.order].sort((a,b)=>a.number-b.number);
  const odds=makeOdds(field,result.tickets);
  return result.tickets.map(t=>({min:odds(t.type,t.numbers),max:odds(t.type,t.numbers,0,undefined,'max')}));
 },[result]);
 const ranks=finished?result.order.map(entry=>entry.number):positions;
 return <aside className="watch-tickets" aria-label="自分の馬券">
  <div className="watch-ticket-heading"><strong>自分の馬券</strong><span>所持金 <b>{units(balance)}</b></span></div>
  {result.tickets.length?<div className="watch-ticket-scroll">{result.tickets.map((t,i)=>{
   const hit=started&&winningCombos(t.type,ranks,result.order.length).some(numbers=>combo(t.type,numbers)===combo(t.type,t.numbers));
   const paid=result.payouts[i]??0;
   const min=quotes[i]?.min??0,max=quotes[i]?.max??0;
   const span=(a:number,b:number,format:(n:number)=>string)=>a===b?format(a):format(a)+'〜'+format(b);
   return <div className="watch-ticket" data-hit={finished?paid>0:hit} key={i}>
    <strong>{types[t.type]} {t.numbers.join(ordered(t.type)?'→':'–')}{t.type===2?' 枠':''}</strong>
    <b>{finished?(paid>0?'的中確定':'不的中'):hit?'的中圏内':!started?'発走前':'圏外'}</b>
    <span>オッズ {span(min,max,n=>n.toFixed(1)+'倍')} · 購入 {units(t.stake)}</span>
    <span>{finished?'払戻 '+units(paid):'的中時の目安 '+span(Math.round(t.stake*min),Math.round(t.stake*max),units)}</span>
   </div>;
  })}</div>:<small>購入した馬券はありません。</small>}
 </aside>;
}
