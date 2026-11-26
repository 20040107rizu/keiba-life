'use client';
// 追加画面：配合・血統表・リーグ（友だち対戦）・ランキング
import { useState } from 'react';
import { BarChart3, Dna, RefreshCw, Ticket as TicketIcon, Trophy, Users } from 'lucide-react';
import { horseName, rarity, aptitudes, ordered, stats, styles, types, week, year, type Game, type Horse, type PedigreeNode } from '../lib/game';
import { BREEDING_SEASON, GESTATION_WEEKS, NURSERY_WEEKS, breed, breedingBlock, broodmares, inbreeding, inSeason, isPregnant, ownStallions, pedigreeOf, previewFoal, studFee, studs } from '../lib/breeding';
import { rankRows, rankingKinds, summarize, type Player } from '../lib/ranking';
import { leagueProgress } from '../lib/league';
import type { SharedResult, StableSnapshot } from '../lib/league';
import type { OnlineState } from '../lib/online';
import { Grade, Meter, amount, marker } from './ui';

const letter=(n:number)=>'GFEDCBAS'[n]??'—';
const when=(time:number)=>'第'+year(time)+'年 第'+week(time)+'週';

// ───────── 配合 ─────────
export function BreedPanel({game,reserved,commit,notify}:{game:Game;reserved:number;commit:(g:Game)=>void;notify:(m:string)=>void}){
 const mares=broodmares(game);
 const own=ownStallions(game);
 const [damId,setDamId]=useState('');
 const [sireId,setSireId]=useState('');
 const dam=mares.find(h=>h.id===damId)??mares.find(h=>!isPregnant(game,h.id))??mares[0];
 // 未選択のときは、危険な近親配合にならない種牡馬を選んでおく
 const sire=[...own,...studs].find(h=>h.id===sireId)??(dam&&studs.find(h=>inbreeding(h,dam).blood<0.3))??studs[0];
 const block=breedingBlock({...game,points:Math.max(0,game.points-reserved)},sire,dam);
 const preview=dam?previewFoal(sire,dam):undefined;
 const fee=studFee(sire.id);
 const season=inSeason(game.time);
 const ib=preview?.inbreeding;
 return <>
  <section className="card">
   <h2><Dna size={19}/> 配合</h2>
   <p className="muted">種付けシーズンは第{BREEDING_SEASON[0]}〜{BREEDING_SEASON[1]}週（今は第{week(game.time)}週・{season?'シーズン中':'シーズン外'}）。受胎から{GESTATION_WEEKS}週で翌春に誕生し、{NURSERY_WEEKS}週の育成を経てデビューします。</p>
   {mares.length?<>
    <label className="registration">繁殖牝馬<select aria-label="繁殖牝馬" value={dam?.id??''} onChange={e=>setDamId(e.target.value)}>{mares.map(h=><option key={h.id} value={h.id}>{h.name} [{rarity[h.rarity]}]（{h.age}歳{h.id.startsWith('broodmare-')?'・牧場':''}）{isPregnant(game,h.id)?'・受胎中':''}</option>)}</select></label>
    <label className="registration">種牡馬<select aria-label="種牡馬" value={sire.id} onChange={e=>setSireId(e.target.value)}>
     {own.length>0&&<optgroup label="自分の種牡馬（無料）">{own.map(h=><option key={h.id} value={h.id}>{h.name} [{rarity[h.rarity]}]</option>)}</optgroup>}
     <optgroup label="種牡馬（種付け料）">{studs.map(h=><option key={h.id} value={h.id}>{h.name} · {amount(studFee(h.id))}円</option>)}</optgroup>
    </select></label>
   </>:<p className="muted">繁殖牝馬がいません。引退した牝馬が繁殖牝馬になります（馬の詳細から「引退する」）。牡馬は引退すると自分の種牡馬になります。</p>}
  </section>
  {dam&&preview&&ib&&<section className="card">
   <div className="schedule-title"><h2>配合の見込み</h2><span className="grade gold">予想 {preview.rank}</span></div>
   <div className="pair"><div><small>父</small><strong>{sire.name}</strong><span className="chip">{styles[sire.style]}</span></div><span className="pair-x">×</span><div><small>母</small><strong>{dam.name}</strong><span className="chip">{styles[dam.style]}</span></div></div>
   <p className="muted">母父 {pedigreeOf(dam).sire.name}</p>
   <h3>成長限界の目安</h3>
   {stats.map((s,i)=><div className="stat" key={s}><b>{s}</b><Meter value={preview.potential[i]} max={1200}/><strong>{preview.potential[i]}</strong></div>)}
   <p className="muted">実際は ±{Math.round(preview.range/2)} 程度ぶれます。</p>
   <div className="apt">{aptitudes.map((a,i)=><div key={a}>{a}<b>{letter(preview.apt[i])}</b></div>)}</div>
   <div className={'cross-box '+(ib.blood>=0.3?'risk':ib.blood>0.2?'warn':ib.blood>0?'good':'')}>
    <strong>{ib.label?'インブリード：'+ib.label:'インブリードなし'}</strong><small>{ib.effect}</small>
   </div>
   <button className="button gold-button" disabled={!!block} onClick={()=>{
    if(ib.blood>=0.3&&!window.confirm('危険な近親配合です。本当に種付けしますか？'))return;
    try{commit(breed(game,sire,dam));notify(dam.name+'が'+sire.name+'の仔を受胎しました。');}catch(e){notify(e instanceof Error?e.message:'種付けできませんでした。');}
   }}><Dna size={17}/>種付けする{fee?' · '+amount(fee)+'円':''}</button>
   {block&&<p className="muted">{block}</p>}
  </section>}
  {(game.pregnancies??[]).length>0&&<section className="card"><h2>受胎中</h2>{game.pregnancies.map(p=><div className="market-row" key={p.id}><div><strong>{horseName(game,p.damId,p.damName)}</strong><small>父 {horseName(game,p.sireId,p.sireName)}</small></div><small className="muted">出産予定 {when(p.dueTime)}</small></div>)}</section>}
 </>;
}

