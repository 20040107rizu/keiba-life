'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, BarChart3, CalendarDays, ChevronRight, CircleHelp, Dna, Flag, GitBranch, House, MapPin, Plus, Minus, Shirt, SkipForward, Sparkles, Ticket as TicketIcon, Trophy, Users, Warehouse, Zap } from 'lucide-react';
import { STABLE_LIMIT, activeCount, advance, aptitudes, formatTime, isFoal, liveComment, liveOrder, available, cardFor, defaultPlan, drawHorse, eligible, forms, makeOdds, marketPrices, menus, nextRace, ordered, picks, raceKey, rarity, runRace, stats, styles, types, week, year, type Card, type Game, type Horse, type Result, type Silks } from '../lib/game';
import { races, type Race } from '../lib/races';
import { createLocalStorage as createLocalStorageBackend, gameStorage, setGameStorage } from '../lib/storage';
import { ageLabel, retiredLabel } from '../lib/breeding';
import { applyPrizes, withFriends, type SharedResult, type StableSnapshot } from '../lib/league';
import { claimPrizes, createLeague, createSyncedStorage, currentProfile, fetchFeed, fetchStables, joinLeague, leaveLeague, loadLeague, onlineConfigured, postResult, publishNow, signIn, signOut, type OnlineState, type Profile } from '../lib/online';
import { Grade, HorsePhoto, Meter, Silk, amount, grade, marker, runnerName } from './ui';
import { BreedPanel, LeagueView, PedigreeView, RankingView } from './screens';

const tabs=[['home','ホーム',House],['stable','厩舎',Warehouse],['races','レース',Trophy],['bet','馬券',TicketIcon],['rank','ランキング',BarChart3]] as const;
type View=typeof tabs[number][0]|'horse'|'training'|'silks'|'watch'|'result'|'pedigree'|'league';
type StableTab='own'|'market'|'breed';
const colors=['#1F6B3A','#C9A24B','#b62837','#22539e','#f7db52','#ffffff','#0B1F33'];
const colorNames=['グリーン','ゴールド','レッド','ブルー','イエロー','ホワイト','ネイビー'];
const patterns=['縦縞','たすき','山形','一文字','無地','星'];

