import { courseGrade } from './course-data';
import { jockeyOf } from './jockeys';
// lib/race-engine.ts
// レース計算エンジン：能力・適性・脚質・調子・疲労・枠順・展開・ランダムから着順とタイムを決める
import type { Entry, Horse } from './game';
import { venueOf, type Race } from './races';
import { clamp, gaussian, type Random } from './random';

/** 適性 G,F,E,D,C,B,A,S ごとの速度倍率 */
export const APT_SPEED = [0.945, 0.96, 0.972, 0.982, 0.99, 0.996, 1, 1.003];
/** 調子 絶不調〜絶好調 ごとの能力倍率 */
export const FORM_STAT = [0.94, 0.97, 1, 1.03, 1.05];

/** 脚質ごとの道中の速さ（後ろの馬ほど脚をためる） */
const STYLE_CRUISE = [1, 0.995, 0.99, 0.985];
/** 脚質ごとの仕掛けの早さ(m)：後ろの馬ほど早めに動く */
const STYLE_EARLY = [0, 10, 25, 40];
/** 同じ能力なら平均ペースでわずかに前が有利（m換算の不利） */
const STYLE_BIAS = [0, 0, 0, 0];
/** 馬群の後ろで脚をためるほど道中のスタミナ消費が少ない */
const STYLE_SAVE = [1, 0.985, 0.97, 0.96];
/** ペースの影響：ハイペースは前が苦しく後ろが伸びる、スローはその逆 */
const PACE_EFFECT = [1, 0.5, -0.5, -1];
/** 着差の換算（1馬身 ≒ 0.18秒） */
const SECONDS_PER_LENGTH = 0.18;
/** その日の出来のブレ（速度の標準偏差） */
const DAY_NOISE = 0.011;

export type RaceSnapshot = { t: number; d: number[] };
export type RaceSimulation = {
  /** 着順（馬番） */
  finish: number[];
  /** 着順ごとの走破タイム（秒） */
  times: number[];
  finishTimes: number[];
  /** 着順ごとの前の馬との着差（1着は空文字） */
  margins: string[];
  /** 実況用の途中経過。d は馬番-1 の位置に走った距離(m) */
  timeline: RaceSnapshot[];
  /** -1(スロー)〜1(ハイペース) */
  pace: number;
  notes: string[];
};

export const distanceBand = (d: number) => (d <= 1400 ? 0 : d <= 1800 ? 1 : d <= 2400 ? 2 : 3);
const surfaceIndex = (race: Race) => (race.surface === '芝' ? 4 : 5);
const staminaNeed = (d: number) => 150 + d * 0.18;
const baseSpeed = (race: Race) =>
  race.surface === '芝' ? 17.4 - (race.distance - 1200) * 0.00055 : 16.8 - (race.distance - 1200) * 0.0005;
/** スピードとパワーから見た地力（ダートはパワー寄り）。s は 1000 で割った値 */
const abilityOf = (s: number[], race: Race) => (race.surface === '芝' ? 0.65 * s[0] + 0.35 * s[2] : 0.5 * s[0] + 0.5 * s[2]);

export function conditionFactor(h: Horse) {
  return (FORM_STAT[h.form] ?? 1) * (1 - Math.max(0, h.fatigue - 30) * 0.001) * (h.recovery ? 0.97 : 1);
}
export function aptitudeFactor(h: Horse, race: Race) {
  return (APT_SPEED[h.apt[distanceBand(race.distance)]] ?? 0.95) * (APT_SPEED[h.apt[surfaceIndex(race)]] ?? 0.95);
}
const scaled = (h: Horse) => {
  const c = conditionFactor(h);
  return h.values.map(v => (v * c) / 1000);
};

