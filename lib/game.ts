// lib/game.ts
// ゲームロジック本体（UIから使う関数・型はすべてここから export）
import { races, type Race } from './races';
import { clamp, seeded, shuffle, type Random } from './random';
import { simulateRace, strength, type RaceSnapshot } from './race-engine';
import { combo, makeOdds, winningCombos } from './odds';

export { types, picks, ordered, combo, makeOdds, frameOf, takeout, winningCombos, popularity, type OddsFunction } from './odds';
export { strength, simulateRace, liveOrder, liveComment, formatTime, distanceBand, paceLabel, type RaceSnapshot, type LiveRunner } from './race-engine';

// ───────── 定数 ─────────
export const stats = ['スピード', 'スタミナ', 'パワー', '瞬発力', '根性', '賢さ'];
export const aptitudes = ['短距離', 'マイル', '中距離', '長距離', '芝', 'ダート'];
export const styles = ['逃げ', '先行', '差し', '追込'];
export const forms = ['絶不調', '不調', '普通', '好調', '絶好調'];
export const rarity = ['R', 'SR', 'SSR'];
export const growthTypes = ['早熟', '普通', '晩成'];
export const STAT_MAX = 1200;
export const RETIRE_AGE = 11;
export const STABLE_LIMIT = 10;

/** 1日あたりの効果。gain は stats の順 */
export const menus = [
  { name: '坂路', fatigue: 10, gain: [5, 0, 3, 2, 0, 0], risk: 0.002 },
  { name: 'ウッドチップ', fatigue: 9, gain: [0, 6, 0, 0, 2, 1], risk: 0.0015 },
  { name: 'プール', fatigue: 4, gain: [0, 4, 2, 0, 0, 0], risk: 0.0003 },
  { name: '併せ馬', fatigue: 14, gain: [3, 0, 2, 3, 5, 0], risk: 0.011 },
  { name: 'ゲート練習', fatigue: 5, gain: [1, 0, 0, 2, 0, 5], risk: 0.001 },
  { name: '休養', fatigue: -20, gain: [0, 0, 0, 0, 0, 0], risk: 0 },
  { name: '調整', fatigue: 2, gain: [1, 1, 1, 1, 1, 1], risk: 0.0005 },
];
export const defaultPlan = [0, 1, 5, 2, 4, 5, 6];

// ───────── 型 ─────────
export type Silks = { pattern: number; body: string; sleeve: string; cap: string };
export type Horse = {
  id: string; name: string; age: number; sex: string;
  /** 能力値（stats の順、0〜1200） */
  values: number[];
  /** 能力ごとの成長限界 */
  potential: number[];
  /** 0=早熟 1=普通 2=晩成 */
  growth: number;
  /** 適性（aptitudes の順、0=G〜7=S） */
  apt: number[];
  style: number; form: number; fatigue: number;
  /** ケガの残り休養週数 */
  injury: number;
  injuryName?: string;
  level: number; wins: number; starts: number; earnings: number; rarity: number;
  retired?: boolean;
  /** ケガ明け（復帰後の初戦まで、または3週間） */
  recovery?: boolean;
  rehab?: number;
};
export type Entry = { number: number; frame: number; horse: Horse; strength: number; owned: boolean };
export type Ticket = { type: number; numbers: number[]; stake: number };
export type Card = { registered: string | null; entries: Entry[]; tickets: Ticket[] };
export type Result = {
  key: string; race: Race; order: Entry[]; payouts: number[]; tickets: Ticket[]; prize: number;
  /** 着順ごとの走破タイム（秒） */
  times: number[];
  /** 着順ごとの着差（1着は空） */
  margins: string[];
  /** 実況用の途中経過（古い結果は容量節約のため空） */
  timeline: RaceSnapshot[];
  pace: number;
  notes: string[];
  /** 馬番-1 の位置に確定単勝オッズ */
  winOdds: number[];
};
export type Game = {
  time: number; points: number; horses: Horse[]; plans: Record<string, number[]>; cards: Record<string, Card>;
  history: Result[]; silks: Silks; spent: number; returned: number; prize: number; report: string[]; market: Horse[];
};

