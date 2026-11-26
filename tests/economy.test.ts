import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advance, cardFor, eligible, initialGame, prizeFor, registrationFee, runRace, week, year } from '../lib/game';
import { expansionPrice, formatYen } from '../lib/economy';
import { friendPrizes } from '../lib/league';
import { races } from '../lib/races';
import { seeded } from '../lib/random';
import { migrate, serialize } from '../lib/storage';

const debut = races[0];

test('v3 converts nested money exactly once and preserves identity, condition and age', () => {
 const start = initialGame();
 const horse = { ...start.horses[0], age: 6, earnings: 18 };
 const ticket = { type: 0, numbers: [2], stake: 101 };
 const card = { registered: horse.id, entries: [{ horse, owned: true, number: 2, frame: 2, strength: 500 }], tickets: [ticket] };
 const old = { ...start, time: 63, horses: [horse], points: 10000, prize: 18, returned: 172, spent: 101,
  report: ['賞金 18 pt'], cards: { old: card },
  history: [{ key: 'old', race: debut, order: card.entries, tickets: [ticket], payouts: [172], prize: 18 }] };
 const migrated = migrate({ version: 3, game: old });
 assert.equal(migrated.points, 30_000_000);
 assert.equal(migrated.prize, 54_000);
 assert.equal(migrated.spent, 303_000);
 assert.equal(migrated.returned, 516_000);
 assert.equal(migrated.cards.old.tickets[0].stake, 303_000);
 assert.equal(migrated.cards.old.entries[0].horse.earnings, 54_000);
 assert.equal(migrated.history[0].payouts[0], 516_000);
 assert.equal(migrated.history[0].prize, 54_000);
 assert.equal(migrated.horses[0].age, 6);
 assert.equal(migrated.horses[0].ageDue, 167);
 assert.equal(migrated.horses[0].name, horse.name);
 assert.equal(migrated.horses[0].rarity, horse.rarity);
 assert.deepEqual(migrated.report, ['賞金 54,000円']);
 assert.equal(migrated.stableCap, 10);
 assert.equal(migrated.tutorialDone, true);
 assert.deepEqual(migrate(JSON.parse(serialize(migrated))), migrate(JSON.parse(serialize(migrate(JSON.parse(serialize(migrated)))))));
});

test('race prize shares, fees, jockeys and league winnings use the same race', () => {
 const game = initialGame();
 const h = game.horses[0];
 const registered = { ...game,time:debut.week,cards:{ ['1-3-'+debut.title]:{ registered:h.id,jockeyId:'tanabe',entries:[],tickets:[] } } };
 const card = cardFor(registered, debut);
 assert.equal(card.entries.find(e => e.owned)?.jockeyId, 'tanabe');
 assert.equal(new Set(card.entries.map(e => e.jockeyId)).size, card.entries.length);
 const {game: settled,result} = runRace(registered, debut, card, seeded('test'));
 const finish = result.order.findIndex(e => e.owned);
 assert.equal(settled.points, game.points - 300_000 + prizeFor(debut,finish));
 assert.equal(result.prize,prizeFor(debut,finish));
 assert.equal(friendPrizes({...result, order:[{...result.order[0],ownerId:'friend',horse:{...h,id:'friend:friend:'+h.id}}]})[0].prize,7_000_000);
 assert.equal(prizeFor(debut,4),700_000);
 assert.equal(prizeFor(debut,5),0);
 assert.equal(registrationFee(debut),70_000);
 assert.equal(prizeFor(races.find(r=>r.title==='有馬記念')!,0),500_000_000);
 assert.equal(formatYen(120_000_000,true),'1.2億円');
 assert.equal(expansionPrice(10),5_000_000);
 assert.equal(expansionPrice(12),8_000_000);
});