/** 出走時点の総合力の目安（CPUの予想・オッズに使用）。おおむね 400〜1100 */
export function strength(h: Horse, race: Race): number {
  const s = scaled(h);
  const hp = (300 + s[1] * 1000) / (300 + staminaNeed(race.distance));
  const value =
    abilityOf(s, race) * 1000 +
    (aptitudeFactor(h, race) - 1) * 10000 +
    (s[3] - 0.8) * 140 +
    (s[4] - 0.8) * 30 +
    (s[5] - 0.8) * 40 +
    Math.min(0, hp - 1) * 700 +
    clamp(hp - 1, 0, 0.15) * 120;
  return Math.round(value);
}

type Runner = {
  entry: Entry;
  number: number;
  s: number[];
  vMax: number;
  cruise: number;
  spurt: number;
  fade: number;
  accel: number;
  startAccel: number;
  opening: number;
  attackAt: number;
  attackSpan: number;
  attack: number;
  hp: number;
  scale: number;
  delay: number;
  spurtStart: number;
  save: number;
  blockAt: number;
  blockLeft: number;
  pos: number;
  v: number;
  finish?: number;
};

export const paceLabel = (pace: number) => (pace > 0.35 ? 'ハイペース' : pace < -0.35 ? 'スローペース' : '平均ペース');

export function marginLabel(lengths: number): string {
  if (lengths < 0.02) return '同着';
  const table: [number, string][] = [
    [0.08, 'ハナ'], [0.18, 'アタマ'], [0.35, 'クビ'], [0.625, '1/2'], [0.875, '3/4'], [1.125, '1'],
    [1.375, '1 1/4'], [1.625, '1 1/2'], [1.875, '1 3/4'], [2.25, '2'], [2.75, '2 1/2'], [3.25, '3'],
    [3.75, '3 1/2'], [4.5, '4'], [5.5, '5'], [6.5, '6'], [7.5, '7'], [8.5, '8'], [9.5, '9'], [10, '10'],
  ];
  return table.find(([max]) => lengths < max)?.[1] ?? '大差';
}

export function formatTime(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const rest = (seconds - m * 60).toFixed(1).padStart(4, '0');
  return m + ':' + rest;
}