// ───────── 血統表 ─────────
const ids=(n:PedigreeNode|undefined,out=new Set<string>())=>{if(n){out.add(n.id);ids(n.sire,out);ids(n.dam,out);}return out;};
export function PedigreeView({horse,game}:{horse:Horse;game:Game}){
 const p=pedigreeOf(horse);
 const a=ids(p.sire),b=ids(p.dam);
 const crossed=new Set([...a].filter(id=>b.has(id)));
 const cell=(n:PedigreeNode|undefined,label:string,row:number,span:number,col:number,side:'sire'|'dam')=>
  <div key={label+row} className={'ped-cell '+side+(n&&crossed.has(n.id)?' cross':'')} style={{gridRow:row+' / span '+span,gridColumn:col}}><small>{label}</small><strong>{n?horseName(game,n.id,n.name):'不明'}</strong></div>;
 const half=(n:PedigreeNode,side:'sire'|'dam',top:number,name:string)=>[
  cell(n,name,top,4,1,side),
  cell(n.sire,name+'の父',top,2,2,side),
  cell(n.dam,name+'の母',top+2,2,2,side),
  cell(n.sire?.sire,'',top,1,3,side),cell(n.sire?.dam,'',top+1,1,3,side),cell(n.dam?.sire,'',top+2,1,3,side),cell(n.dam?.dam,'',top+3,1,3,side),
 ];
 return <>
  <section className="card"><div className="schedule-title"><h1>{horse.name}</h1><span className="chip">{styles[horse.style]}</span></div>
   <p className="muted">血統表（父・母・祖父母・曾祖父母）。金色の名前は父方と母方の両方に出てくる祖先（インブリード）です。</p>
   <div className="pedigree">{half(p.sire,'sire',1,'父')}{half(p.dam,'dam',5,'母')}</div>
   <div className={'cross-box '+(horse.inbreed?'warn':'')}><strong>{horse.inbreed?'インブリード：'+horse.inbreed:crossed.size?'祖先に共通の馬がいます':'インブリードなし'}</strong>{horse.frailty!==undefined&&<small>体質：{horse.frailty>=1.4?'弱い（ケガしやすい）':horse.frailty>1.05?'やや弱い':'丈夫'}</small>}</div>
  </section>
 </>;
}

