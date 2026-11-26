'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, BarChart3, Bell, ChevronRight, CircleHelp, Dna, Flag, GitBranch, House, MapPin, Pencil, Shirt, SkipForward, Sparkles, Ticket as TicketIcon, Trophy, Users, Warehouse, Zap, Settings } from 'lucide-react';
import { HORSE_AGE_WEEKS, initialGame, horseName, registrationFee, activeCount, advance, aptitudes, formatTime, isFoal, available, cardFor, defaultPlan, drawHorse, eligible, forms, makeOdds, marketPrices, menus, nextRace, ordered, picks, raceKey, rarity, runRace, stats, styles, types, week, year, type Card, type Entry, type Game, type Horse, type Result, type Silks } from '../lib/game';
import { expansionPrice, formatYen, gachaPrice, MAX_STABLE_CAP } from '../lib/economy';
import { saleQuote, sellHorse } from '../lib/horse-sale';
import { jockeys, jockeyLock, jockeyName, jockeyOf } from '../lib/jockeys';
import { HorseRaceHistory, PrizeList, RunnerButton, RunnerSheet, Sheet, nameProblem } from './stable-updates';
import { registrationPreview } from '../lib/registration-preview';
import { races, type Race } from '../lib/races';
import { gameStorage, setGameStorage } from '../lib/storage';
import { ageLabel, retiredLabel } from '../lib/breeding';
import { applyPrizes, leagueProgress, withFriends, type SharedResult, type StableSnapshot } from '../lib/league';
import { claimPrizes, createSyncedStorage, currentProfile, fetchFeed, fetchStables, issueTransferCode, loadLeague, onlineConfigured, postResult, publishNow, publishStable, restoreTransfer, savedTransferCode, signIn, type OnlineState, type Profile } from '../lib/online';
import { Grade, RankBadge, HorsePhoto, Meter, Silk, amount, grade, marker, runnerName } from './ui';
import dynamic from 'next/dynamic';
import { prepareRaceAudio, type RaceAudioMode } from './race-voice-unlock';
import { ModelCredits } from './race-credits';
import { Gacha } from './gacha';
import { appearanceOf } from './horse-art';
import { phases, ticketHelp, AdvisorPortrait } from './guide';
import { Coach, type Tip } from './coach';
import { readDevice, writeDevice, useInbox, type Alert } from './inbox';
import { BreedPanel, LeagueView, PedigreeView, RankingView } from './screens';