export function simulateRace(race: Race, entries: Entry[], random: Random = Math.random): RaceSimulation {
  const D = race.distance;
  const venue = venueOf(race);
  const straight = venue.straight;
  const v0 = baseSpeed(race);
  const n = entries.length;
  const notes: string[] = [];
  const baseSpurt = clamp(straight + 100, 300, D * 0.45);

  // 展開：逃げ・先行が多いほどハイペースになりやすい
  const fronts = entries.filter(e => e.horse.style === 0).length;
  const stalkers = entries.filter(e => e.horse.style === 1).length;
  const pace = clamp((fronts - 1.3) * 0.35 + (stalkers - 2) * 0.08 + gaussian(random) * 0.3, -1, 1);
  notes.push(paceLabel(pace));

  const runners: Runner[] = entries.map(e => {
    const h = e.horse;
    const jockey = jockeyOf(e.jockeyId);
    const s = scaled(h);
    const style = clamp(h.style, 0, 3);
    const vMax = v0 * (1 + 0.1 * (abilityOf(s, race) - 0.9)) * aptitudeFactor(h, race) * (1 + gaussian(random) * DAY_NOISE);
    // 枠順：外枠ほどコーナーで外を回る距離ロス（前に行く馬ほど影響大）。差し・追込は直線で外に持ち出すロス
    const gateFrac = n > 1 ? (e.number - 1) / (n - 1) : 0;
    const extra = gateFrac * (D <= 1400 ? 6 : 4) * (style <= 1 ? 1 : 0.5) + (style >= 2 ? 1.5 : 0);
    // 発馬の反応と二の脚。出遅れは序盤の実際の位置に残る。
    const reaction = random();
    const late = reaction < clamp(.10 - s[5]*.05 - jockey.start*.009, .025, .15);
    const delay = clamp(.09 + random()*.28 - jockey.start*.018 - s[5]*.055, .035, .40) + (late ? .50 + random()*.53 : 0);
    const opening = [.022,.013,-.004,-.012][style] + (random()-.5)*.042 + jockey.position*.002;
    if (late) notes.push(e.number + '番' + h.name + 'が出遅れ');
    // 内枠の差し・追込は直線で前が詰まることがある
    const blocked = style >= 2 && gateFrac < 0.5 && random() < 0.14 * (1.25 - s[5]);
    // 仕掛けどころ：賢いほどブレが小さい
    const spurtLen = Math.min(D * 0.6, baseSpurt + STYLE_EARLY[style] + (random() - 0.5) * 60 * (1.3 - s[5]));
    const cruise = STYLE_CRUISE[style];
    // 平均ペース・同能力なら脚質による差がほぼ出ないよう末脚を決め、そこにペースの影響を加える
    const k0 = 1.03 + 0.05 * (s[3] - 0.8);
    const accel = 0.35 + 0.5 * s[3];
    // 加速にかかる距離ロス（m換算）も含めて釣り合わせる
    const loss = (from: number, to: number) => ((to - from) * vMax) ** 2 / (2 * accel) / to;
    const solve = (reference: number) => clamp(spurtLen / Math.max(spurtLen / 1.15, reference - (D - spurtLen) / cruise), k0 * 0.97, 1.15);
    const reference = D - baseSpurt + baseSpurt / k0 + loss(1, k0) + STYLE_BIAS[style];
    let kick = solve(reference);
    kick = solve(reference - loss(cruise, kick));
    kick = solve(reference - loss(cruise, kick));
    const spurtStart = D - spurtLen;
    // 一瞬の末脚と長く脚を使うまくり。脚質・展開・瞬発力で仕掛けを変える。
    const sweeping = style >= 2 && random() < .35 + Math.max(0,pace)*.18;
    const attackAt = sweeping
      ? clamp(straight+150+(random()-.5)*180,220,D*.55)
      : clamp((style>=2?270:155)+(random()-.5)*170,65,D*.38);
    const attackSpan = sweeping ? 220 + random()*85 : 95 + random()*110;
    const attack = (sweeping ? .035 : .040) + s[3]*.028 + s[4]*.012 + jockey.spurt*.003 + random()*.100;

    return {
      entry: e,
      number: e.number,
      s,
      vMax,
      cruise: vMax * cruise * (1 + jockey.position * .005) * (1 + Math.max(0, pace) * 0.005 * PACE_EFFECT[style]),
      spurt: vMax * kick * (1 + jockey.spurt * .005) * (1 - 0.022 * pace * PACE_EFFECT[style]),
      save: STYLE_SAVE[style],
      fade: vMax * (0.92 + 0.04 * s[4]),
      accel,
      startAccel: (4.45 + 1.6 * s[2]) * (1 + jockey.start * .015 + (random()-.5)*.18),
      opening, attackAt, attackSpan, attack,
      hp: (300 + s[1] * 1000) / (300 + staminaNeed(D)),
      scale: D / (D + extra),
      delay,
      spurtStart,
      blockAt: blocked ? spurtStart + random() * (D - spurtStart) * 0.6 : -1,
      blockLeft: blocked ? 0.8 + random() * 0.8 : 0,
      pos: 0,
      v: 0,
    };
  });

  const dt = 0.125;
  const interval = Math.max(1.5, D / v0 / 36);
  const timeline: RaceSnapshot[] = [];
  const snap = (t: number) => {
    const d: number[] = [];
    for (const r of runners) d[r.number - 1] = Math.round(Math.min(D, r.pos) * 10) / 10;
    timeline.push({ t: Math.round(t * 100) / 100, d });
  };
  let t = 0;
  let nextSnap = 0;
  let leaderFinished = false;
  const blockedNoted = new Set<number>();

  while (runners.some(r => r.finish === undefined) && t < 900) {
    // 全馬を同じ時点の位置で比較する（馬番の処理順で有利にならないようにする）。
    const positions = runners.map(r => r.pos);
    const leaders = [...positions].sort((a,b)=>b-a);
    const leader = leaders[0];
    if (t >= nextSnap - 1e-9) {
      snap(t);
      const gap=leader-(leaders[1]??leader);
      nextSnap=t+(t<1.25?.125:t<9?.25:D-leader<500?(gap<5?.25:.5):interval);
    }
    t += dt;
    for (const [index,r] of runners.entries()) {
      if (r.finish !== undefined || t < r.delay) continue;
      const activeDt=Math.min(dt,t-r.delay);
      if(activeDt<=0)continue;
      const remaining = D - r.pos;
      let target: number;
      if (r.hp <= 0) target = r.fade;
      else if (r.pos < r.spurtStart) target = r.cruise;
      else {
        // 残りスタミナで最後まで持つ速度までしか伸びない
        const sustain = r.vMax * Math.sqrt((r.hp * D) / Math.max(1, remaining));
        target = clamp(sustain, r.fade, r.spurt);
      }
      const early = clamp(1-r.pos/235,0,1);
      const pressing = early>0 && leader-r.pos<8 && positions.some((p,i)=>i!==index&&Math.abs(p-r.pos)<5);
      const drive = early*(r.opening+(pressing?Math.max(0,r.opening)*.55:0));
      const wave = clamp((r.attackAt-remaining)/r.attackSpan,0,1);
      const attack = Math.sin(Math.PI*wave)*r.attack*clamp(r.hp*17,0,1);
      const finishEffort = clamp((180-remaining)/140,0,1) *
        clamp((r.attack-.103)*.9 + (r.s[4]-.65)*.018,-.035,.045) *
        clamp((r.hp+.035)*13,0,1);
      target *= 1 + drive + attack + finishEffort;
      // 上り坂で少し減速。下りの加速と負荷補正は、既存のペースを保てる範囲に抑える。
      const grade = courseGrade(venue, remaining);
      const uphill = Math.max(0, grade);
      target *= 1 - uphill * .005 * clamp(1.1 - r.s[2], 0, 1) + Math.min(1.7, Math.max(0, -grade)) * .0012;
      // 叩き合い：根性がある馬は競り合うと伸びる
      if (remaining < 300 && positions.some((p,i)=>i!==index && p<D && Math.abs(p-r.pos)<2.2)) {
        target *= 1 + 0.009 * r.s[4] * clamp(r.hp*10,0,1);
      }
      // 前が詰まる
      if (r.blockAt >= 0 && r.pos >= r.blockAt && r.blockLeft > 0) {
        target *= 0.93;
        r.blockLeft -= dt;
        if (!blockedNoted.has(r.number)) {
          blockedNoted.add(r.number);
          notes.push(r.number + '番' + r.entry.horse.name + 'が直線で前が詰まる');
        }
      }
      const a = r.v < r.cruise * 0.9 && r.pos < 300 ? r.startAccel : r.accel*(1+attack*15);
      r.v = r.v < target ? Math.min(target, r.v + a * activeDt) : Math.max(target, r.v - 0.8 * activeDt);
      const step = r.v * activeDt * r.scale;
      r.hp -= ((r.v / r.vMax) ** 2 * step * (r.pos < r.spurtStart ? r.save : 1) * (1 + Math.min(3, uphill) * .012 + Math.max(0,drive)*1.5 + attack*.7)) / D;
      const prev = r.pos;
      r.pos += step;
      if (r.pos >= D) r.finish = t - activeDt + ((D - prev) / step) * activeDt;
    }
    if(!leaderFinished&&runners.some(r=>r.finish!==undefined)){
      leaderFinished=true;
      if(timeline.at(-1)?.t!==t)snap(t);
      nextSnap=t+.25;
    }

  }

  const sorted = [...runners].sort((a, b) => (a.finish ?? 1e9) - (b.finish ?? 1e9));
  const finishTimes = sorted.map(r => r.finish ?? 900);
  const times = finishTimes.map(t=>Math.round(t*10)/10);
  const margins = sorted.map((r, i) => {
    if (i === 0) return '';
    const diff = (r.finish ?? 900) - (sorted[i - 1].finish ?? 900);
    return marginLabel(diff / SECONDS_PER_LENGTH);
  });
  return { finish: sorted.map(r => r.number), times, finishTimes, margins, timeline, pace, notes };
}

