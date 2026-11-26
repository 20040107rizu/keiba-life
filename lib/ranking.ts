// lib/ranking.ts
// ランキング（仕様書9章の6種）。ひとり用は自分の記録だけ、リーグでは友だちの集計と並べる
import type { Game, Horse } from './game';

export const rankingKinds = ['総獲得賞金', 'G1勝利数', '最強馬', '馬券回収率', '最高配当', '今週の注目馬'] as const;

export type HorseScore = { id: string; name: string; total: number; streak: number; growth: number; score: number };
/** リーグに公開する成績の集計（stables.summary に保存） */
export type Summary = {
  prize: number; g1: number; spent: number; returned: number; bestPayout: number;
  /** 能力合計の上位馬 */
  strongest: HorseScore[];
  /** 注目度（連勝・最近の成長）の上位馬 */
  hot: HorseScore[];
};

export const totalOf = (h: Horse) => h.values.reduce((a, b) => a + b, 0);

/** 連勝数と、直近3走前からの能力合計の伸びで「注目度」を出す */
export function horseScores(game: Game): HorseScore[] {
  return game.horses.filter(h => !h.retired && h.foalUntil === undefined).map(h => {
    const runs = game.history.filter(r => r.order.some(e => e.owned && e.horse.id === h.id));
    let streak = 0;
    for (const r of runs) {
      if (r.order[0]?.owned && r.order[0].horse.id === h.id) streak++;
      else break;
    }
    const past = runs.slice(0, 3).at(-1)?.order.find(e => e.owned && e.horse.id === h.id)?.horse;
    const total = totalOf(h);
    const growth = past ? total - totalOf(past) : 0;
    return { id: h.id, name: h.name, total, streak, growth, score: streak * 120 + Math.max(0, growth) };
  });
}

export function summarize(game: Game): Summary {
  const scores = horseScores(game);
  return {
    prize: game.prize,
    g1: game.history.filter(r => r.race.level === 8 && r.order[0]?.owned).length,
    spent: game.spent,
    returned: game.returned,
    bestPayout: Math.max(0, ...game.history.flatMap(r => r.payouts)),
    strongest: [...scores].sort((a, b) => b.total - a.total).slice(0, 3),
    hot: [...scores].filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3),
  };
}

export type Player = { userId: string; nickname: string; summary: Summary };
export type RankRow = { key: string; title: string; sub: string; value: string; me: boolean };

const yen = (n: number) => n.toLocaleString('ja-JP') + '円';
const recovery = (s: Summary) => (s.spent ? s.returned / s.spent : -1);

/** kind（rankingKinds の番号）ごとのランキング行。meId の行に me=true */
export function rankRows(kind: number, players: Player[], meId: string): RankRow[] {
  const by = <T,>(list: T[], value: (x: T) => number) => [...list].sort((a, b) => value(b) - value(a));
  const row = (p: Player, value: string, sub = ''): RankRow => ({ key: p.userId, title: p.nickname, sub, value, me: p.userId === meId });
  switch (kind) {
    case 0: return by(players, p => p.summary.prize).map(p => row(p, yen(p.summary.prize)));
    case 1: return by(players, p => p.summary.g1).map(p => row(p, p.summary.g1 + '勝'));
    case 3: return by(players, p => recovery(p.summary)).map(p => row(p, p.summary.spent ? (recovery(p.summary) * 100).toFixed(1) + '%' : '—', '購入 ' + yen(p.summary.spent)));
    case 4: return by(players, p => p.summary.bestPayout).map(p => row(p, yen(p.summary.bestPayout)));
    default: {
      // 馬ごとのランキング（最強馬・注目馬）
      const horses = players.flatMap(p => (kind === 2 ? p.summary.strongest : p.summary.hot).map(h => ({ p, h })));
      return by(horses, x => (kind === 2 ? x.h.total : x.h.score)).slice(0, 10).map(({ p, h }) => ({
        key: p.userId + h.id, title: h.name, me: p.userId === meId,
        sub: p.nickname + (kind === 5 ? '・' + [h.streak ? h.streak + '連勝中' : '', h.growth > 0 ? '能力 +' + h.growth : ''].filter(Boolean).join('・') : ''),
        value: kind === 2 ? h.total.toLocaleString('ja-JP') : '注目度 ' + h.score,
      }));
    }
  }
}