const tabs=[['home','ホーム',House],['stable','厩舎',Warehouse],['races','レース',Trophy],['bet','馬券',TicketIcon],['rank','ランキング',BarChart3]] as const;
const RaceThree=dynamic(()=>import('./race3d/player'),{ssr:false,loading:()=> <section className="broadcast three-loading-shell" role="status">中継を準備中…</section>});
type View=typeof tabs[number][0]|'horse'|'training'|'silks'|'watch'|'result'|'pedigree'|'league'|'inbox'|'settings'|'credits';
type StableTab='own'|'market'|'breed'|'archive';
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
 const [stakeText,setStakeText]=useState('100');
 const stake=Number(stakeText||0);
 const [stableSort,setStableSort]=useState('rank');
 const [rename,setRename]=useState<string>();
 const [registration,setRegistration]=useState<{race:Race; horseId:string; jockeyId:string}>();
 const [runner,setRunner]=useState<Entry>();
 const [sale,setSale]=useState<Horse>();
 const [historyHorse,setHistoryHorse]=useState<Horse>();
 const [resultBack,setResultBack]=useState<View>('races');
 const [bulkPlan,setBulkPlan]=useState<number[]>();
 const [notice,setNotice]=useState('');
 const [gacha,setGacha]=useState<Horse[]>();
 const gachaPending=useRef(false);
 const [result,setResult]=useState<Result>();
 const [raceBalance,setRaceBalance]=useState(0);
 const [raceAudioDefault,setRaceAudioDefault]=useState(false);
 const [raceAudioMode,setRaceAudioMode]=useState<RaceAudioMode>('both');
 const [coach,setCoach]=useState(-1);
 const [nickname,setNickname]=useState('');
 const [nameDraft,setNameDraft]=useState('');
 const [transfer,setTransfer]=useState('');
 const [transferDraft,setTransferDraft]=useState('');
 const [restoring,setRestoring]=useState(false);
 const [accountError,setAccountError]=useState('');
 const [advisor,setAdvisor]=useState(true);
 const [showNumbers,setShowNumbers]=useState(true);
 const [trainingReviewed,setTrainingReviewed]=useState(0);
 const inbox=useInbox();
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
  setAdvisor(readDevice('advisor', true));
  setShowNumbers(readDevice('raceHorseNumbers', true));
  setRaceAudioDefault(readDevice('raceAudioDefault',false));
  setRaceAudioMode(readDevice<RaceAudioMode>('raceAudioMode','both'));
  setTrainingReviewed(readDevice('training', 0));
  let profile:Profile|null=null;
  if(onlineConfigured){
   try{profile=await currentProfile();}catch{profile=null;}
   if(profile)setGameStorage(createSyncedStorage(profile.userId));
  }
  const loaded=await gameStorage.load();
  setGame(loaded);
  const name=profile?.nickname??readDevice<string>('nickname','');
  setNickname(name);setNameDraft(name);
  if(name&&!loaded.tutorialDone)setCoach(0);
  if(profile){
   setTransfer(savedTransferCode(profile.userId));
   await publishStable(loaded).catch(()=>undefined);
   await syncLeague(profile,loaded);
  }
 })();},[]);
 useEffect(()=>{
  if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(()=>{});
 },[]);
 const others=friends.filter(f=>f.userId!==online?.profile.userId);
 const buildCard=(g:Game,r:Race):Card=>withFriends(g,r,cardFor(g,r),online?.league&&leagueProgress(g).eligible?others:[]);
 const race=game?(raceChoice&&available(game).includes(raceChoice)?raceChoice:nextRace(game)):undefined;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const card=useMemo(()=>game&&race?buildCard(game,race):undefined,[game,race,friends,online?.league?.id]);
 const odds=useMemo(()=>card?makeOdds(card.entries,card.tickets):undefined,[card]);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const forecast=useMemo(()=>{
  if(!game||!registration)return undefined;
  const {race,horseId,jockeyId}=registration;
  if(!game.horses.some(h=>h.id===horseId&&eligible(h,race)))return undefined;
  const key=raceKey(game.time,race);
  if(game.cards[key]?.tickets.length)return undefined;
  const draft={...game,cards:{...game.cards,[key]:{registered:horseId,jockeyId,entries:[],tickets:[]}}};
  return registrationPreview(race,buildCard(draft,race),key);
 },[game,registration,friends,online?.league?.id,online?.profile.userId]);

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
   const [stables,results]=await Promise.all([fetchStables(state.league.id),fetchFeed(state.league.id)]);
   const prizes=await claimPrizes();
   setFriends(stables);setFeed(results);
   const leagueId=state.league.id;
   const baselineKey='league:'+profile.userId+':'+leagueId;
   const baseline=readDevice<{members:string[];results:string[];latest:number}|null>(baselineKey,null);
   const members=stables.map(member=>member.userId);
   const alerts: Omit<Alert,'createdAt'>[]=[];
   if(baseline){
    for(const member of stables){
     if(member.userId!==profile.userId&&!baseline.members.includes(member.userId)){
      alerts.push({id:leagueId+':member:'+member.userId+':'+Date.now(),title:'リーグに新しいメンバー',detail:member.nickname+'さんが参加しました。',target:'league',anchor:'league-members'});
     }
    }
    for(const item of results){
     if(item.userId!==profile.userId&&!baseline.results.includes(item.id)&&item.createdAt>=baseline.latest){
      alerts.push({id:leagueId+':result:'+item.id,title:item.title+'の結果',detail:item.nickname+'さんがレースを開催しました。',target:'league',anchor:'league-result-'+item.id});
     }
    }
   }
   writeDevice(baselineKey,{members,results:results.map(item=>item.id),latest:Math.max(baseline?.latest??0,...results.map(item=>item.createdAt))});
   const current=gameRef.current??base;
   if(current&&prizes.length){
    commit(applyPrizes(current,prizes));
    alerts.unshift({id:leagueId+':prize:'+Date.now(),title:'リーグの賞金が届きました',detail:amount(prizes.reduce((sum,prize)=>sum+prize.prize,0))+'円 · '+prizes.map(prize=>prize.horseName).join('、'),target:'training',anchor:'training-report'});
   }
   if(inbox.add(alerts))notify(alerts[0].title+(alerts.length>1?' ほか '+(alerts.length-1)+'件':''));
  }catch{notify('オンラインの情報を取得できませんでした。');}
 }
 useEffect(()=>{
  if(!online?.league||busy)return;
  const refresh=()=>{
   if(document.visibilityState==='visible'&&Date.now()-lastSync.current>=20000)void syncLeague(online.profile);
  };
  refresh();
  const interval=window.setInterval(refresh,20000);
  document.addEventListener('visibilitychange',refresh);
  return ()=>{
   window.clearInterval(interval);
   document.removeEventListener('visibilitychange',refresh);
  };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[view,online?.profile.userId,online?.league?.id,busy]);
 async function act(task:()=>Promise<void>,done?:string){
  setBusy(true);
  try{await task();if(done)notify(done);}catch(e){notify(e instanceof Error?e.message:'うまくいきませんでした。');}
  finally{setBusy(false);}
 }
 function commit(updated:Game){
  gameRef.current=updated;
  setGame(updated);
  void gameStorage.save(updated).catch(()=>notify('端末に保存できませんでした。'));
 }
 function go(target:View){
  if(target!=='training')setBulkPlan(undefined);
  setView(target);
  if(coach===0&&target==='stable')setCoach(1);

  if(coach===8&&target==='bet')setCoach(9);
  if(coach===14&&target==='league')closeTutorial();
  setSelected([]);
  window.scrollTo(0,0);
 }
 async function saveNickname(){
  const name=nameDraft.trim();
  if(!name||!gameRef.current)return;
  setAccountError('');
  setBusy(true);
  try{
   if(onlineConfigured){
    const profile=await signIn(name);
    setGameStorage(createSyncedStorage(profile.userId,()=>notify('クラウドに同期できませんでした。')));
    const loaded=await gameStorage.load();
    commit(loaded);
    setTransfer(savedTransferCode(profile.userId));
    await publishNow(loaded);
    await syncLeague(profile,loaded);
   }
   writeDevice('nickname',name);setNickname(name);
   if(!gameRef.current?.tutorialDone)setCoach(0);
  }catch{setAccountError('名前を登録できませんでした。通信状態を確認してもう一度お試しください。');}
  finally{setBusy(false);}
 }
 function restoreAccount(){
  setBusy(true);setAccountError('');
  void (async()=>{
   try{
    const {profile,game:loaded}=await restoreTransfer(transferDraft);
    setGameStorage(createSyncedStorage(profile.userId,()=>notify('クラウドに同期できませんでした。')));
    setNickname(profile.nickname);setNameDraft(profile.nickname);writeDevice('nickname',profile.nickname);
    setTransfer(savedTransferCode(profile.userId));setTransferDraft('');setRestoring(false);
    setCoach(-1);setGame(loaded);gameRef.current=loaded;
    setFriends([]);setFeed([]);go('home');await syncLeague(profile,loaded);
   }catch{setAccountError('引き継げませんでした。コードと通信状態を確認してください。');}
   finally{setBusy(false);}
  })();
 }
 function startCoach(){go('home');setCoach(0);}
 if(!game)return <main className="loading">競馬ライフを準備中…</main>;
 const accountForm=<form className="account-form" onSubmit={e=>{e.preventDefault();void saveNickname();}}>
  <label className="field">あなたの名前（ニックネーム）<input autoComplete="nickname" maxLength={20} value={nameDraft} onChange={e=>setNameDraft(e.target.value)}/></label>
  <button className="button primary" disabled={busy||!nameDraft.trim()}>{nickname?'名前を保存':'この名前ではじめる'}</button>
 </form>;
 const restoreForm=<form className="account-form" onSubmit={e=>{e.preventDefault();restoreAccount();}}>
  <label className="field">引き継ぎコード<input autoCapitalize="none" autoComplete="off" spellCheck={false} value={transferDraft} onChange={e=>setTransferDraft(e.target.value)}/></label>
  <button className="button primary" disabled={busy||!transferDraft.trim()}>セーブを引き継ぐ</button>
  <button type="button" className="text-button" onClick={()=>{setRestoring(false);setAccountError('');}}>戻る</button>
 </form>;
 if(!nickname)return <main className="first-run"><h1>競馬ライフ</h1><p>リーグで使う名前を登録しましょう。</p>{restoring?restoreForm:accountForm}
  {onlineConfigured&&!restoring&&<button className="button outline" onClick={()=>setRestoring(true)}>引き継ぎコードを使う</button>}
  {accountError&&<p className="danger" role="alert">{accountError}</p>}
 </main>;
 const state=game;
 const horse=state.horses.find(h=>h.id===horseId)??state.horses[0]??state.soldHorses.at(-1)?.horse??initialGame().horses[0];
 const upcoming=nextRace(state);
 const individualPlan=state.plans[horse.id]??defaultPlan;
 const plan=bulkPlan??individualPlan;
 const trainingHorses=state.horses.filter(h=>!h.retired&&!isFoal(h));
 function applyBulkPlan(){
  const current=gameRef.current??state;
  if(!bulkPlan)return;
  const targets=current.horses.filter(h=>!h.retired&&!isFoal(h));
  if(!targets.length)return;
  commit({...current,plans:{...current.plans,...Object.fromEntries(targets.map(h=>[h.id,[...bulkPlan]]))}});
  setBulkPlan(undefined);
  notify(targets.length+'頭に週間メニューを適用しました。');
 }
 const fatigue=plan.reduce((v,i)=>Math.min(100,Math.max(0,v+menus[i].fatigue)),horse.fatigue);
 const targetRace=race;
 const ridingFees=Object.values(state.cards).reduce((total,c)=>total+(c.registered?jockeyOf(c.jockeyId).fee:0),0);
 const betFunds=Math.max(0,state.points-ridingFees);
 const stakeError=!Number.isSafeInteger(stake)||stake>betFunds
  ? (ridingFees?'騎乗料を差し引いた購入可能額を超えています。':'所持金を超えています。')
  : stake<100?'100円以上を入力してください。':stake%100?'100円単位で入力してください。':'';
 const setStake=(value:number)=>setStakeText(String(value));
 const sortedHorses=[...state.horses].sort((a,b)=>stableSort==='name'?a.name.localeCompare(b.name,'ja'):stableSort==='age'?a.age-b.age:b.rarity-a.rarity);
 function currentName(e:Entry){
  if(e.owned)return runnerName({...e,horse:{...e.horse,name:horseName(state,e.horse.id,e.horse.name)}});
  if(!e.ownerId)return runnerName(e);
  const name=friends.find(f=>f.userId===e.ownerId)?.horses.find(h=>h.id===e.horse.id.split(':').slice(2).join(':'))?.name;
  return name?runnerName({...e,horse:{...e.horse,name}}):runnerName(e);
 }
 const activeTab=view==='horse'||view==='training'||view==='silks'||view==='pedigree'?'stable':view==='watch'||view==='result'?'races':view==='league'?'rank':view;
 const headers:Record<View,string>={home:'競馬ライフ',stable:'厩舎',horse:'馬の詳細',training:'トレーニング',races:'レース',bet:'馬券購入',watch:'レース観戦',result:'レース結果',silks:'勝負服デザイン',rank:'ランキング',pedigree:'血統表',league:'リーグ',inbox:'通知',settings:'設定',credits:'クレジット'};
 const back:Partial<Record<View,View>>={horse:'stable',training:'horse',silks:'stable',result:resultBack,pedigree:'horse',league:'rank',inbox:'home',credits:'settings',settings:'home'};
 const count=activeCount(state);
 const schedule=available(state);
 const today=schedule.filter(item=>item.week===week(state.time));
 const locked=today.find(item=>state.cards[raceKey(state.time,item)]?.tickets.length);
 const currentRace=locked??today[0];
 const currentCard=currentRace?state.cards[raceKey(state.time,currentRace)]:undefined;
 const recentlyRan=state.history[0]?.key.startsWith(year(state.time)+'-'+week(state.time)+'-');
 const trainingHorse=state.horses.find(h=>!h.retired&&!isFoal(h))??horse;
 const readyToAdvance=trainingReviewed===state.time||recentlyRan;
 const phase=currentRace?(currentCard?.tickets.length?3:currentCard?.registered||!state.horses.some(h=>eligible(h,currentRace))?2:1):readyToAdvance?4:0;
 const advice=[
  {title:'トレーニングを確認しよう', detail:'曜日ごとのメニューを決めましょう。調教は週を進めると実施されます。', label:'トレーニングへ', action:()=>openHorse(trainingHorse,'training')},
  {title:'出走する馬を決めよう', detail:(currentRace?.title??'')+'に愛馬を登録できます。CPUだけのレースも観戦できます。', label:'出走登録へ', action:()=>go('races')},
  {title:'馬券を買ってみよう', detail:(currentRace?.title??'')+'の馬券を発売中です。馬券を買わずに観戦することもできます。', label:'出馬表・馬券へ', action:()=>currentRace&&openBet(currentRace)},
  {title:'レースを観戦しよう', detail:(currentRace?.title??'')+'の購入済み馬券は、ゴール後に精算されます。', label:'レースを開始', action:()=>currentRace&&start(currentRace)},
  {title:'次の週へ進もう', detail:'設定したトレーニングを実施して、開催日程を1週進めます。', label:'次の週へ進む', action:()=>moveTime(false)},
 ][phase];
 const advisorVisible=advisor&&['home','training','races','bet'].includes(view);
 const advisorAction=view==='training'
  ?{title:'メニューを決めたら、今週の計画を確認しましょう。',label:'計画へ',action:()=>document.getElementById('training-plan')?.scrollIntoView()}
  :view==='bet'
   ?{title:targetRace?.week===week(state.time)?'馬券を選んだら、購入内容を確認しましょう。':'開催週に馬券を買えます。今は出馬表を確認しましょう。',label:'出馬表へ',action:()=>document.querySelector('.runners')?.scrollIntoView()}
   :view==='races'&&phase===1
     ?{...advice,label:'登録欄へ',action:()=>document.getElementById('race-registration')?.focus()}
     :advice;
 const unread=inbox.items.filter(item=>!item.read).length;
 function closeTutorial(){if(gameRef.current&&!gameRef.current.tutorialDone)commit({...gameRef.current,tutorialDone:true});setCoach(-1);}
 function openAlert(item:Alert){
  inbox.markRead(item.id);
  const historical=state.history.find(r=>r.key===item.anchor);
  if(item.target==='result'){if(historical)showResult(historical);else go('races');return;}
  go(item.target);
  if(item.anchor)requestAnimationFrame(()=>document.getElementById(item.anchor!)?.scrollIntoView({block:'start'}));
 }
 function openHorse(h:Horse,target:View='horse'){setHorseId(h.id);go(target);}
 function openBet(r:Race){setRaceChoice(r);setTicketType(0);setStakeText('100');go('bet');}
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
  const updated=advance(state,count,horse.id);
  commit(updated);
  if(online?.profile&&leagueProgress(updated).eligible&&!leagueProgress(state).eligible){
   void publishStable(updated).then(()=>syncLeague(online.profile,updated)).catch(()=>notify('リーグに公開できませんでした。'));
  }
  if(coach===4){
   const nextRace=available(updated).find(r=>r.week===week(updated.time));
   if(nextRace){setCoach(updated.horses.some(h=>eligible(h,nextRace))?5:8);go('races');}
  }
  if(coach===13){setCoach(14);go('home');}
  setRaceChoice(undefined);
  notify(count+'週進めました。'+updated.report[0]);
 }
 function acquire(candidate:Horse,price:number){
  if(count+(state.pregnancies??[]).length>=state.stableCap){notify('厩舎の上限は'+state.stableCap+'頭です（引退馬・繁殖馬は数えません）。');return;}
  if(state.points-ridingFees<price){notify('所持金が足りません。');return;}
  commit({...state,points:state.points-price,horses:[...state.horses,{...candidate,purchasePrice:price,ageDue:state.time+HORSE_AGE_WEEKS}],market:state.market.filter(h=>h.id!==candidate.id)});
  notify(candidate.name+'（'+rarity[candidate.rarity]+'）が入厩しました。');
 }
 function draw(countToDraw:number){
  if(gachaPending.current)return;
  const current=gameRef.current??state;
  const price=gachaPrice(countToDraw);
  if(activeCount(current)+(current.pregnancies??[]).length+countToDraw>current.stableCap){notify('厩舎に'+countToDraw+'頭分の空きが必要です。');return;}
  if(current.points-ridingFees<price){notify('所持金が足りません。');return;}
  const horses=Array.from({length:countToDraw},()=>({...drawHorse(),purchasePrice:price/countToDraw,ageDue:current.time+HORSE_AGE_WEEKS}));
  gachaPending.current=true;
  commit({...current,points:current.points-price,horses:[...current.horses,...horses]});
  setGacha(horses);
 }
 function register(r:Race,value:string,jockeyId='apprentice'){
  const key=raceKey(state.time,r);
  const old=state.cards[key];
  if(old?.tickets.length)return;
  if(value&&(!state.horses.some(h=>h.id===value&&eligible(h,r))||jockeyLock(state,jockeyId)))return;
  const fee=value&&!old?.registrationFee?registrationFee(r):0;
  const otherFees=ridingFees-(old?.registered?jockeyOf(old.jockeyId).fee:0);
  if(value&&state.points<fee+otherFees+jockeyOf(jockeyId).fee){notify('登録料と騎乗料に必要な所持金が足りません。');return;}
  const cards={...state.cards};
  if(value)cards[key]={registered:value,jockeyId,registrationFee:old?.registrationFee||fee,entries:[],tickets:[]};
  else delete cards[key];
  commit({...state,points:state.points-fee,cards});
  setRegistration(undefined);
  if((coach===6||coach===7)&&value)setCoach(8);
  notify(value?'出走登録しました。'+(fee?' 登録料 '+formatYen(fee):''):'出走登録を解除しました。');
 }
 function buy(){
  if(!targetRace||targetRace.week!==week(state.time)||!card||selected.length!==picks[ticketType]||stakeError)return;
  const registered=state.horses.find(h=>h.id===card.registered);
  if(registered&&!card.tickets.length&&!eligible(registered,targetRace)){
   notify('登録馬の状態が変わりました。レース一覧で出走登録を変更してください。');
   return;
  }
  const key=raceKey(state.time,targetRace);
  commit({...state,points:state.points-stake,spent:state.spent+stake,cards:{...state.cards,[key]:{...card,tickets:[...card.tickets,{type:ticketType,numbers:selected,stake}]}}});
  setSelected([]);
  if(coach===9||coach===10)setCoach(11);
  notify(amount(stake)+'円 の馬券を購入しました。');
 }
 function start(r:Race){
  if(week(state.time)!==r.week)return;
  const entry=buildCard(state,r);
  const registered=state.horses.find(h=>h.id===entry.registered);
  if(registered&&!entry.tickets.length&&!eligible(registered,r)){
   notify('登録馬の状態が変わりました。出走登録を変更してください。');
   return;
  }
  if(state.points<entry.entries.filter(e=>e.owned).reduce((total,e)=>total+jockeyOf(e.jockeyId).fee,0)){
   notify('騎乗料に必要な所持金が足りません。出走登録で騎手を変更してください。');return;
  }
  prepareRaceAudio(raceAudioMode,raceAudioDefault);
  setRaceBalance(state.points);
  const settled=runRace(state,r,entry);
  commit(settled.game);
  if(coach>=9&&coach<=11)setCoach(12);
  if(online?.league&&leagueProgress(settled.game).eligible){
   // 結果・馬券・友だちの馬の賞金をリーグに共有し、自分の馬の最新状態もすぐ公開
   void publishNow(settled.game).then(()=>postResult(settled.result)).then(()=>syncLeague(online.profile,settled.game)).catch(()=>notify('レース結果をリーグに共有できませんでした。'));
  }
  setResult(settled.result);
  const alerts: Omit<Alert,'createdAt'>[]=[{id:'result:'+settled.result.key,title:r.title+'の結果が出ました',detail:'着順・タイム・払戻を確認できます。',target:'result',anchor:settled.result.key}];
  if(entry.tickets.length&&!today.some(other=>other!==r&&state.cards[raceKey(state.time,other)]?.tickets.length)){
   alerts.push({id:'week:'+state.time,title:'次の週へ進めるようになりました',detail:'購入済みの馬券をすべて精算しました。',target:'home'});
  }
  inbox.add(alerts);
  clearTimeout(noticeTimer.current);
  setNotice('');
  go('watch');
 }
 function showResult(value:Result,origin:View='races'){setResultBack(origin);setResult(value);go('result');}
 function horseRow(h:Horse){
  return <button className="horse-row" key={h.id} onClick={()=>{openHorse(h);if(coach===1)setCoach(2);}}>
   <HorsePhoto horse={h}/><span className="horse-info"><strong>{h.name} <RankBadge horse={h}/></strong><small>{ageLabel(h)} {h.sex} <span className="sep">·</span> {h.retired?retiredLabel(h):isFoal(h)?'育成中':grade(h.level)}</small><span className="chip">{styles[h.style]}</span></span>
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
   <PrizeList race={r}/>
   <div className="actions"><button className="button outline" data-coach={today&&r===currentRace?'register':undefined} disabled={!!saved?.tickets.length||!candidates.length} onClick={()=>{setRegistration({race:r,horseId:saved?.registered??candidates[0]?.id??'',jockeyId:saved?.jockeyId??'apprentice'});if(coach===5)setCoach(7);}}>{saved?.registered?'出走登録を変更':'出走登録'}</button>
   {saved?.registered&&!saved.tickets.length&&<button className="text-button" onClick={()=>register(r,'')}>登録解除</button>}</div>
   <small>{saved?.registered?horseName(state,saved.registered,'登録馬')+' · '+jockeyOf(saved.jockeyId).name:'登録料 '+formatYen(registrationFee(r))}</small>
   {online?.league&&(()=>{const n=buildCard(state,r).entries.filter(e=>e.ownerId).length;return n?<small className="muted"><Users size={13}/> 友だちの馬 {n}頭が出走予定</small>:null;})()}
   {saved?.tickets.length?<small className="muted">馬券購入済み・出走表確定</small>:!candidates.length?<small className="muted">現在登録できる持ち馬はいません</small>:null}
   <div className="actions"><button className="button outline" data-coach={today&&r===currentRace?'card':undefined} onClick={()=>{openBet(r);if(coach===8)setCoach(9);}}><TicketIcon size={16}/>{today?'出馬表・馬券':'出馬表を見る'}</button>{today&&<button className="button primary" onClick={()=>start(r)}><Flag size={16}/>レース開始</button>}</div>
  </article>;
 }

 const tips: Record<number,Tip>={
  0:!state.history.length&&upcoming?{target:'[data-coach=first-race]',text:'最初のレースを見てみましょう。愛馬を見るなら厩舎を開きます。'}:{target:'[data-coach-nav=stable]',text:'厩舎を開いて、持ち馬を見てみましょう。'},
  1:{target:'.horse-list .horse-row',text:'馬のカードを押すと能力や適性を確認できます。馬詳細から売却もできます。'},
  2:{target:'[data-coach=train]',text:'トレーニングを開き、曜日ごとの調教を確認しましょう。'},
  3:{target:'[data-coach=review]',text:'調教を確認してホームに戻りましょう。'},
  4:{target:'[data-coach=week]',text:'開催週まで週を進めます。調教が実施され、預託料が引かれます。'},
  5:{target:'[data-coach=register]',text:'開催中のレースに愛馬を出走登録しましょう。'},
  6:{target:'[data-coach=confirm]',text:'騎手を選んだら、登録を確定します。'},
  7:{target:'[data-coach=jockey]',text:'騎手を選んでください。菅原明良は最初から選べます。'},
  8:{target:'[data-coach=card]',text:'出馬表で馬と騎手を見てみましょう。'},
  9:{target:'.runner-identity',text:'馬名を長押しすると、状態や過去成績が開きます。'},
  10:{target:runner?'dialog[open] header button':selected.length?'#ticket-order input':'.runner-identity',text:runner?'成績を見たら閉じましょう。':selected.length?'購入額を100円単位で入力し、馬券を買いましょう。':'今回は単勝。1着を予想して馬をタップしましょう。'},
  11:{target:'[data-coach=start-race]',text:'レース開始を押して中継を見ましょう。'},
  12:{target:'.broadcast-controls,.broadcast-actions',text:'中継を見届けましょう。「結果へ」で着順に進めます。'},
  13:{target:'[data-coach=week]',text:'結果と賞金を確認したら、次の週へ進みましょう。'},
  14:{target:'[data-coach=league]',text:'共通リーグを開くと、参加までの条件を確認できます。'},
 };
 const tip=tips[coach];
 const showTicketDock=view==='bet'&&!!targetRace&&!!card&&!!odds;
 const canRace=targetRace?.week===week(state.time);
 const completePick=selected.length===picks[ticketType];
 const canBuy=canRace&&completePick&&!stakeError;
 const estimate=canBuy&&odds?odds(ticketType,selected,stake):0;
 const showFirstRace=view==='home'&&!state.history.length&&!!upcoming&&coach<=0;
 function openFirstRace(){
  if(!upcoming)return;
  const weeks=upcoming.week-week(state.time);
  if(weeks>0){
   if(locked||!window.confirm('第'+upcoming.week+'週まで進み、調教と預託料を反映しますか？'))return;
   commit(advance(state,weeks,horse.id));
  }
  openBet(upcoming);
  if(coach===0)setCoach(9);
 }

 return <div className={'shell antialiased'+(advisorVisible?' guided':'')+(view==='watch'?' watching':'')+(view==='result'?' results-layout':'')+(showTicketDock?' betting-layout':'')}>
  <header className="top"><div className="top-inner">
   {back[view]?<button className="icon-button" aria-label="戻る" onClick={()=>go(back[view]!)}><ArrowLeft size={24}/></button>:<div className="crest" aria-hidden="true"><Flag size={21}/></div>}
   <div className="brand"><div>{headers[view]}</div><small>{view==='home'?'KEIBA LIFE':'シーズン'+year(state.time)+' · 第'+week(state.time)+'週'}</small></div>
   <div className="header-tools">
    <button className="header-icon" aria-label={unread?'通知（未読'+unread+'件）':'通知'} onClick={()=>go('inbox')}><Bell size={19}/>{unread>0&&<b>{unread>99?'99+':unread}</b>}</button>
    <button className="header-icon" aria-label="設定" onClick={()=>go('settings')}><Settings size={18}/></button>
   </div>
   <div className="points"><small>所持金</small><strong title={formatYen(state.points)}>{formatYen(state.points,true)}</strong></div>
  </div></header>
  <main className={'content '+(view==='watch'?'watch-content':view==='result'?'result-content':'')}>
   {view==='home'&&<>
    <section className="hero">
     <div className="hero-copy">
      <p className="hero-kicker">シーズン{year(state.time)}（{year(state.time)}年目） 第{week(state.time)}週</p>
      <h1>今週やること</h1>
      <h2>{advice.title}</h2>
      <p className="hero-detail">{advice.detail}</p>
      <button className="button gold-button" data-coach={showFirstRace?'first-race':undefined} onClick={showFirstRace?openFirstRace:advice.action}>{showFirstRace?'最初のレースへ':advice.label}<ArrowRight size={18}/></button>
     </div>
    </section>
    <ol className="weekly-steps" aria-label="今週の流れ">{phases.map((label,index)=><li key={label} aria-current={index===phase?'step':undefined}><span>{index+1}</span>{label}</li>)}</ol>
    {upcoming&&<button className="race-preview" onClick={()=>go('races')}><Flag size={20}/><span><small>{upcoming.week===week(state.time)?'今週開催':'第'+upcoming.week+'週 開催'} · {upcoming.venue} · {upcoming.surface}{upcoming.distance}m</small><strong>{upcoming.title}</strong></span><Grade level={upcoming.level}/><ChevronRight size={16}/></button>}
    <section className="owned">
     <div className="section-head"><div><Warehouse size={22} className="shrink-0"/><h2>所有馬</h2><span className="count">{count} / {state.stableCap}頭</span></div><button onClick={()=>go('stable')}>厩舎を見る <ChevronRight size={15}/></button></div>
     <div className="horse-list">{state.horses.slice(0,4).map(horseRow)}</div>
    </section>
    <div className="quick">
     <button disabled={!state.horses.some(h=>!h.retired)} onClick={()=>openHorse(state.horses.find(h=>!h.retired)??horse,'training')}><span className="quick-icon"><Zap size={22}/></span><span><strong>トレーニング</strong><small>今週のメニューを組む</small></span><ChevronRight size={16}/></button>
     <button onClick={()=>{setStableTab('market');go('stable');}}><span className="quick-icon gold-text"><Sparkles size={22}/></span><span><strong>セリ・ガチャ</strong><small>新しい馬を迎える</small></span><ChevronRight size={16}/></button>
     <button onClick={()=>{setStableTab('breed');go('stable');}}><span className="quick-icon gold-text"><Dna size={22}/></span><span><strong>配合</strong><small>{state.pregnancies.length?'受胎中 '+state.pregnancies.length+'頭':'仔馬をつくる'}</small></span><ChevronRight size={16}/></button>
     <button data-coach="league" onClick={()=>go('league')}><span className="quick-icon"><Users size={22}/></span><span><strong>リーグ</strong><small>{online?.league?online.league.name:'友だちと対戦'}</small></span><ChevronRight size={16}/></button>
    </div>
   </>}
   {view==='stable'&&<>
    <div className="section-head"><div><Warehouse size={22}/><h1>厩舎</h1><span className="count">{count} / {state.stableCap}頭</span></div><button onClick={()=>{setSilk(state.silks);go('silks');}}><Shirt size={16}/> 勝負服</button></div>
    <div className="segmented stable-tabs"><button className={stableTab==='own'?'active':''} onClick={()=>setStableTab('own')}>所有馬</button><button className={stableTab==='market'?'active':''} onClick={()=>setStableTab('market')}>セリ・ガチャ</button><button className={stableTab==='breed'?'active':''} onClick={()=>setStableTab('breed')}>配合</button><button className={stableTab==='archive'?'active':''} onClick={()=>setStableTab('archive')}>殿堂</button></div>
    {stableTab==='own'&&<div className="stable-tools"><label>並び替え <select value={stableSort} onChange={e=>setStableSort(e.target.value)}><option value="rank">ランク順</option><option value="name">名前順</option><option value="age">年齢順</option></select></label><button className="button outline" disabled={state.stableCap>=MAX_STABLE_CAP} onClick={()=>{
     const cost=expansionPrice(state.stableCap);
     if(state.points-ridingFees<cost){notify('厩舎拡張に必要な所持金が足りません。');return;}
     if(window.confirm(formatYen(cost)+'で、厩舎を'+(state.stableCap+2)+'頭に拡張しますか？'))commit({...state,stableCap:state.stableCap+2,points:state.points-cost});
    }}>厩舎を拡張する</button></div>}
    {stableTab==='archive'?<section className="card"><h2>殿堂・過去の所属馬</h2>
     {state.horses.filter(h=>h.retired).map(h=><button key={h.id} className="market-row archive-row" onClick={()=>setHistoryHorse(h)}><strong>{h.name} <RankBadge horse={h}/></strong><small>{h.wins}勝 · 引退</small></button>)}
     {state.soldHorses.map(({horse:h,price,time})=><button key={h.id} className="market-row archive-row" onClick={()=>setHistoryHorse(h)}><strong>{h.name} <RankBadge horse={h}/></strong><small>売却 {formatYen(price)} · 第{year(time)}年</small></button>)}
     {!state.horses.some(h=>h.retired)&&!state.soldHorses.length&&<p className="muted">引退・売却した馬の成績をここで確認できます。</p>}
    </section>:stableTab==='breed'?<BreedPanel game={state} reserved={ridingFees} commit={commit} notify={notify}/>:stableTab==='market'?<><section className="card"><h2>セリ市場</h2><p className="muted">スピードと脚質を公開。出品馬は毎週入れ替わります。</p>{state.market.map(h=><div className="market-row" key={h.id}><div><strong>{h.name} <RankBadge horse={h}/></strong><small>{h.age}歳 {h.sex} · スピード {h.values[0]} · {styles[h.style]}</small></div><button className="button outline" onClick={()=>acquire(h,marketPrices[h.rarity])}>{amount(marketPrices[h.rarity])}円</button></div>)}{!state.market.length&&<p>今週のセリは完売しました。</p>}</section><section className="card"><h2>新馬ガチャ</h2><p className="muted">R 60% · SR 30% · SSR 10%</p><div className="actions"><button className="button primary" onClick={()=>draw(1)}><Sparkles size={17}/>1頭引く · 300万円</button><button className="button gold-button" onClick={()=>draw(10)}>10連 · 2,700万円</button></div></section></>:<div className="horse-list">{sortedHorses.map(horseRow)}{!sortedHorses.length&&<p className="muted">所有馬はいません。セリ・ガチャから新しい馬を迎えられます。</p>}</div>}
   </>}
   {view==='horse'&&<>
    <section className="horse-detail"><HorsePhoto horse={horse} detail/><div><Grade level={horse.level}/> <RankBadge horse={horse}/><h1>{horse.name}</h1><p>{ageLabel(horse)} {horse.sex} · {appearanceOf(horse).coat[0]} · {horse.wins}勝 {horse.retired?'· '+retiredLabel(horse):''}</p></div></section>
    <p className="muted">シーズン{year(state.time)}（{year(state.time)}年目） · 馬は2シーズンで1歳{!isFoal(horse)&&horse.ageDue?' · 次の加齢はあと'+Math.max(0,horse.ageDue-state.time)+'週':''}</p>
    <div className="actions"><button className="button outline" onClick={()=>setRename(horse.name)}><Pencil size={16}/>名前を変更</button><button className="button outline" onClick={()=>setHistoryHorse(horse)}><Trophy size={16}/>出走履歴・結果</button></div>
    {isFoal(horse)&&<section className="card"><h2><Sparkles size={19}/> 育成牧場で成長中</h2><p>デビューまであと <strong>{Math.max(0,(horse.foalUntil??0)-state.time)}週</strong>（{'第'+year(horse.foalUntil??0)+'年 第'+week(horse.foalUntil??0)+'週'}に入厩）。育成中は疲労・ケガなしで少しずつ能力が伸びます。</p></section>}
    <section className="card"><h2><Activity size={19}/> 能力値</h2>{stats.map((s,i)=><div className="stat" key={s}><b>{s}</b><Meter value={horse.values[i]} max={1200}/><strong>{horse.values[i]}</strong></div>)}</section>
    <section className="card"><h2>適性</h2><div className="apt">{aptitudes.map((a,i)=><div key={a}>{a}<b>{'GFEDCBAS'[horse.apt[i]]}</b></div>)}</div></section>
    <section className="card"><h2>脚質とコンディション</h2><div className="apt"><div>脚質<b>{styles[horse.style]}</b></div><div>調子<b>{forms[horse.form]}</b></div><div>疲労<b>{horse.fatigue}%</b></div><div>ケガ<b>{horse.injury?'残り'+horse.injury+'週':horse.recovery?'ケガ明け':'異常なし'}</b></div></div></section>
    <div className="actions"><button className="button outline" onClick={()=>go('pedigree')}><GitBranch size={18}/>血統表</button><button className="button primary" disabled={horse.retired||isFoal(horse)} data-coach="train" onClick={()=>{go('training');if(coach===2)setCoach(3);}}><Zap size={18}/>トレーニング</button>{!horse.retired&&!isFoal(horse)&&<button className="button outline" disabled={Object.values(state.cards).some(c=>c.registered===horse.id&&c.tickets.length)} onClick={()=>{if(window.confirm(horse.name+'を引退させますか？'+(horse.sex==='牝'?'（繁殖牝馬になります）':horse.sex==='牡'?'（種牡馬になります）':''))){const cards=Object.fromEntries(Object.entries(state.cards).filter(([,c])=>c.registered!==horse.id));commit({...state,cards,horses:state.horses.map(h=>h.id===horse.id?{...h,retired:true}:h)});}}}>引退する</button>}{!horse.retired&&<button className="button outline" onClick={()=>setSale(horse)}>売却する</button>}</div>
   </>}
   {view==='training'&&<>
    <section className="card" id="training-plan"><h1>週のトレーニング計画</h1><label className="registration">対象馬 <RankBadge horse={horse}/><select value={horse.id} disabled={!!bulkPlan} onChange={e=>setHorseId(e.target.value)}>{state.horses.map(h=><option key={h.id} value={h.id}>{h.name} [{rarity[h.rarity]}]{h.retired?'（引退）':isFoal(h)?'（育成中）':''}</option>)}</select></label>
     {bulkPlan?<div className="card"><strong>全現役馬の週間メニュー</strong>
      <p>同じメニューを{trainingHorses.length}頭に上書きします。休養中の馬は回復後にこのメニューで調教します。</p>
      <div className="actions"><button className="button gold-button" disabled={!trainingHorses.length} onClick={applyBulkPlan}>全現役馬に適用</button><button className="button outline" onClick={()=>setBulkPlan(undefined)}>キャンセル</button></div>
     </div>:<button className="button outline" disabled={!trainingHorses.length} onClick={()=>setBulkPlan([...individualPlan])}>全現役馬のメニューを一括変更</button>}
     {!bulkPlan&&isFoal(horse)&&<p className="muted">育成牧場にいるため、メニューは組めません（週を進めると自動で成長します）。</p>}
     {!bulkPlan&&horse.injury>0&&<p className="danger">ケガのためあと{horse.injury}週間は休養します。</p>}
     <div className="days">{['月','火','水','木','金','土','日'].map((d,i)=><label key={d}>{d}<select aria-label={d+'曜日のメニュー'} disabled={!bulkPlan&&(!!horse.injury||horse.retired||isFoal(horse))} value={plan[i]} onChange={e=>{const updated=[...plan];updated[i]=Number(e.target.value);if(bulkPlan){setBulkPlan(updated);return;}commit({...state,plans:{...state.plans,[horse.id]:updated}});}}>{menus.map((m,n)=><option key={m.name} value={n}>{m.name}</option>)}</select></label>)}</div>
    </section>
    <section className="card"><h2>メニューと能力変動</h2><div className="menu-grid">{menus.map(m=><div key={m.name}><strong>{m.name}</strong><small>{m.gain.map((v,i)=>v?stats[i]+' +'+v:'').filter(Boolean).join('、')||'疲労とケガの回復'}</small><small>疲労 {m.fatigue>0?'+':''}{m.fatigue} / 負傷リスク {m.risk===0?'なし':m.risk>.01?'中':'低'}</small></div>)}</div></section>
    {!bulkPlan&&<div className="board fatigue-board">週末の予想疲労 <strong>{horse.retired||isFoal(horse)?horse.fatigue:horse.injury?Math.max(0,horse.fatigue-40):fatigue}%</strong></div>}
    <div className="actions"><button className="button primary" data-coach="review" disabled={!!bulkPlan} onClick={()=>{setTrainingReviewed(state.time);writeDevice('training',state.time);go('home');if(coach===3)setCoach(4);}}>計画を確認した<ArrowRight size={17}/></button><button className="button outline" disabled={!!bulkPlan} onClick={()=>moveTime(true)}><SkipForward size={19}/>次のレースまでスキップ</button></div>
    <p className="muted">スキップ中は選択馬の計画を繰り返します。他の馬は2週目以降休養します。</p>
    {state.report.length>0&&<section className="card" id="training-report"><h2>トレーニング結果</h2>{state.report.map((line,i)=><p key={i}>{line}</p>)}</section>}
   </>}
   {view==='races'&&<>
    <div className="section-head"><div><Trophy size={22}/><h1>レース日程</h1></div><span className="count">シーズン{year(state.time)}（{year(state.time)}年目）</span></div>
    <div className="schedule-grid">{available(state).map(raceCard)}</div>
    {!available(state).length&&<section className="card"><p>今シーズンの開催は終了しました。</p><button className="button primary" onClick={()=>go('training')}>トレーニングへ</button></section>}
    {state.history.length>0&&<section className="card"><h2>レース結果履歴</h2>{state.history.map(r=><button className="history-row" key={r.key} onClick={()=>showResult(r)}><span>{r.race.title} <small>第{r.key.split('-')[0]}年 第{r.race.week}週</small></span><ChevronRight size={16}/></button>)}</section>}
   </>}
   {view==='bet'&&(targetRace&&card&&odds?<>
    <section className="card"><div className="schedule-title"><h1>{targetRace.title}</h1><Grade level={targetRace.level}/></div><p className="race-meta"><MapPin size={15}/>{targetRace.venue} · {targetRace.surface}{targetRace.distance}m · 第{targetRace.week}週</p><label className="registration">レース<select value={targetRace.title} onChange={e=>{setRaceChoice(available(state).find(r=>r.title===e.target.value));setSelected([]);}}>{available(state).map(r=><option key={r.title}>{r.title}</option>)}</select></label><PrizeList race={targetRace}/></section>
    <div className="bet-types" aria-label="券種">{types.map((type,i)=><button key={type} className={i===ticketType?'active':''} aria-pressed={i===ticketType} onClick={()=>{setTicketType(i);setSelected([]);}}>{type}</button>)}</div>
    <details className="card ticket-help" key={ticketType}><summary><CircleHelp size={17}/>{types[ticketType]}とは？</summary><p>{ticketHelp[ticketType]}</p></details>
    <section className="card runners"><h2>出馬表</h2><p className="muted">{ticketType===2?'枠を':ordered(ticketType)?'着順どおりに馬を':'馬を'}{picks[ticketType]}つ選択</p>
     <p className="muted">馬名を長押しすると詳しい情報が開きます。</p>
     {card.entries.map(e=><RunnerButton key={e.number} picked={selected.includes(e.number)} details={()=>{setRunner(e);if(coach===9)setCoach(10);}} select={()=>setSelected(selected.includes(e.number)?selected.filter(n=>n!==e.number):selected.length<picks[ticketType]?[...selected,e.number]:picks[ticketType]===1?[e.number]:selected)}>
      {marker(e.number)}<span className="runner-identity"><span className="runner-face"><HorsePhoto horse={e.horse}/></span><span><strong>{currentName(e)}</strong><small>{jockeyName(e)} · {styles[e.horse.style]} · {forms[e.horse.form]}</small></span></span><span className="board runner-odds">{odds(0,[e.number]).toFixed(1)}</span>
     </RunnerButton>)}
    </section>
    {card.tickets.length>0&&<section className="card"><h2>購入済み馬券</h2>{card.tickets.map((t,i)=><p key={i}>{types[t.type]} {t.numbers.map((n,j)=><span className="ticket-number" key={j}>{j>0&&ordered(t.type)&&' → '}{marker(n)}</span>)} · {amount(t.stake)}円</p>)}</section>}

   </>:<section className="card"><h2>購入できるレースがありません</h2><button className="button primary" onClick={()=>go('training')}>次の週へ</button></section>)}
   {view==='watch'&&result&&<RaceThree key={result.key} result={result} showNumbers={showNumbers} balance={raceBalance} settledBalance={state.points} audioMode={raceAudioMode} initialSound={raceAudioDefault} onFinish={()=>{showResult(result);if(coach===12)setCoach(13);notify(locked?'レース結果が出ました。':'レース結果が出ました。次の週へ進めます。');}}/>}
   {view==='settings'&&<section className="card"><h1>設定</h1><label className="setting-row"><span><strong>調教師のアドバイス</strong><small>画面下部に今やることを表示します。</small></span><input type="checkbox" checked={advisor} onChange={event=>{setAdvisor(event.target.checked);writeDevice('advisor',event.target.checked);}}/></label><label className="setting-row"><span><strong>馬の頭上に馬番を表示</strong><small>3Dレース中継の表示設定です。</small></span><input type="checkbox" checked={showNumbers} onChange={event=>{setShowNumbers(event.target.checked);writeDevice('raceHorseNumbers',event.target.checked);}}/></label><label className="setting-row"><span><strong>観戦開始時にレース音声をオン</strong><small>初期設定はオフです。</small></span>
    <input type="checkbox" checked={raceAudioDefault} onChange={event=>{setRaceAudioDefault(event.target.checked);writeDevice('raceAudioDefault',event.target.checked);}}/></label>
   <label className="setting-row"><span><strong>レース音声の種類</strong><small>観戦画面で音声をオンにしたときの内容</small></span>
    <select value={raceAudioMode} onChange={event=>{const mode=event.target.value as RaceAudioMode;setRaceAudioMode(mode);writeDevice('raceAudioMode',mode);}}>
     <option value="both">実況と場内音</option><option value="voice">実況だけ</option><option value="ambient">場内音だけ</option>
    </select></label><button className="button outline" onClick={startCoach}>チュートリアルをもう一度見る</button><button className="button outline" onClick={()=>go('credits')}>クレジット</button></section>}
   {view==='settings'&&<section className="card"><h2>アカウント</h2>{accountForm}
    {onlineConfigured&&<><h3>引き継ぎコード</h3><p className="muted">別のブラウザーやホーム画面版で同じセーブを開けます。コードは自分だけで保管してください。</p>
     {transfer?<><textarea className="transfer-code" aria-label="発行済みの引き継ぎコード" readOnly value={transfer} onFocus={e=>e.target.select()}/><button className="button outline" onClick={()=>void navigator.clipboard?.writeText(transfer).then(()=>notify('コピーしました。'),()=>notify('コードを選択してコピーしてください。'))}>コピー</button></>:<button className="button outline" disabled={busy||!online} onClick={()=>void act(async()=>{setTransfer(await issueTransferCode(state));})}>引き継ぎコードを発行</button>}
     {restoring?restoreForm:<button className="button outline" onClick={()=>setRestoring(true)}>別のセーブを引き継ぐ</button>}</>}
    {accountError&&<p className="danger" role="alert">{accountError}</p>}</section>}
   {view==='credits'&&<ModelCredits/>}
   {view==='inbox'&&<section className="card"><div className="schedule-title"><h1>通知</h1>{unread>0&&<button className="text-button" onClick={()=>inbox.markRead()}>すべて既読にする</button>}</div>
    {inbox.items.length===0&&<p className="muted">まだ通知はありません。</p>}
    {inbox.items.map(item=><button className={'inbox-item'+(item.read?'':' unread')} key={item.id} onClick={()=>openAlert(item)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ChevronRight size={17}/></button>)}
   </section>}
   {view==='result'&&result&&<>
    <section className="card"><div className="schedule-title"><h1>{result.race.title}</h1><Grade level={result.race.level}/></div><PrizeList race={result.race}/><h2>着順</h2><div className="finish-columns"><span>タイム</span><span>着差</span></div>{result.order.map((e,i)=><div key={e.number} className="result-row finish-row"><b>{i+1}着</b>{marker(e.number)}<strong>{currentName(e)}<small className="finish-jockey">{jockeyName(e)}</small></strong><time>{formatTime(result.times[i]??0)}</time><small aria-label={result.margins[i]?'着差 '+result.margins[i]:undefined}>{result.margins[i]||'—'}</small></div>)}</section>
    <section className="card"><h2>賞金と払戻</h2><p>厩舎賞金 <strong>{amount(result.prize)}円</strong></p><p>馬券払戻 <strong>{amount(result.payouts.reduce((a,b)=>a+b,0))}円</strong></p>{result.tickets.map((t,i)=><div className="result-row" key={i}><span>{types[t.type]} {t.numbers.join(ordered(t.type)?' → ':' − ')} · {amount(t.stake)}円</span><strong>{result.payouts[i]?'払戻 '+amount(result.payouts[i])+'円':'不的中'}</strong></div>)}</section>
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
   {view==='pedigree'&&<PedigreeView horse={horse} game={state}/>}
   {view==='league'&&<LeagueView game={state} configured={onlineConfigured} online={online} friends={friends} feed={feed} busy={busy}
    onRefresh={()=>{if(online)void act(()=>syncLeague(online.profile));}}/>}
  </main>
  {gacha&&<Gacha horses={gacha} onClose={()=>{gachaPending.current=false;setGacha(undefined);setStableTab('own');window.scrollTo(0,0);}}/>}
  {historyHorse&&<HorseRaceHistory horse={historyHorse} game={state} close={()=>setHistoryHorse(undefined)} open={r=>{
   setHistoryHorse(undefined);showResult(r,view==='horse'?'horse':'stable');
  }}/>}
  {sale&&(()=>{const quote=saleQuote(state,sale);return <Sheet title={sale.name+'の売却'} close={()=>setSale(undefined)}>
   <p>売却額 <strong>{formatYen(quote.price)}</strong></p><ul>{quote.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
   <p>売却後は厩舎から外れ、成績は殿堂から確認できます。</p>
   <button className="button primary" onClick={()=>{
    try{commit(sellHorse(gameRef.current??state,sale.id));setSale(undefined);setStableTab('own');go('stable');notify(formatYen(quote.price)+'で売却しました。');}
    catch(e){setSale(undefined);notify(e instanceof Error?e.message:'売却できませんでした。');}
   }}>売却を確定</button>
  </Sheet>;})()}
  {rename!==undefined&&<Sheet title="名前を変更" close={()=>setRename(undefined)}>
   <form onSubmit={e=>{e.preventDefault();if(nameProblem(rename,horse,state))return;
    const updated={...state,horses:state.horses.map(h=>h.id===horse.id?{...h,name:rename.trim(), customName:true}:h),cards:Object.fromEntries(Object.entries(state.cards).map(([k,c])=>[k,{...c,entries:c.entries.map(e=>e.owned&&e.horse.id===horse.id?{...e,horse:{...e.horse,name:rename.trim(), customName:true}}:e)}]))};
    commit(updated);if(online?.league)void publishNow(updated).catch(()=>notify('リーグに名前を同期できませんでした。'));setRename(undefined);
   }}><label className="registration">馬名<input value={rename} onChange={e=>setRename(e.target.value)} autoFocus/></label>
    <p role="status" className="danger">{nameProblem(rename,horse,state)}</p><button className="button primary" disabled={!!nameProblem(rename,horse,state)}>保存する</button></form>
  </Sheet>}
  {registration&&<Sheet title={registration.race.title+'の出走登録'} close={()=>setRegistration(undefined)}>
   <h3>出走馬</h3><div className="choice-grid">{state.horses.filter(h=>eligible(h,registration.race)).map(h=><button key={h.id} className="button outline" aria-pressed={h.id===registration.horseId} onClick={()=>setRegistration({...registration,horseId:h.id})}>{h.name} <RankBadge horse={h}/></button>)}</div>
   <section className="registration-forecast" aria-label="登録前の予想" aria-live="polite">
    <dl><div><dt>予想勝率</dt><dd>{forecast?forecast.winPct.toFixed(1)+'%':'—'}</dd></div>
    <div><dt>単勝の参考オッズ</dt><dd>{forecast?forecast.odds.toFixed(1)+'倍':'—'}</dd></div></dl>
    <p>{forecast?forecast.trials+'回の試走結果による目安です。':'出走馬を選ぶと予想を表示します。'} 出走馬や投票でオッズは変わります。</p>
   </section>
   <h3>ジョッキー</h3><div className="choice-grid">{jockeys.map(j=>{const locked=jockeyLock(state,j.id);return <button key={j.id} data-coach={j.id==='sugawara'?'jockey':undefined} className="jockey-card" disabled={!!locked} aria-pressed={registration.jockeyId===j.id} onClick={()=>{setRegistration({...registration,jockeyId:j.id});if(coach===7)setCoach(6);}}>
    <strong>{j.name}</strong><small>{j.style===null?'補正なし':styles[j.style]+' · 出足+'+j.start+' 位置+'+j.position+' 末脚+'+j.spurt}</small><small>騎乗料 {formatYen(j.fee)}{locked?' · 🔒 '+locked:''}</small></button>;})}</div>
   <p className="muted">登録料 {formatYen(registrationFee(registration.race))}（登録時） · 騎乗料 {formatYen(jockeyOf(registration.jockeyId).fee)}（出走時）</p>
   <button className="button primary" data-coach="confirm" onClick={()=>register(registration.race,registration.horseId,registration.jockeyId)}>登録を確定</button>
  </Sheet>}
  {runner&&targetRace&&<RunnerSheet entry={runner} race={targetRace} game={state} close={()=>setRunner(undefined)}/>}
  {tip&&<Coach tip={tip} skip={closeTutorial}/>}
  {notice&&<div className="toast" role="status">{notice}</div>}
  <div className="dock">
   {advisorVisible&&!showTicketDock&&<aside className="advisor">
    <AdvisorPortrait/><div><small>調教師アドバイザー</small><p>{advisorAction.title}</p></div>
    <button className="advisor-link" onClick={advisorAction.action}>{advisorAction.label}<ArrowRight size={13}/></button>
   </aside>}
   {showTicketDock&&targetRace?<section id="ticket-order" className="ticket-dock" aria-label="馬券の購入内容">
    <div className="ticket-summary"><strong>{types[ticketType]}</strong><span className="ticket-picks">
     {selected.length?selected.map((n,i)=><span className="ticket-number" key={n}>{i>0&&ordered(ticketType)&&' → '}{marker(n)}</span>):'未選択'}
    </span>{estimate>0&&<span className="ticket-estimate">参考 {estimate.toFixed(1)}倍</span>}</div>
    {canRace?<><label className="stake-label">購入金額 <span><input inputMode="numeric" value={stakeText?amount(stake):''} onChange={e=>{
     const value=e.target.value.normalize('NFKC').replaceAll(',','');if(/^\d{0,16}$/.test(value))setStakeText(value);
    }}/><span>円</span></span></label>
    <div className="stake-chips">{[1000,10000,100000].map(n=><button type="button" className="chip" key={n} onClick={()=>setStake(stake+n)}>+{amount(n)}</button>)}
     <button type="button" className="chip" onClick={()=>setStake(Math.floor(betFunds/100)*100)}>全額</button><button type="button" className="chip" onClick={()=>setStakeText('')}>クリア</button>
    </div>
    <p className={stakeError?'danger ticket-status':'ticket-status'} role="status">{stakeError||(!completePick?'あと'+(picks[ticketType]-selected.length)+(ticketType===2?'枠':'頭')+'選んでください。':'購入後も買い足せます。')}</p>
    <div className="ticket-actions"><button className={'button '+(completePick?'gold-button':'outline')} disabled={!canBuy} onClick={buy}><TicketIcon size={17}/>馬券を買う</button>
     <button className={'button '+(completePick?'outline':'gold-button')} data-coach="start-race" onClick={()=>start(targetRace)}><Flag size={17}/>レースを見る</button></div></>:<div className="ticket-actions"><span>第{targetRace.week}週に発売</span><button className="button gold-button" data-coach="week" onClick={()=>moveTime(false)}>次の週へ進む</button></div>}
   </section>:<div className="dock-actions">
    <button className="button gold-button" disabled={view==='watch'} onClick={()=>{if(view==='bet'&&targetRace&&(!currentRace||targetRace.week===week(state.time))){document.getElementById('ticket-order')?.scrollIntoView({block:'start'});return;}if(currentRace)openBet(currentRace);else{setRaceChoice(undefined);go('bet');}}}><TicketIcon size={17}/><span><strong>馬券を買う</strong><small>{view==='watch'?'現在レース中':currentRace?(view==='bet'&&targetRace?.week===week(state.time)?'購入内容へ':'発売中の出馬表へ'):upcoming?'第'+upcoming.week+'週発売 · 出馬表へ':'今季の発売は終了'}</small></span></button>
    <button className="button primary" data-coach="week" disabled={view==='watch'} onClick={()=>{if(locked){setRaceChoice(locked);go('races');notify('購入済みの馬券があります。先にレースを開催しましょう。');return;}moveTime(false);}}><ArrowRight size={18}/><span><strong>次の週へ進む</strong><small>{view==='watch'?'結果を確認してから':locked?'先に馬券を精算':'調教を実施し、1週進む'}</small></span></button>
   </div>}
   <nav className="bottom" aria-label="メインナビゲーション"><div>{tabs.map(([key,label,Icon])=><button key={key} data-coach-nav={key} className={activeTab===key?'current':''} aria-current={activeTab===key?'page':undefined} onClick={()=>{if(key==='stable')setStableTab('own');if(key==='bet')setRaceChoice(currentRace);go(key);}}><Icon size={20} strokeWidth={2}/><span>{label}</span></button>)}</div></nav>
  </div>
 </div>;
}