// ───────── 実況用のヘルパー ─────────

export type LiveRunner = { entry: Entry; distance: number; progress: number; gap: number };
type LiveSource = { race: Race; order: Entry[]; timeline?: RaceSnapshot[]; times?: number[]; finishTimes?: number[]; pace?: number; notes?: string[] };

/** ratio=0（スタート）〜1（ゴール）の時点の隊列。先頭から順に並ぶ。gap は先頭との差(m) */
export function liveOrder(result: LiveSource, ratio: number): LiveRunner[] {
  const D = result.race.distance;
  const x = clamp(ratio, 0, 1);
  const timeline = result.timeline ?? [];
  let list: LiveRunner[];
  if (timeline.length < 2) {
    list = result.order.map((entry, i) => {
      const d = D * x * (1 - i * 0.012 * x);
      return { entry, distance: d, progress: d / D, gap: 0 };
    });
  } else {
    const p = x * (timeline.length - 1);
    let i = Math.min(timeline.length - 2, Math.floor(p));
    let f = p - i;
    if(result.finishTimes?.[0]){
      const time=x*result.finishTimes[0];
      i=0;
      while(i<timeline.length-2&&timeline[i+1].t<time)i++;
      f=clamp((time-timeline[i].t)/(timeline[i+1].t-timeline[i].t),0,1);
    }
    list = result.order.map(entry => {
      const a = timeline[i].d[entry.number - 1] ?? 0;
      const b = timeline[i + 1].d[entry.number - 1] ?? a;
      const d = a + (b - a) * f;
      return { entry, distance: d, progress: d / D, gap: 0 };
    });
    if (x < 1) list.sort((a, b) => b.distance - a.distance);
  }
  const lead = Math.max(...list.map(r => r.distance));
  for (const r of list) r.gap = Math.round((lead - r.distance) * 10) / 10;
  return list;
}