// ───────── 馬の生成 ─────────
const horseNames = ['ブルームフィールド', 'ルミエールリーフ', 'ヴェルデシエロ', 'ナイトリバー', 'ゴールドフェザー', 'ミストバレー', 'グリーンコメット', 'サクラノヴァ', 'オーシャンリズム', 'シルバーパス', 'メドウベル', 'スカイラピス'];
const cpuNames = ['ハヤテノツバサ', 'ミナモノシラベ', 'ソラカケルユメ', 'ホシクズダンサー', 'アカツキエール', 'カザハナルート', 'シオサイブルー', 'ヨイマチレター', 'ツキアカリロード', 'ハナミズキワルツ', 'フユノオリオン', 'ナツゾラマーチ', 'アキツシマカゼ', 'コハクスプリント', 'ルリイロノアサ', 'ヒスイノカナタ', 'イブキスピリット', 'マドロミカノン', 'タマユラリズム', 'セセラギエコー', 'オボロヅキ', 'キラメキパレード', 'ノハラノヒカリ', 'ミライノトビラ'];

/** 得意距離を中心に山なり、芝かダートのどちらかが得意な適性を作る */
function makeAptitude(random: Random): number[] {
  const best = Math.floor(random() * 4);
  const distance = [0, 1, 2, 3].map(band => clamp(7 - Math.abs(band - best) * 2 - Math.floor(random() * 2), 0, 7));
  const turf = random() < 0.65;
  const good = 5 + Math.floor(random() * 3);
  const bad = Math.floor(random() * 5);
  return [...distance, turf ? good : bad, turf ? bad : good];
}

function makeHorse(id: string, name: string, quality: number, base: number, random: Random = Math.random): Horse {
  const values = Array.from({ length: 6 }, () => base + Math.floor(random() * 150));
  const ceiling = [900, 1000, 1100][quality] ?? 900;
  const potential = values.map(v => Math.min(STAT_MAX, Math.max(v + 120, Math.round(ceiling + (random() - 0.5) * 200))));
  const g = random();
  return {
    id, name, age: 3, sex: random() < 0.5 ? '牡' : '牝', values, potential, growth: g < 0.3 ? 0 : g < 0.75 ? 1 : 2,
    apt: makeAptitude(random), style: Math.floor(random() * 4), form: 2 + Math.floor(random() * 3),
    fatigue: 0, injury: 0, level: 0, wins: 0, starts: 0, earnings: 0, rarity: quality,
  };
}

export const makeMarket = (time: number) =>
  Array.from({ length: 3 }, (_, i) => makeHorse('market-' + time + '-' + i, horseNames[(time + i + 3) % horseNames.length], i, 420 + i * 65));
export const marketPrices = [1200, 2200, 3600];

export function drawHorse(): Horse {
  const roll = Math.random();
  const quality = roll < 0.1 ? 2 : roll < 0.4 ? 1 : 0;
  return makeHorse(crypto.randomUUID(), horseNames[Math.floor(Math.random() * horseNames.length)], quality, 400 + quality * 100);
}

export function initialGame(): Game {
  const horses: Horse[] = [
    { ...makeHorse('starter-1', 'アオバストライド', 1, 540), values: [724, 638, 587, 655, 522, 609], potential: [1020, 960, 940, 1000, 900, 950], growth: 1, apt: [3, 5, 6, 4, 7, 2], style: 1, form: 4, fatigue: 14, sex: '牡' },
    { ...makeHorse('starter-2', 'ルナグレイス', 1, 500), values: [642, 704, 559, 611, 603, 575], potential: [960, 1050, 900, 940, 980, 930], growth: 2, apt: [2, 4, 6, 7, 6, 3], style: 2, form: 3, fatigue: 28, sex: '牝' },
    { ...makeHorse('starter-3', 'ノーブルゲイル', 0, 450), values: [589, 522, 680, 540, 598, 479], potential: [900, 820, 980, 860, 900, 820], growth: 0, apt: [6, 7, 4, 2, 4, 7], style: 0, form: 2, fatigue: 42, sex: '牡' },
  ];
  return {
    time: 1, points: 10000, horses, plans: {}, cards: {}, history: [],
    silks: { pattern: 1, body: '#1F6B3A', sleeve: '#C9A24B', cap: '#1F6B3A' },
    spent: 0, returned: 0, prize: 0, report: [], market: makeMarket(1),
  };
}

