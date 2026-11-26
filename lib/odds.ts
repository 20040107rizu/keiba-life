import { YEN_PER_POINT } from './economy';
// lib/odds.ts
// 馬券・オッズ：パリミュチュエル方式（CPUの仮想票 ＋ プレイヤーの票 − 控除率）
import type { Entry, Ticket } from './game';
import { gaussian, seeded } from './random';

export const types = ['単勝', '複勝', '枠連', '馬連', 'ワイド', '馬単', '三連複', '三連単'];
export const picks = [1, 1, 2, 2, 2, 2, 3, 3];
/** JRAに準じた控除率 */
export const takeout = [0.2, 0.2, 0.225, 0.225, 0.225, 0.25, 0.25, 0.275];
/** CPU票の総額（券種ごと） */
const CPU_POOL = [500000, 400000, 150000, 800000, 300000, 600000, 900000, 1500000];
/** 人気の偏り（1未満で穴馬が実力より少し売れる＝現実の「本命・大穴バイアス」） */
const VOTE_SHARPNESS = 0.85;
/** CPUの予想の鋭さ（小さいほど能力差に敏感） */
const VOTE_TEMPERATURE = 65;

export const ordered = (type: number) => type === 5 || type === 7;
export const combo = (type: number, numbers: number[]) =>
  (ordered(type) ? numbers : [...numbers].sort((a, b) => a - b)).join('-');

/** 馬番→枠番（8頭以下は馬番＝枠番、9頭以上は外枠から2頭ずつ） */
export function frameOf(number: number, size: number): number {
  if (size <= 8) return number;
  const singles = 16 - size;
  return number <= singles ? number : singles + Math.ceil((number - singles) / 2);
}

/** 着順から、その券種の的中となる組み合わせ一覧 */
export function winningCombos(type: number, finish: number[], size: number): number[][] {
  const [a, b, c] = finish;
  const f = (n: number) => frameOf(n, size);
  switch (type) {
    case 0: return [[a]];
    case 1: return (size >= 8 ? [a, b, c] : [a, b]).map(n => [n]);
    case 2: return [[f(a), f(b)]];
    case 3: return [[a, b]];
    case 4: return [[a, b], [a, c], [b, c]];
    case 5: return [[a, b]];
    default: return [[a, b, c]];
  }
}

/** CPUが考える各馬の勝率（能力・調子・実績＋予想のブレ） */
export function publicWinProbabilities(entries: Entry[]): number[] {
  const random = seeded('votes:' + entries.map(e => e.horse.id + '@' + e.number).join('|'));
  const scores = entries.map(e => e.strength + gaussian(random) * 14 + Math.min(e.horse.wins, 6) * 3 - (e.horse.recovery ? 8 : 0));
  const max = Math.max(...scores);
  const weights = scores.map(s => Math.exp((s - max) / VOTE_TEMPERATURE));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

function cpuPools(entries: Entry[]): Map<string, number>[] {
  const p = publicWinProbabilities(entries);
  const size = entries.length;
  const probabilities = types.map(() => new Map<string, number>());
  // 上位3頭（少頭数なら頭数分）の着順の全パターンを、ハービル式で確率計算
  const depth = Math.min(3, size);
  const visit = (chosen: number[], q: number, used: number) => {
    if (chosen.length === depth) {
      const finish = chosen.map(i => entries[i].number);
      for (let type = 0; type < types.length; type++) {
        if (picks[type] > depth) continue;
        for (const numbers of winningCombos(type, finish, size)) {
          if (numbers.some(n => n === undefined)) continue;
          const key = combo(type, numbers);
          probabilities[type].set(key, (probabilities[type].get(key) ?? 0) + q);
        }
      }
      return;
    }
    for (let i = 0; i < size; i++) {
      if (chosen.includes(i)) continue;
      visit([...chosen, i], q * (p[i] / Math.max(1e-9, 1 - used)), used + p[i]);
    }
  };
  visit([], 1, 0);
  return probabilities.map((map, type) => {
    const list = Array.from(map);
    const weights = list.map(([, q]) => Math.max(q, 1e-7) ** VOTE_SHARPNESS);
    const total = weights.reduce((a, b) => a + b, 0);
    return new Map(list.map(([key], i) => [key, Math.max(100, Math.round((CPU_POOL[type] * weights[i]) / total / 100) * 100) * YEN_PER_POINT]));
  });
}

export type OddsFunction = (type: number, numbers: number[], extra?: number, finish?: number[], bound?: 'min' | 'max') => number;

/**
 * オッズ計算。戻り値の関数は「100円あたりの払戻倍率」を返す。
 * - extra: これから買う金額（購入後のオッズを試算）
 * - finish: 確定着順（複勝・ワイドは他の的中組の票数で配当が変わるため）
 * - bound: 確定前の複勝・ワイドは幅があるので下限(min)か上限(max)か
 * 組み合わせが存在しなければ 0 を返す。
 */
export function makeOdds(entries: Entry[], tickets: Ticket[]): OddsFunction {
  const pools = cpuPools(entries);
  for (const ticket of tickets) {
    const map = pools[ticket.type];
    if (!map) continue;
    const key = combo(ticket.type, ticket.numbers);
    map.set(key, (map.get(key) ?? 0) + ticket.stake);
  }
  const totals = pools.map(map => Array.from(map.values()).reduce((a, b) => a + b, 0));
  const size = entries.length;
  const numbers = entries.map(e => e.number);
  const toOdds = (x: number) => Math.max(1, Math.floor(x * 10 + 1e-9) / 10);

  return (type, picked, extra = 0, finish, bound = 'min') => {
    const map = pools[type];
    if (!map || picked.length !== picks[type]) return 0;
    const key = combo(type, picked);
    const base = map.get(key);
    if (base === undefined) return 0;
    const own = base + extra;
    const net = (totals[type] + extra) * (1 - takeout[type]);
    if (type !== 1 && type !== 4) return toOdds(net / own);

    // 複勝・ワイド：(控除後の総額 − 的中票の合計) を的中組数で等分して上乗せ
    const stakeOf = (ns: number[]) => {
      const k = combo(type, ns);
      return (map.get(k) ?? 0) + (k === key ? extra : 0);
    };
    const payoutFor = (winning: number[][]) => {
      const winStake = winning.reduce((sum, ns) => sum + stakeOf(ns), 0);
      return toOdds(1 + Math.max(0, net - winStake) / winning.length / own);
    };
    if (finish) return payoutFor(winningCombos(type, finish, size));
    const others = numbers.filter(n => !picked.includes(n));
    const scenarios: number[][][] = [];
    if (type === 1) {
      for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
        scenarios.push(size >= 8 ? [[picked[0]], [others[i]], [others[j]]] : [[picked[0]], [others[i]]]);
      }
    } else {
      for (const z of others) scenarios.push([[picked[0], picked[1]], [picked[0], z], [picked[1], z]]);
    }
    if (!scenarios.length) return payoutFor([[picked[0]]]);
    const values = scenarios.map(payoutFor);
    return bound === 'max' ? Math.max(...values) : Math.min(...values);
  };
}

/** 単勝オッズ順の人気（馬番→人気順位） */
export function popularity(entries: Entry[], odds: OddsFunction): Map<number, number> {
  const list = entries.map(e => ({ n: e.number, o: odds(0, [e.number]) })).sort((a, b) => a.o - b.o);
  return new Map(list.map((x, i) => [x.n, i + 1]));
}