/** ratio 時点の実況コメント */
export function liveComment(result: LiveSource, ratio: number): string {
  const live = liveOrder(result, ratio);
  const D = result.race.distance;
  const straight = venueOf(result.race).straight;
  const [first, second] = live;
  if (!first) return '';
  const name = (r: LiveRunner) => r.entry.number + '番' + r.entry.horse.name;
  const left = D - first.distance;
  if (ratio <= 0) {
    const late = (result.notes ?? []).find(n => n.includes('出遅れ'));
    return 'ゲートが開いてスタート！' + (late ? ' ' + late + '！' : '');
  }
  if (ratio >= 1) {
    const time = result.times?.[0];
    return result.order[0].horse.name + 'が1着でゴール！' + (time ? ' 勝ちタイム ' + formatTime(time) : '');
  }
  if (left < 200) return '残り200！ ' + name(first) + 'か、' + (second ? name(second) : '') + 'か！';
  if (left < straight) {
    const lengths = second ? second.gap / 2.6 : 0;
    return '最後の直線！ 先頭は' + name(first) + (lengths >= 1 ? '、リードは' + marginLabel(lengths) + '馬身' : '、' + (second ? name(second) : '') + 'が並びかける') + '！';
  }
  if (first.distance < D * 0.3) return '先頭は' + name(first) + '。' + paceLabel(result.pace ?? 0) + 'の流れになりそうです。';
  const last = live[live.length - 1];
  return '隊列は先頭' + name(first) + 'から最後方' + name(last) + 'まで約' + Math.max(1, Math.round(last.gap / 2.6)) + '馬身。';
}