// ───────── リーグ（友だち対戦） ─────────
type LeagueProps={
 game:Game;
 configured:boolean; online?:OnlineState; friends:StableSnapshot[]; feed:SharedResult[]; busy:boolean;
 onRefresh:()=>void;
};
export function LeagueView(p:LeagueProps){
 const progress=leagueProgress(p.game);
 const profile=p.online?.profile;
 const league=p.online?.league;
 const members=p.friends;
 if(!p.configured)return <section className="card"><h2>共通リーグ</h2><p>Firebaseの設定後にオンラインで遊べます。</p></section>;
 if(!profile||!league)return <section className="card"><h2>共通リーグ</h2><p>設定から名前を登録すると接続します。</p></section>;
 const stableOf=(id:string)=>p.friends.find(f=>f.userId===id);
 return <>
  <section className="card">
   <div className="schedule-title"><h2><Users size={19}/> {league.name}</h2><button className="icon-text" disabled={p.busy} onClick={p.onRefresh}><RefreshCw size={15}/>更新</button></div>
   {!progress.eligible&&<p className="league-progress">あとレース{progress.remainingRaces}回{progress.remainingWeeks>0?'・あと'+progress.remainingWeeks+'週':''}でリーグに参加できます。</p>}
   <p className="muted">メンバーの出走条件に合う馬は、あなたのレースにも最新の状態で出走します。友だちの馬が5着以内に入ると、賞金は持ち主に届きます。</p>
  </section>
  <section className="card" id="league-members"><h2>メンバー（{members.length}人）</h2>{members.map(m=>{const s=stableOf(m.userId);return <div className="market-row" key={m.userId}><div><strong>{m.nickname}{m.userId===profile.userId?'（あなた）':''}</strong><small>{s?when(s.gameTime)+' · 現役 '+s.horses.length+'頭':'まだ厩舎が公開されていません'}</small></div>{s&&<small className="muted">賞金 {amount(s.summary.prize)}円</small>}</div>;})}</section>
  <section className="card"><h2><Trophy size={19}/> 友だちの出走馬</h2>{p.friends.filter(f=>f.userId!==profile.userId).flatMap(f=>f.horses.map(h=><div className="market-row" key={f.userId+h.id}><div><strong>{h.name}</strong><small>{f.nickname} · [{rarity[h.rarity]}] {h.age}歳 {h.sex} · {styles[h.style]} · {h.wins}勝</small></div><Grade level={h.level}/></div>))}{!p.friends.some(f=>f.userId!==profile.userId&&f.horses.length)&&<p className="muted">まだ友だちの馬がいません。</p>}</section>
  <section className="card"><h2><TicketIcon size={19}/> みんなのレース結果と馬券</h2>
   {p.feed.map(r=><div className="feed" id={'league-result-'+r.id} key={r.id}>
    <div className="schedule-title"><span><strong>{r.title}</strong> <small className="muted">{r.nickname}さんの開催</small></span><Grade level={r.level}/></div>
    <p className="muted">{r.venue} · {r.surface}{r.distance}m · 厩舎賞金 {amount(r.prize)}円</p>
    {r.order.slice(0,3).map((o,i)=><div className="result-row" key={i}><b>{i+1}着</b>{marker(o.number)}<span>{o.horseId?(o.ownerId||r.userId)!==profile.userId?(stableOf(o.ownerId??r.userId)?.names?.[o.horseId]??stableOf(o.ownerId??r.userId)?.horses.find(h=>h.id===o.horseId)?.name??o.name):horseName(p.game,o.horseId,o.name):o.name}{o.owner?'（'+o.owner+'）':''}</span></div>)}
    {r.tickets.map((t,i)=><p key={i} className="feed-ticket">{types[t.type]} {t.numbers.join(ordered(t.type)?' → ':' − ')} · {amount(t.stake)}円 <b className={t.payout?'green':''}>{t.payout?'払戻 '+amount(t.payout)+'円':'不的中'}</b></p>)}
   </div>)}
   {!p.feed.length&&<p className="muted">まだ結果がありません。レースを開催すると、ここに共有されます。</p>}
  </section>
 </>;
}

// ───────── ランキング ─────────
export function RankingView({game,online,friends,openLeague}:{game:Game;online?:OnlineState;friends:StableSnapshot[];openLeague:()=>void}){
 const [kind,setKind]=useState(0);
 const me=online?.profile.userId??'me';
 const inLeague=!!online?.league&&friends.length>0;
 const mine:Player={userId:me,nickname:online?.profile.nickname??'あなた',summary:summarize(game)};
 const players:Player[]=inLeague?friends.map(f=>f.userId===me?mine:{userId:f.userId,nickname:f.nickname,summary:f.summary}):[mine];
 const rows=rankRows(kind,players,me);
 return <>
  <section className="card"><h1>厩舎の成績</h1><p className="muted">{inLeague?online?.league?.name+'のランキング':'この端末のプレイ記録'}</p><div className="apt"><div>獲得賞金<b>{amount(game.prize)}円</b></div><div>G1勝利数<b>{mine.summary.g1}勝</b></div><div>馬券回収率<b>{game.spent?(game.returned/game.spent*100).toFixed(1)+'%':'—'}</b></div><div>最高払戻<b>{amount(mine.summary.bestPayout)}円</b></div></div></section>
  <div className="rank-tabs">{rankingKinds.map((k,i)=><button key={k} className={i===kind?'active':''} onClick={()=>setKind(i)}>{k}</button>)}</div>
  <section className="card"><h2><BarChart3 size={19}/> {rankingKinds[kind]}</h2>
   {rows.map((r,i)=><div className={'rank-row '+(r.me?'me':'')} key={r.key}><b className={i===0?'gold-text':''}>{i+1}</b><span><strong>{r.title}</strong>{r.sub&&<small>{r.sub}</small>}</span><span className="board rank-value">{r.value}</span></div>)}
   {!rows.length&&<p className="muted">{kind===5?'連勝中・急成長中の馬はいません。':'まだ記録がありません。'}</p>}
  </section>
  {!inLeague&&<button className="button outline" onClick={openLeague}><Users size={16}/>友だちとリーグで競う</button>}
 </>;
}