export default function Page(){
 const [game,setGame]=useState<Game>();
 const [view,setView]=useState<View>('home');
 const [horseId,setHorseId]=useState('');
 const [raceChoice,setRaceChoice]=useState<Race>();
 const [ticketType,setTicketType]=useState(0);
 const [selected,setSelected]=useState<number[]>([]);
 const [stake,setStake]=useState(100);
 const [notice,setNotice]=useState('');
 const [result,setResult]=useState<Result>();
 const [frame,setFrame]=useState(0);
 const [silk,setSilk]=useState<Silks>();
 const [stableTab,setStableTab]=useState<StableTab>('own');
 const [online,setOnline]=useState<OnlineState>();
 const [friends,setFriends]=useState<StableSnapshot[]>([]);
 const [feed,setFeed]=useState<SharedResult[]>([]);
 const [busy,setBusy]=useState(false);
 const noticeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const lastSync=useRef(0);
 const gameRef=useRef<Game|undefined>(undefined);
 gameRef.current=game;
 // 起動：Firebase の設定があり、ログイン済みならクラウド同期つきで読み込む。なければ今までどおり端末に保存
 useEffect(()=>{void (async()=>{
  let profile:Profile|null=null;
  if(onlineConfigured){
   try{profile=await currentProfile();}catch{profile=null;}
   if(profile)setGameStorage(createSyncedStorage(profile.userId));
  }
  const loaded=await gameStorage.load();
  setGame(loaded);
  if(profile)await syncLeague(profile,loaded);
 })();},[]);
 useEffect(()=>{
  if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(()=>{});
 },[]);
 useEffect(()=>{
  if(view!=='watch')return;
  const timer=setInterval(()=>setFrame(v=>Math.min(v+1,36)),220);
  return ()=>clearInterval(timer);
 },[view]);
 const others=friends.filter(f=>f.userId!==online?.profile.userId);
 const buildCard=(g:Game,r:Race):Card=>withFriends(g,r,cardFor(g,r),online?.league?others:[]);
 const race=game?(raceChoice&&available(game).includes(raceChoice)?raceChoice:nextRace(game)):undefined;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const card=useMemo(()=>game&&race?buildCard(game,race):undefined,[game,race,friends,online?.league?.id]);
 const odds=useMemo(()=>card?makeOdds(card.entries,card.tickets):undefined,[card]);
 function notify(message:string){
  setNotice(message);
  clearTimeout(noticeTimer.current);
  noticeTimer.current=setTimeout(()=>setNotice(''),4200);
 }
 /** リーグ情報・友だちの厩舎・結果・届いた賞金を取りに行く */
 async function syncLeague(profile:Profile,base?:Game){
  lastSync.current=Date.now();
  try{
   const state=await loadLeague(profile);
   setOnline(state);
   if(!state.league){setFriends([]);setFeed([]);return;}
   const [stables,results,prizes]=await Promise.all([fetchStables(state.league.id),fetchFeed(state.league.id),claimPrizes()]);
   setFriends(stables);setFeed(results);
   const current=base??gameRef.current;
   if(current&&prizes.length){commit(applyPrizes(current,prizes));notify('友だちのレースで賞金 '+amount(prizes.reduce((s,p)=>s+p.prize,0))+' pt を獲得しました。');}
  }catch{notify('オンラインの情報を取得できませんでした。');}
 }
 // レース・馬券・リーグ画面を開いたら、友だちの最新の馬を取りに行く（20秒に1回まで）
 useEffect(()=>{
  if(!online?.league||!(view==='races'||view==='bet'||view==='league'||view==='rank'))return;
  if(Date.now()-lastSync.current<20000)return;
  void syncLeague(online.profile);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[view,online?.league?.id]);
 async function act(task:()=>Promise<void>,done?:string){
  setBusy(true);
  try{await task();if(done)notify(done);}catch(e){notify(e instanceof Error?e.message:'うまくいきませんでした。');}
  finally{setBusy(false);}
 }
 function commit(updated:Game){
  setGame(updated);
  void gameStorage.save(updated).catch(()=>notify('端末に保存できませんでした。'));
 }
 function go(target:View){
  setView(target);
  setSelected([]);
  window.scrollTo(0,0);
 }
 if(!game)return <main className="loading">競馬ライフを準備中…</main>;
 const state=game;
 const horse=state.horses.find(h=>h.id===horseId)??state.horses[0];
 const upcoming=nextRace(state);
 const plan=state.plans[horse.id]??defaultPlan;
 const fatigue=plan.reduce((v,i)=>Math.min(100,Math.max(0,v+menus[i].fatigue)),horse.fatigue);
 const targetRace=race;
 const activeTab=view==='horse'||view==='training'||view==='silks'||view==='pedigree'?'stable':view==='watch'||view==='result'?'races':view==='league'?'rank':view;
 const headers:Record<View,string>={home:'競馬ライフ',stable:'厩舎',horse:'馬の詳細',training:'トレーニング',races:'レース',bet:'馬券購入',watch:'レース観戦',result:'レース結果',silks:'勝負服デザイン',rank:'ランキング',pedigree:'血統表',league:'リーグ'};
 const back:Partial<Record<View,View>>={horse:'stable',training:'horse',silks:'stable',result:'races',pedigree:'horse',league:'rank'};
 const count=activeCount(state);
 function openHorse(h:Horse,target:View='horse'){setHorseId(h.id);go(target);}
 function openBet(r:Race){setRaceChoice(r);setTicketType(0);setStake(100);go('bet');}
 function moveTime(skip:boolean){
  const current=week(state.time);
  const today=available(state).filter(r=>r.week===current);
  if(today.some(r=>state.cards[raceKey(state.time,r)]?.tickets.length)){
   notify('購入済みの馬券があるため、レースを先に開催してください。');
   return;
  }
  if(skip&&today.length){go('races');return;}
  const next=races.find(r=>r.week>current);
  const count=skip?(next?next.week-current:52-current+races[0].week):1;
  commit(advance(state,count,horse.id));
  setRaceChoice(undefined);
  notify(count+'週進めました。トレーニング結果を更新しました。');
 }
 function acquire(candidate:Horse,price:number){
  if(count>=STABLE_LIMIT){notify('厩舎の上限は'+STABLE_LIMIT+'頭です（引退馬・繁殖馬は数えません）。');return;}
  if(state.points<price){notify('ポイントが足りません。');return;}
  commit({...state,points:state.points-price,horses:[...state.horses,candidate],market:state.market.filter(h=>h.id!==candidate.id)});
  notify(candidate.name+'（'+rarity[candidate.rarity]+'）が入厩しました。');
 }
 function register(r:Race,value:string){
  const key=raceKey(state.time,r);
  if(value&&!state.horses.some(h=>h.id===value&&eligible(h,r)))return;
  commit({...state,cards:{...state.cards,[key]:{registered:value||null,entries:[],tickets:[]}}});
  notify(value?'出走登録しました。':'出走登録を解除しました。');
 }
 function buy(){
  if(!targetRace||targetRace.week!==week(state.time)||!card||selected.length!==picks[ticketType]||stake>state.points)return;
  const registered=state.horses.find(h=>h.id===card.registered);
  if(registered&&!card.tickets.length&&!eligible(registered,targetRace)){
   notify('登録馬の状態が変わりました。レース一覧で出走登録を変更してください。');
   return;
  }
  const key=raceKey(state.time,targetRace);
  commit({...state,points:state.points-stake,spent:state.spent+stake,cards:{...state.cards,[key]:{...card,tickets:[...card.tickets,{type:ticketType,numbers:selected,stake}]}}});
  setSelected([]);
  notify(amount(stake)+' pt の馬券を購入しました。');
 }
 function start(r:Race){
  if(week(state.time)!==r.week)return;
  const entry=buildCard(state,r);
  const registered=state.horses.find(h=>h.id===entry.registered);
  if(registered&&!entry.tickets.length&&!eligible(registered,r)){
   notify('登録馬の状態が変わりました。出走登録を変更してください。');
   return;
  }
  const settled=runRace(state,r,entry);
  commit(settled.game);
  if(online?.league){
   // 結果・馬券・友だちの馬の賞金をリーグに共有し、自分の馬の最新状態もすぐ公開
   void postResult(settled.result).then(()=>publishNow(settled.game)).catch(()=>notify('レース結果をリーグに共有できませんでした。'));
  }
  setResult(settled.result);
  setFrame(0);
  go('watch');
 }
 function showResult(value:Result){setResult(value);go('result');}
 function horseRow(h:Horse,index:number){
  return <button className="horse-row" key={h.id} onClick={()=>openHorse(h)}>
   <HorsePhoto index={index}/><span className="horse-info"><strong>{h.name}</strong><small>{ageLabel(h)} {h.sex} <span className="sep">·</span> {h.retired?retiredLabel(h):isFoal(h)?'育成中':grade(h.level)}</small><span className="chip">{styles[h.style]}</span></span>
   <span className="condition"><span className={h.form>=3?'green':h.form<=1?'danger':'amber'}><Activity size={14}/>{isFoal(h)?'育成牧場':h.retired?'引退':h.injury?'休養中':forms[h.form]}</span><span className="fatigue"><span>疲労</span><Meter value={h.fatigue}/><b>{h.fatigue}%</b></span></span><ChevronRight size={16} className="row-chevron"/>
  </button>;
 }
 function raceCard(r:Race){
  const saved=state.cards[raceKey(state.time,r)];
  const today=r.week===week(state.time);
  const candidates=state.horses.filter(h=>eligible(h,r));
  return <article className="card schedule" key={r.title}>
   <div className="schedule-title"><div><small>第{r.week}週{today?' ・ 開催中':''}</small><h3>{r.title}</h3></div><Grade level={r.level}/></div>
   <p className="race-meta"><MapPin size={15}/>{r.venue} <span>·</span> {r.surface}{r.distance}m {r.age?' · '+r.age+'歳限定':''}</p>
   <label className="registration">出走登録<select aria-label={r.title+'の出走登録'} value={saved?.registered??''} disabled={!!saved?.tickets.length} onChange={e=>register(r,e.target.value)}><option value="">CPUのみ</option>{saved?.registered&&!candidates.some(h=>h.id===saved.registered)&&<option value={saved.registered}>{state.horses.find(h=>h.id===saved.registered)?.name}（出走条件外）</option>}{candidates.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
   {online?.league&&(()=>{const n=buildCard(state,r).entries.filter(e=>e.ownerId).length;return n?<small className="muted"><Users size={13}/> 友だちの馬 {n}頭が出走予定</small>:null;})()}
   {saved?.tickets.length?<small className="muted">馬券購入済み・出走表確定</small>:!candidates.length?<small className="muted">現在登録できる持ち馬はいません</small>:null}
   <div className="actions"><button className="button outline" onClick={()=>openBet(r)}><TicketIcon size={16}/>出馬表・馬券</button>{today&&<button className="button primary" onClick={()=>start(r)}><Flag size={16}/>レース開始</button>}</div>
  </article>;
 }
 const live=result?liveOrder(result,frame/36):undefined;
 return <div className="shell antialiased">
  <header className="top"><div className="top-inner">
   {back[view]?<button className="icon-button" aria-label="戻る" onClick={()=>go(back[view]!)}><ArrowLeft size={24}/></button>:<div className="crest" aria-hidden="true"><span>♞</span></div>}
   <div className="brand"><div>{headers[view]}</div><small>{view==='home'?'KEIBA LIFE':'第'+year(state.time)+'年 第'+week(state.time)+'週'}</small></div>
   <div className="points"><small>持ちポイント</small><strong>{amount(state.points)}<span> pt</span></strong></div>
  </div></header>
  <main className={'content '+(view==='watch'?'watch-content':'')}>
   {view==='home'&&<>
    <section className="hero">
     <div className="hero-copy"><div className="hero-kicker"><CalendarDays size={15}/> NEXT RACE <span>第{year(state.time)}年 第{week(state.time)}週</span></div>
      <h1>{upcoming?.title??'今シーズン終了'}</h1>
      {upcoming?<><div className="hero-meta"><Grade level={upcoming.level}/><span>{upcoming.venue} · {upcoming.surface}{upcoming.distance}m · 第{upcoming.week}週</span></div><div className="hero-bottom"><span>{week(state.time)===upcoming.week?'今週開催':'開催まで '+(upcoming.week-week(state.time))+'週'}</span><button onClick={()=>go('races')}>レース一覧 <ArrowRight size={16}/></button></div></>:<button className="button outline" onClick={()=>openHorse(horse,'training')}>次のシーズンへ</button>}
     </div>
    </section>
    <section className="owned">
     <div className="section-head"><div><Warehouse size={22} className="shrink-0"/><h2>所有馬</h2><span className="count">{count} / {STABLE_LIMIT}頭</span></div><button onClick={()=>go('stable')}>厩舎を見る <ChevronRight size={15}/></button></div>
     <div className="horse-list">{state.horses.slice(0,4).map(horseRow)}</div>
    </section>
    <div className="quick">
     <button onClick={()=>openHorse(state.horses.find(h=>!h.retired)??horse,'training')}><span className="quick-icon"><Zap size={22}/></span><span><strong>トレーニング</strong><small>今週のメニューを組む</small></span><ChevronRight size={16}/></button>
     <button onClick={()=>{setStableTab('market');go('stable');}}><span className="quick-icon gold-text"><Sparkles size={22}/></span><span><strong>セリ・ガチャ</strong><small>新しい馬を迎える</small></span><ChevronRight size={16}/></button>
     <button onClick={()=>{setStableTab('breed');go('stable');}}><span className="quick-icon gold-text"><Dna size={22}/></span><span><strong>配合</strong><small>{state.pregnancies.length?'受胎中 '+state.pregnancies.length+'頭':'仔馬をつくる'}</small></span><ChevronRight size={16}/></button>
     <button onClick={()=>go('league')}><span className="quick-icon"><Users size={22}/></span><span><strong>リーグ</strong><small>{online?.league?online.league.name:'友だちと対戦'}</small></span><ChevronRight size={16}/></button>
    </div>
   </>}
   {view==='stable'&&<>
    <div className="section-head"><div><Warehouse size={22}/><h1>厩舎</h1><span className="count">{count} / {STABLE_LIMIT}頭</span></div><button onClick={()=>{setSilk(state.silks);go('silks');}}><Shirt size={16}/> 勝負服</button></div>
    <div className="segmented three"><button className={stableTab==='own'?'active':''} onClick={()=>setStableTab('own')}>所有馬</button><button className={stableTab==='market'?'active':''} onClick={()=>setStableTab('market')}>セリ・ガチャ</button><button className={stableTab==='breed'?'active':''} onClick={()=>setStableTab('breed')}>配合</button></div>
    {stableTab==='breed'?<BreedPanel game={state} commit={commit} notify={notify}/>:stableTab==='market'?<><section className="card"><h2>セリ市場</h2><p className="muted">スピードと脚質を公開。出品馬は毎週入れ替わります。</p>{state.market.map(h=><div className="market-row" key={h.id}><div><strong>{h.name}</strong><small>{h.age}歳 {h.sex} · スピード {h.values[0]} · {styles[h.style]}</small></div><button className="button outline" onClick={()=>acquire(h,marketPrices[h.rarity])}>{amount(marketPrices[h.rarity])} pt</button></div>)}{!state.market.length&&<p>今週のセリは完売しました。</p>}</section><section className="card"><h2>新馬ガチャ</h2><p className="muted">R 60% · SR 30% · SSR 10%</p><button className="button primary" onClick={()=>acquire(drawHorse(),1500)}><Sparkles size={17}/>1頭引く · 1,500 pt</button></section></>:<div className="horse-list">{state.horses.map(horseRow)}</div>}
   </>}
   {view==='horse'&&<>
    <section className="horse-detail"><HorsePhoto index={state.horses.indexOf(horse)}/><div><Grade level={horse.level}/><h1>{horse.name}</h1><p>{ageLabel(horse)} {horse.sex} · {rarity[horse.rarity]} · {horse.wins}勝 {horse.retired?'· '+retiredLabel(horse):''}</p></div></section>
    {isFoal(horse)&&<section className="card"><h2><Sparkles size={19}/> 育成牧場で成長中</h2><p>デビューまであと <strong>{Math.max(0,(horse.foalUntil??0)-state.time)}週</strong>（{'第'+year(horse.foalUntil??0)+'年 第'+week(horse.foalUntil??0)+'週'}に入厩）。育成中は疲労・ケガなしで少しずつ能力が伸びます。</p></section>}
    <section className="card"><h2><Activity size={19}/> 能力値</h2>{stats.map((s,i)=><div className="stat" key={s}><b>{s}</b><Meter value={horse.values[i]} max={1200}/><strong>{horse.values[i]}</strong></div>)}</section>
    <section className="card"><h2>適性</h2><div className="apt">{aptitudes.map((a,i)=><div key={a}>{a}<b>{'GFEDCBAS'[horse.apt[i]]}</b></div>)}</div></section>
    <section className="card"><h2>脚質とコンディション</h2><div className="apt"><div>脚質<b>{styles[horse.style]}</b></div><div>調子<b>{forms[horse.form]}</b></div><div>疲労<b>{horse.fatigue}%</b></div><div>ケガ<b>{horse.injury?'残り'+horse.injury+'週':horse.recovery?'ケガ明け':'異常なし'}</b></div></div></section>
    <div className="actions"><button className="button outline" onClick={()=>go('pedigree')}><GitBranch size={18}/>血統表</button><button className="button primary" disabled={horse.retired||isFoal(horse)} onClick={()=>go('training')}><Zap size={18}/>トレーニング</button>{!horse.retired&&!isFoal(horse)&&<button className="button outline" disabled={Object.values(state.cards).some(c=>c.registered===horse.id&&c.tickets.length)} onClick={()=>{if(window.confirm(horse.name+'を引退させますか？'+(horse.sex==='牝'?'（繁殖牝馬になります）':horse.sex==='牡'?'（種牡馬になります）':''))){const cards=Object.fromEntries(Object.entries(state.cards).filter(([,c])=>c.registered!==horse.id));commit({...state,cards,horses:state.horses.map(h=>h.id===horse.id?{...h,retired:true}:h)});}}}>引退する</button>}</div>
   </>}
   {view==='training'&&<>
    <section className="card"><h1>週のトレーニング計画</h1><label className="registration">対象馬<select value={horse.id} onChange={e=>setHorseId(e.target.value)}>{state.horses.map(h=><option key={h.id} value={h.id}>{h.name}{h.retired?'（引退）':isFoal(h)?'（育成中）':''}</option>)}</select></label>
     {isFoal(horse)&&<p className="muted">育成牧場にいるため、メニューは組めません（週を進めると自動で成長します）。</p>}
     {horse.injury>0&&<p className="danger">ケガのためあと{horse.injury}週間は休養します。</p>}
     <div className="days">{['月','火','水','木','金','土','日'].map((d,i)=><label key={d}>{d}<select aria-label={d+'曜日のメニュー'} disabled={!!horse.injury||horse.retired||isFoal(horse)} value={plan[i]} onChange={e=>{const updated=[...plan];updated[i]=Number(e.target.value);commit({...state,plans:{...state.plans,[horse.id]:updated}});}}>{menus.map((m,n)=><option key={m.name} value={n}>{m.name}</option>)}</select></label>)}</div>
    </section>
    <section className="card"><h2>メニューと能力変動</h2><div className="menu-grid">{menus.map(m=><div key={m.name}><strong>{m.name}</strong><small>{m.gain.map((v,i)=>v?stats[i]+' +'+v:'').filter(Boolean).join('、')||'疲労とケガの回復'}</small><small>疲労 {m.fatigue>0?'+':''}{m.fatigue} / 負傷リスク {m.risk===0?'なし':m.risk>.01?'中':'低'}</small></div>)}</div></section>
    <div className="board fatigue-board">週末の予想疲労 <strong>{horse.retired||isFoal(horse)?horse.fatigue:horse.injury?Math.max(0,horse.fatigue-40):fatigue}%</strong></div>
    <div className="actions"><button className="button primary" onClick={()=>moveTime(false)}><ArrowRight size={19}/>1週進める</button><button className="button outline" onClick={()=>moveTime(true)}><SkipForward size={19}/>次のレースまでスキップ</button></div>
    <p className="muted">スキップ中は選択馬の計画を繰り返します。他の馬は2週目以降休養します。</p>
    {state.report.length>0&&<section className="card"><h2>トレーニング結果</h2>{state.report.map((line,i)=><p key={i}>{line}</p>)}</section>}
   </>}
   {view==='races'&&<>
    <div className="section-head"><div><Trophy size={22}/><h1>レース日程</h1></div><span className="count">第{year(state.time)}年</span></div>
    <div className="schedule-grid">{available(state).map(raceCard)}</div>
    {!available(state).length&&<section className="card"><p>今シーズンの開催は終了しました。</p><button className="button primary" onClick={()=>go('training')}>トレーニングへ</button></section>}
    {state.history.length>0&&<section className="card"><h2>レース結果履歴</h2>{state.history.map(r=><button className="history-row" key={r.key} onClick={()=>showResult(r)}><span>{r.race.title} <small>第{r.key.split('-')[0]}年 第{r.race.week}週</small></span><ChevronRight size={16}/></button>)}</section>}
   </>}
   {view==='bet'&&(targetRace&&card&&odds?<>
    <section className="card"><div className="schedule-title"><h1>{targetRace.title}</h1><Grade level={targetRace.level}/></div><p className="race-meta"><MapPin size={15}/>{targetRace.venue} · {targetRace.surface}{targetRace.distance}m · 第{targetRace.week}週</p><label className="registration">レース<select value={targetRace.title} onChange={e=>{setRaceChoice(available(state).find(r=>r.title===e.target.value));setSelected([]);}}>{available(state).map(r=><option key={r.title}>{r.title}</option>)}</select></label></section>
    <div className="bet-types">{types.map((type,i)=><button key={type} className={i===ticketType?'active':''} onClick={()=>{setTicketType(i);setSelected([]);}}>{type}</button>)}</div>
    <section className="card runners"><h2>出馬表</h2><p className="muted">{ticketType===2?'枠を':ordered(ticketType)?'着順どおりに馬を':'馬を'}{picks[ticketType]}つ選択</p>
     {card.entries.map(e=><button key={e.number} className={'runner '+(selected.includes(e.number)?'picked':'')} aria-pressed={selected.includes(e.number)} onClick={()=>setSelected(selected.includes(e.number)?selected.filter(n=>n!==e.number):selected.length<picks[ticketType]?[...selected,e.number]:picks[ticketType]===1?[e.number]:selected)}>
      {marker(e.number)}<span><strong>{runnerName(e)}</strong><small>{styles[e.horse.style]} · {forms[e.horse.form]}{e.horse.recovery?' · ケガ明け':''}</small></span><span className="board runner-odds">{odds(0,[e.number]).toFixed(1)}</span>
     </button>)}
    </section>
    <section className="card"><div className="schedule-title"><h2>購入金額</h2><div className="stepper"><button aria-label="100ポイント減らす" disabled={stake<=100} onClick={()=>setStake(stake-100)}><Minus size={18}/></button><strong>{amount(stake)} pt</strong><button aria-label="100ポイント増やす" disabled={stake+100>state.points} onClick={()=>setStake(stake+100)}><Plus size={18}/></button></div></div>
     <p className="selection">{types[ticketType]} {selected.join(ordered(ticketType)?' → ':' − ')||'未選択'} <span>{selected.length===picks[ticketType]?'参考オッズ '+odds(ticketType,selected,stake).toFixed(1)+'倍':'—'}</span></p>
     <button className="button gold-button" disabled={targetRace.week!==week(state.time)||selected.length!==picks[ticketType]||stake>state.points} onClick={buy}><TicketIcon size={18}/>馬券を買う</button>
     {targetRace.week!==week(state.time)&&<p className="muted">馬券の発売は開催週です。</p>}
     <p className="muted"><CircleHelp size={14}/> CPU票と購入票でオッズが変動します。複勝・ワイドの配当は他の的中組にもよります。</p>
    </section>
    {card.tickets.length>0&&<section className="card"><h2>購入済み馬券</h2>{card.tickets.map((t,i)=><p key={i}>{types[t.type]} {t.numbers.join(ordered(t.type)?' → ':' − ')} · {amount(t.stake)} pt</p>)}</section>}
    {targetRace.week===week(state.time)&&<button className="button primary" onClick={()=>start(targetRace)}><Flag size={18}/>レース開始</button>}
   </>:<section className="card"><h2>購入できるレースがありません</h2><button className="button primary" onClick={()=>go('training')}>次の週へ</button></section>)}
   {view==='watch'&&result&&live&&<>
    <div className="broadcast-title"><Grade level={result.race.level}/><h1>{result.race.title}</h1><p>{result.race.surface}{result.race.distance}m</p></div>
    <div className="live-ranks">{live.slice(0,4).map((item,i)=><div key={item.entry.number}><small>{i+1}位</small>{marker(item.entry.number)}<span>{item.entry.horse.name}{item.entry.owner?'（'+item.entry.owner+'）':''}</span></div>)}</div>
    <div className="track" aria-label="横から見たレース中継"><div className="rail"/><div className="finish-line"/>{live.map(({entry,progress})=><div className="runner-sprite" key={entry.number} style={{left:4+progress*84+'%',top:30+entry.number*18}}><span className="gallop">🏇</span>{entry.owned&&<span className="live-silk"><Silk silk={state.silks}/></span>}{marker(entry.number)}</div>)}</div>
    <div className="commentary" aria-live="polite">{liveComment(result,frame/36)}</div>
    <button className="button gold-button" onClick={()=>showResult(result)}><SkipForward size={18}/>{frame>=36?'結果と払戻を見る':'スキップして結果へ'}</button>
   </>}
   {view==='result'&&result&&<>
    <section className="card"><div className="schedule-title"><h1>{result.race.title}</h1><Grade level={result.race.level}/></div><h2>着順</h2>{result.order.map((e,i)=><div key={e.number} className="result-row"><b>{i+1}着</b>{marker(e.number)}<strong>{runnerName(e)}</strong><small>{formatTime(result.times[i]??0)}{result.margins[i]?' '+result.margins[i]:''}</small></div>)}</section>
    <section className="card"><h2>賞金と払戻</h2><p>厩舎賞金 <strong>{amount(result.prize)} pt</strong></p><p>馬券払戻 <strong>{amount(result.payouts.reduce((a,b)=>a+b,0))} pt</strong></p>{result.tickets.map((t,i)=><div className="result-row" key={i}><span>{types[t.type]} {t.numbers.join(ordered(t.type)?' → ':' − ')} · {amount(t.stake)} pt</span><strong>{result.payouts[i]?'払戻 '+amount(result.payouts[i])+' pt':'不的中'}</strong></div>)}</section>
    <div className="actions"><button className="button primary" onClick={()=>go('training')}>トレーニングへ</button><button className="button outline" onClick={()=>go('races')}>レース一覧</button></div>
   </>}
   {view==='silks'&&silk&&<>
    <div className="silk-preview"><Silk silk={silk}/></div>
    <section className="card"><h2>胴の柄</h2><div className="pattern-grid">{patterns.map((p,i)=><button key={p} className={silk.pattern===i?'active':''} aria-pressed={silk.pattern===i} onClick={()=>setSilk({...silk,pattern:i})}><Silk silk={{...silk,pattern:i}}/>{p}</button>)}</div></section>
    {([['body','胴の色'],['sleeve','袖の色'],['cap','帽子の色']] as const).map(([key,label])=><section className="card" key={key}><h2>{label}</h2><div className="swatches">{colors.map((color,i)=><button key={color} aria-pressed={silk[key]===color} onClick={()=>setSilk({...silk,[key]:color})}><span className={silk[key]===color?'chosen':''} style={{backgroundColor:color}}/>{colorNames[i]}</button>)}</div></section>)}
    <button className="button primary" onClick={()=>{commit({...state,silks:silk});notify('勝負服を保存しました。');}}><Shirt size={17}/>保存する</button>
   </>}
   {view==='rank'&&<>
    <div className="section-head"><div><BarChart3 size={22}/><h1>ランキング</h1></div><button onClick={()=>go('league')}><Users size={16}/> {online?.league?'リーグ':'友だちと対戦'}</button></div>
    <RankingView game={state} online={online} friends={friends} openLeague={()=>go('league')}/>
   </>}
   {view==='pedigree'&&<PedigreeView horse={horse}/>}
   {view==='league'&&<LeagueView configured={onlineConfigured} online={online} friends={friends} feed={feed} busy={busy} notify={notify}
    onSignIn={nick=>void act(async()=>{const profile=await signIn(nick);setGameStorage(createSyncedStorage(profile.userId));const loaded=await gameStorage.load();commit(loaded);await syncLeague(profile,loaded);},'ログインしました。')}
    onCreate={name=>void act(async()=>{if(!online)return;await createLeague(name);await publishNow(state);await syncLeague(online.profile);},'リーグを作りました。招待コードを友だちに送ってください。')}
    onJoin={code=>void act(async()=>{if(!online)return;await joinLeague(code);await publishNow(state);await syncLeague(online.profile);},'リーグに参加しました。')}
    onLeave={()=>void act(async()=>{if(!online)return;await leaveLeague();await syncLeague(online.profile);},'リーグを抜けました。')}
    onSignOut={()=>void act(async()=>{await signOut();setOnline(undefined);setFriends([]);setFeed([]);setGameStorage(createLocalStorageBackend());},'ログアウトしました。この端末ではひとり用で続けられます。')}
    onRefresh={()=>{if(online)void act(()=>syncLeague(online.profile));}}/>}
  </main>
  {notice&&<div className="toast" role="status">{notice}</div>}
  <nav className="bottom" aria-label="メインナビゲーション"><div>{tabs.map(([key,label,Icon])=><button key={key} className={activeTab===key?'current':''} aria-current={activeTab===key?'page':undefined} onClick={()=>{if(key==='stable')setStableTab('own');go(key);}}><Icon size={22} strokeWidth={2}/><span>{label}</span></button>)}</div></nav>
 </div>;
}