// ───────── カレンダー・出走条件 ─────────
export const year = (time: number) => Math.floor((time - 1) / 52) + 1;
export const week = (time: number) => ((time - 1) % 52) + 1;
export const raceKey = (time: number, race: Race) => year(time) + '-' + race.week + '-' + race.title;
export const available = (game: Game) => races.filter(r => r.week >= week(game.time) && !game.history.some(v => v.key === raceKey(game.time, r)));
export const nextRace = (game: Game) => available(game)[0];

export function eligible(horse: Horse, race: Race) {
  if (horse.retired || horse.injury || horse.fatigue >= 90 || (race.age && race.age !== horse.age)) return false;
  if (race.level === 8 && race.age === 3) return horse.wins > 0;
  return race.level <= 1 ? horse.level === race.level : horse.level === race.level || (horse.level >= 5 && race.level >= 5 && race.level <= horse.level);
}

// ───────── 成長・衰え・ケガ ─────────
const PEAK: [number, number][] = [[3, 4], [4, 5], [5, 6]];
/** 能力ごとの衰えやすさ（スピード・瞬発力は早く、賢さはほとんど衰えない） */
const DECLINE = [0.0012, 0.0006, 0.0009, 0.0012, 0.0005, 0.0003];
const FORM_TRAINING = [0.8, 0.9, 1, 1.1, 1.2];

export function growthRate(h: Horse): number {
  const [start, end] = PEAK[h.growth] ?? PEAK[1];
  if (h.age < start) return 1;
  if (h.age <= end) return 0.85;
  return Math.max(0.2, 0.55 - (h.age - end - 1) * 0.12);
}
/** 限界の8割を超えると伸びが鈍る */
const headroom = (value: number, potential: number) => {
  const ratio = value / Math.max(1, potential);
  return ratio < 0.8 ? 1 : clamp((1 - ratio) / 0.2, 0.05, 1);
};
/** ケガのしやすさ：疲労35%を超えると急増、高齢でも増える */
export const injuryFactor = (fatigue: number, age: number) =>
  (1 + Math.max(0, fatigue - 35) / 15) ** 2 * (age >= 7 ? 1 + (age - 6) * 0.15 : 1);

const INJURIES: [string, number, number][][] = [
  [['ソエ', 1, 2], ['打撲', 1, 3], ['挫石', 1, 2]],
  [['捻挫', 4, 7], ['筋肉痛（コズミ）', 3, 5], ['球節炎', 5, 9]],
  [['骨折', 12, 20], ['屈腱炎', 16, 24]],
];
function rollInjury(fatigue: number, random: Random): { name: string; weeks: number } {
  const bias = fatigue / 100;
  const r = random();
  const tier = r < 0.68 - bias * 0.25 ? 0 : r < 0.95 - bias * 0.1 ? 1 : 2;
  const list = INJURIES[tier];
  const [name, min, max] = list[Math.floor(random() * list.length)];
  return { name, weeks: min + Math.floor(random() * (max - min + 1)) };
}