test('weekly boarding has a zero floor and three-year-olds have two calendar seasons at age 3', () => {
 const game=initialGame();
 const id=game.horses[0].id;
 const next = advance(game,1,id,seeded('weekly'));
 assert.equal(next.points,29_850_000);
 assert.equal(next.report[0],'預託料 -150,000円');
 assert.equal(advance({...game,points:25},2,id).points,0);
 let clock={...game, horses:[game.horses[0]],points:0};
 const random=seeded('career');
 const debutSeasons: number[] = [];
 let activeWeeks=0;
 while(!clock.horses[0].retired && activeWeeks<=900) {
  if(week(clock.time)===debut.week&&eligible(clock.horses[0],debut))debutSeasons.push(year(clock.time));
  clock=advance(clock,1,id,random);
  activeWeeks++;
 }
 assert.deepEqual(debutSeasons,[1,2]);
 assert.equal(clock.horses[0].age,11);
 assert.equal(activeWeeks,832);
 assert.equal(year(clock.time),17);
 console.log('Active career: 832 weeks / 16 seasons, forced retirement at start of season 17.');
});

test('v4 roster migration preserves custom names, IDs and existing jockey contracts', () => {
 const game = initialGame();
 const oldDefault = { ...game.horses[0], name: 'アオバストライド' };
 const renamed = { ...game.horses[1], name: '私の愛馬' };
 const matchingCustom = { ...game.horses[2], name: 'ノーブルゲイル', customName: true };
 const old = { ...game, horses: [oldDefault, renamed, matchingCustom],
  cards: { debut: { registered: oldDefault.id, jockeyId: 'yamato', entries: [
   { horse: oldDefault, jockeyId: 'yamato', number: 1, frame: 1, owned: true, strength: 600 },
  ], tickets: [{ type: 0, numbers: [1], stake: 100 }] } } };
 const migrated = migrate({ version: 4, game: old });
 assert.deepEqual(migrated.horses.map(h=>h.name), ['スペシャルウィーク','私の愛馬','ノーブルゲイル']);
 assert.deepEqual(migrated.horses.map(h=>h.id), old.horses.map(h=>h.id));
 assert.equal(migrated.cards.debut.jockeyId, 'tanabe');
 assert.equal(migrated.cards.debut.entries[0].jockeyId, 'tanabe');
 assert.equal(migrated.cards.debut.entries[0].horse.name, 'スペシャルウィーク');
 assert.equal(migrated.cards.debut.tickets[0].stake, 100);
 assert.equal(migrated.tutorialDone, true);
 assert.equal(initialGame().tutorialDone, false);
});

test('the common league requires both three completed races and five elapsed weeks', async () => {
 const {leagueProgress}=await import('../lib/league');
 const game=initialGame();
 const played=runRace({...game,time:debut.week},debut,cardFor(game,debut),seeded('progress')).result;
 const history=[0,1,2].map(i=>({...played,key:'race-'+i}));
 assert.equal(leagueProgress(game).eligible,false);
 assert.equal(leagueProgress({time:5,history}).eligible,false);
 assert.equal(leagueProgress({time:6,history:history.slice(0,2)}).eligible,false);
 assert.equal(leagueProgress({time:6,history}).eligible,true);
});

test('a horse sale credits yen, frees a slot and persists the archived horse', async () => {
 const {saleQuote,sellHorse}=await import('../lib/horse-sale');
 const game=initialGame(), horse={...game.horses[0],rarity:2,purchasePrice:2_700_000};
 const owned={...game,horses:[horse]};
 const {price}=saleQuote(owned,horse);
 assert.ok(price>0&&price<horse.purchasePrice);
 assert.throws(()=>sellHorse({...owned,cards:{demo:{registered:horse.id,entries:[],tickets:[{type:0,numbers:[1],stake:100}]}}},horse.id));
 const sold=sellHorse(owned,horse.id);
 assert.equal(sold.points,game.points+price);
 assert.equal(sold.horses.length,0);
 assert.equal(sold.soldHorses[0].horse.id,horse.id);
 assert.equal(migrate(JSON.parse(serialize(sold))).horses.length,0);
 assert.equal(migrate(JSON.parse(serialize(sold))).soldHorses[0].price,price);
 assert.deepEqual(migrate({version:5,game}).soldHorses,[]);
});