type WeekLog = { injury?: string };
function trainWeek(h: Horse, sequence: number[], raceWeek: boolean, random: Random): { horse: Horse; log: WeekLog } {
  const log: WeekLog = {};
  if (h.injury) {
    // 休養中：疲労回復、長期休養は少し能力が落ちる
    const left = h.injury - 1;
    const values = h.injury > 4 ? h.values.map(v => Math.round(v * 0.998)) : h.values;
    return { horse: { ...h, values, injury: left, injuryName: left ? h.injuryName : undefined, recovery: left === 0, rehab: 0, fatigue: Math.max(0, h.fatigue - 40), form: Math.min(h.form, 2) }, log };
  }
  let fatigue = h.fatigue;
  const gains = [0, 0, 0, 0, 0, 0];
  let injury = 0;
  let injuryName: string | undefined;
  const rate = growthRate(h) * (FORM_TRAINING[h.form] ?? 1);
  for (const index of sequence) {
    const m = menus[index] ?? menus[5];
    fatigue = clamp(fatigue + m.fatigue, 0, 100);
    const tired = fatigue > 60 ? 1 - (fatigue - 60) / 80 : 1;
    const luck = 0.85 + random() * 0.3;
    m.gain.forEach((g, i) => {
      if (g) gains[i] += g * rate * tired * luck * headroom(h.values[i] + gains[i], h.potential[i]);
    });
    if (m.risk > 0 && random() < m.risk * injuryFactor(fatigue, h.age)) {
      const hurt = rollInjury(fatigue, random);
      injury = hurt.weeks;
      injuryName = hurt.name;
      log.injury = hurt.name + '（全治' + hurt.weeks + '週）';
      break;
    }
  }
  // 年齢による衰え
  const [, peakEnd] = PEAK[h.growth] ?? PEAK[1];
  const over = Math.max(0, h.age - peakEnd);
  const values = h.values.map((v, i) => {
    const decline = over ? v * DECLINE[i] * over : 0;
    const raw = v + gains[i] - decline;
    return clamp(Math.floor(raw + random()), 0, STAT_MAX);
  });
  // 調子：疲労・調整・平均への回帰
  const adjusted = sequence.includes(6) && raceWeek;
  const score = random() * 2 - 1 + (fatigue < 25 ? 0.3 : 0) - (fatigue > 65 ? 0.7 : 0) + (adjusted ? 0.7 : 0) + (2 - h.form) * 0.15;
  const form = injury ? Math.max(0, h.form - 1) : clamp(h.form + (score > 0.55 ? 1 : score < -0.55 ? -1 : 0), 0, 4);
  const rehab = (h.rehab ?? 0) + 1;
  return {
    horse: { ...h, values, fatigue, form, injury, injuryName, recovery: !!h.recovery && rehab < 3, rehab },
    log,
  };
}

export function advance(game: Game, count: number, planHorse: string, random: Random = Math.random) {
  let time = game.time;
  let horses = game.horses;
  const before = horses;
  const events = new Map<string, string[]>();
  for (let i = 0; i < count; i++) {
    time++;
    const raceWeek = races.some(r => r.week === week(time));
    horses = horses.map(h => {
      const age = h.age + (week(time) === 1 ? 1 : 0);
      if (h.retired || age >= RETIRE_AGE) return { ...h, age, retired: true };
      const sequence = i === 0 || h.id === planHorse ? game.plans[h.id] ?? defaultPlan : Array(7).fill(5);
      const { horse, log } = trainWeek({ ...h, age }, sequence, raceWeek, random);
      if (log.injury) events.set(h.id, [...(events.get(h.id) ?? []), 'ケガ：' + log.injury]);
      return horse;
    });
  }
  const report = horses.filter((h, i) => !before[i]?.retired).map(h => {
    const old = before.find(v => v.id === h.id) ?? h;
    const gains = h.values.map((value, i) => (value !== old.values[i] ? stats[i] + (value > old.values[i] ? ' +' : ' ') + (value - old.values[i]) : '')).filter(Boolean).join('・');
    const status = h.retired ? '引退' : forms[h.form] + '・疲労 ' + h.fatigue + '%';
    const injury = h.injury ? '休養 残り' + h.injury + '週' + (h.injuryName ? '（' + h.injuryName + '）' : '') : h.recovery ? 'ケガ明け' : '';
    return h.name + '｜' + [gains, status, injury, ...(events.get(h.id) ?? [])].filter(Boolean).join(' / ');
  });
  const cards = Object.fromEntries(Object.entries(game.cards).filter(([key, card]) => {
    const race = races.find(r => raceKey(game.time, r) === key);
    return (race && year(time) === year(game.time) && race.week >= week(time)) || card.tickets.length > 0;
  }));
  return { ...game, time, horses, cards, report, market: makeMarket(time) };
}

// ───────── 出馬表 ─────────
export function field(game: Game, race: Race, registered: string | null): Entry[] {
  const random = seeded(raceKey(game.time, race));
  const active = game.horses.find(h => h.id === registered);
  const size = 8;
  const gate = Math.floor(random() * size);
  const taken = new Set(game.horses.map(h => h.name));
  const names = shuffle(random, cpuNames.filter(n => !taken.has(n)));
  const band = race.distance <= 1400 ? 0 : race.distance <= 1800 ? 1 : race.distance <= 2400 ? 2 : 3;
  return Array.from({ length: size }, (_, i) => {
    const owned = i === gate && !!active;
    const cpu = makeHorse('cpu-' + raceKey(game.time, race) + '-' + i, names[i % names.length], 0, 430 + race.level * 58, random);
    cpu.age = race.age ?? 3 + Math.floor(random() * 4);
    cpu.apt[band] = 4 + Math.floor(random() * 4);
    cpu.apt[race.surface === '芝' ? 4 : 5] = 4 + Math.floor(random() * 4);
    cpu.form = 1 + Math.floor(random() * 4);
    cpu.fatigue = Math.floor(random() * 30);
    cpu.recovery = random() < 0.08;
    cpu.level = race.level;
    const h = owned && active ? active : cpu;
    return { number: i + 1, frame: i + 1, horse: h, strength: strength(h, race), owned };
  });
}

export function cardFor(game: Game, race: Race): Card {
  const saved = game.cards[raceKey(game.time, race)];
  if (saved?.tickets.length) return saved;
  const registered = saved?.registered ?? null;
  return { registered, entries: field(game, race, registered), tickets: [] };
}

// ───────── レース開催 ─────────
const prizeTable = [450, 550, 780, 1000, 1450, 2000, 3800, 6500, 12500];
const prizeShare = [1, 0.4, 0.25, 0.15, 0.1];
const KEEP_TIMELINE = 30;

export function runRace(game: Game, race: Race, card: Card, random: Random = Math.random): { game: Game; result: Result } {
  const key = raceKey(game.time, race);
  const existing = game.history.find(r => r.key === key);
  if (existing) return { game, result: existing };

  const sim = simulateRace(race, card.entries, random);
  const order = sim.finish.map(n => card.entries.find(e => e.number === n)).filter((e): e is Entry => !!e);
  const odds = makeOdds(card.entries, card.tickets);
  const size = card.entries.length;
  const payouts = card.tickets.map(t => {
    const hit = winningCombos(t.type, sim.finish, size).some(ns => combo(t.type, ns) === combo(t.type, t.numbers));
    return hit ? Math.round(t.stake * odds(t.type, t.numbers, 0, sim.finish)) : 0;
  });
  const prizes = order.map((e, i) => (e.owned && i < prizeShare.length ? Math.round(prizeTable[race.level] * prizeShare[i]) : 0));
  const prize = prizes.reduce((a, b) => a + b, 0);
  const returned = payouts.reduce((a, b) => a + b, 0);
  const notes = [...sim.notes];
  const report: string[] = [];

  const horses = game.horses.map(h => {
    const index = order.findIndex(e => e.owned && e.horse.id === h.id);
    if (index === -1) return h;
    const fatigue = Math.min(100, h.fatigue + Math.round(12 + race.distance / 250));
    const formMove = index === 0 && random() < 0.5 ? 1 : index >= size - 2 && random() < 0.4 ? -1 : 0;
    let updated: Horse = {
      ...h,
      level: index === 0 ? Math.min(8, Math.max(race.level + 1, h.level)) : h.level === 0 ? 1 : h.level,
      wins: h.wins + Number(index === 0),
      starts: (h.starts ?? 0) + 1,
      earnings: (h.earnings ?? 0) + prizes[index],
      fatigue,
      form: clamp(h.form + formMove, 0, 4),
      recovery: false,
    };
    if (random() < 0.002 * injuryFactor(fatigue, h.age)) {
      const hurt = rollInjury(fatigue, random);
      updated = { ...updated, injury: hurt.weeks, injuryName: hurt.name };
      const line = h.name + '｜レース後に' + hurt.name + '（全治' + hurt.weeks + '週）';
      notes.push(line);
      report.push(line);
    }
    return updated;
  });

  const result: Result = {
    key, race, order, payouts, tickets: card.tickets, prize,
    times: sim.times, margins: sim.margins, timeline: sim.timeline, pace: sim.pace, notes,
    winOdds: card.entries.map(e => odds(0, [e.number])),
  };
  const cards = { ...game.cards };
  delete cards[key];
  const history = [result, ...game.history.map((r, i) => (i + 1 >= KEEP_TIMELINE && r.timeline.length ? { ...r, timeline: [] } : r))];
  return {
    result,
    game: {
      ...game, horses, cards, history,
      points: game.points + prize + returned, prize: game.prize + prize, returned: game.returned + returned,
      report: report.length ? [...report, ...game.report] : game.report,
    },
  };
}