test('scheduled venues use their own loops, home lengths and hill profiles', async () => {
 const {courseOf, courseGrade, courseElevation, courses}=await import('../lib/course-data');
 const {pathFor}=await import('../app/race3d/course');
 const race=(venue:string,distance:number,surface:'芝'|'ダート'='芝')=>({title:'試走',week:1,level:0,venue,distance,surface});
 assert.equal(courseOf(race('東京',1800)).straight,525.9);
 assert.equal(courseOf(race('東京',1600,'ダート')).lap,1899);
 assert.equal(courseOf(race('阪神',2200)).lap,1689);
 assert.equal(courseOf(race('阪神',2400)).lap,2089);
 assert.equal(courseOf(race('新潟',1800)).straight,658.7);
 assert.equal(courseOf(race('京都',3200)).straight,403.7);
 const nakayama=courseOf(race('中山',2000));
 assert.equal(courseElevation(nakayama,70)-courseElevation(nakayama,180),2.2);
 assert.ok(courseGrade(nakayama,125)>2.2 && courseGrade(nakayama,125)<2.24);
 assert.equal(Math.abs(courseGrade(courseOf(race('東京',1800)),100)),0);
 assert.ok(courseGrade(courseOf(race('京都',3200)),550)<0);
 assert.ok(courseGrade(courseOf(race('中京',2000)),295)>1.5);
 for(const r of races){
  assert.ok(courses[r.venue]);
  const course=courseOf(r), track=pathFor(r);
  assert.ok(Math.abs(track.length-course.lap)<1e-6);
  assert.ok(Math.abs(track.grade(r.distance-125)-courseGrade(course,125))<1e-8);
  assert.ok(Math.abs(track.map(r.distance).y-track.side*track.radius)<1e-6);
  const result=runRace({...initialGame(),time:r.week},r,cardFor({...initialGame(),time:r.week},r),seeded('course-'+r.title)).result;
  assert.equal(result.order.length,8);
  assert.ok(result.times.every((t,i)=>Number.isFinite(t)&&t>0&&(!i||t>=result.times[i-1])));
 }
});

test('race playback preserves launch delays, real finish times and late overtakes', async () => {
 const {field,simulateRace}=await import('../lib/game');
 const {raceMotion}=await import('../app/race3d/motion');
 const race=races.find(r=>r.venue==='中山'&&r.distance===1800)!;
 const game={...initialGame(),time:race.week};
 const entries=field(game,race,null);
 let change=false,comeback=false,delayed=false;
 for(let attempt=0;attempt<32;attempt++){
  const seed=seeded('tactics-'+attempt);
  const sim=simulateRace(race,entries,seed);
  const winner=sim.finish[0];
  const byDistance=(d:number[])=>d.map((v,i)=>({v,number:i+1})).sort((a,b)=>b.v-a.v);
  const afterGate=sim.timeline.find(s=>s.t>=.62)!;
  delayed ||= afterGate.d.some(d=>d===0)&&afterGate.d.some(d=>d>.2);
  const early=sim.timeline.filter(s=>s.t>=1&&s.t<=16).map(s=>byDistance(s.d)[0].number);
  change ||= new Set(early).size>1;
  const lastTurn=sim.timeline.find(s=>Math.max(...s.d)>=race.distance-600)!;
  comeback ||= byDistance(lastTurn.d).findIndex(e=>e.number===winner)>=4;
  assert.ok(sim.timeline.every((s,i)=>i===0||s.t>sim.timeline[i-1].t));
 }
 assert.ok(delayed&&change&&comeback);
 const result=runRace(game,race,cardFor(game,race),seeded('tactics-precise')).result;
 const playback=raceMotion(result);
 assert.equal(playback.winner,result.finishTimes?.[0]);
 assert.equal(playback.field(playback.winner)[0].rank,0);
 assert.equal(playback.field(playback.winner)[0].distance,race.distance);
 assert.ok(playback.field(playback.winner-.01).every(h=>h.distance<race.distance));
 assert.deepEqual(migrate(JSON.parse(serialize({...game,history:[result]}))).history[0].finishTimes,result.finishTimes);
});
