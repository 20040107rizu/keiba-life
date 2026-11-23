// lib/league.ts
// リーグ（友だち対戦）の計算部分。通信はしない（lib/online.ts が Firebase とやりとりする）
import { eligible, prizeFor, raceKey, strength, type Card, type Entry, type Game, type Horse, type Result, type Silks } from './game';
import { seeded, shuffle } from './random';
import type { Race } from './races';
import type { Summary } from './ranking';

/** 友だちの厩舎の最新データ（Firestore の leagues/{id}/stables/{uid}） */
export type StableSnapshot = { userId: string; nickname: string; silks?: Silks; horses: Horse[]; summary: Summary; gameTime: number; updatedAt: number };

/** 1レースに入る友だちの馬の上限（全体）と、1人あたりの上限 */
const MAX_FRIEND_RUNNERS = 5;
const MAX_PER_FRIEND = 2;

export const friendHorseId = (userId: string, horseId: string) => 'friend:' + userId + ':' + horseId;
const friendEntry = (base: Entry, f: StableSnapshot, h: Horse, race: Race): Entry => {
  const horse = { ...h, id: friendHorseId(f.userId, h.id) };
  return { number: base.number, frame: base.frame, horse, strength: strength(horse, race), owned: false, ownerId: f.userId, owner: f.nickname };
};

/**
 * 出馬表に友だちの馬を入れる。
 * - 馬券を買う前：出走条件を満たす友だちの馬を、CPU馬の枠に入れる（並びはレースごとに固定）
 * - 馬券を買った後：出走表は確定。友だちの馬のデータだけ最新に差し替える（＝いつも最新の状態で走る）
 */
export function withFriends(game: Game, race: Race, card: Card, friends: StableSnapshot[]): Card {
  if (!friends.length) return card;
  if (card.tickets.length) {
    const entries = card.entries.map(e => {
      if (!e.ownerId) return e;
      const f = friends.find(v => v.userId === e.ownerId);
      const latest = f?.horses.find(h => friendHorseId(f.userId, h.id) === e.horse.id);
      return f && latest ? friendEntry(e, f, latest, race) : e;
    });
    return { ...card, entries };
  }
  const random = seeded('league:' + raceKey(game.time, race));
  const candidates = shuffle(random, friends.flatMap(f =>
    shuffle(random, f.horses.filter(h => eligible(h, race))).slice(0, MAX_PER_FRIEND).map(h => ({ f, h })),
  )).slice(0, MAX_FRIEND_RUNNERS);
  const slots = shuffle(random, card.entries.filter(e => !e.owned).map(e => e.number));
  const byNumber = new Map(candidates.map((c, i) => [slots[i], c]));
  return {
    ...card,
    entries: card.entries.map(e => {
      const c = byNumber.get(e.number);
      return c && !e.owned ? friendEntry(e, c.f, c.h, race) : e;
    }),
  };
}

/** 友だちの馬が獲った賞金（持ち主に届ける） */
export type FriendPrize = { toUser: string; horseId: string; horseName: string; raceTitle: string; rank: number; prize: number };
export function friendPrizes(result: Result): FriendPrize[] {
  return result.order.flatMap((e, rank) => {
    const prize = prizeFor(result.race.level, rank);
    if (!e.ownerId || !prize) return [];
    const horseId = e.horse.id.split(':').slice(2).join(':');
    return [{ toUser: e.ownerId, horseId, horseName: e.horse.name, raceTitle: result.race.title, rank: rank + 1, prize }];
  });
}

/** リーグに共有するレース結果（軽量版） */
export type SharedResult = {
  id: string; userId: string; nickname: string; createdAt: number;
  key: string; title: string; level: number; venue: string; surface: string; distance: number;
  order: { number: number; name: string; owner: string | null }[];
  time: number; prize: number;
  tickets: { type: number; numbers: number[]; stake: number; payout: number }[];
};
export function sharedResult(result: Result, nickname: string): Omit<SharedResult, 'id' | 'userId' | 'createdAt'> {
  return {
    nickname, key: result.key, title: result.race.title, level: result.race.level,
    venue: result.race.venue, surface: result.race.surface, distance: result.race.distance,
    order: result.order.map(e => ({ number: e.number, name: e.horse.name, owner: e.owned ? nickname : e.owner ?? null })),
    time: result.times[0] ?? 0, prize: result.prize,
    tickets: result.tickets.map((t, i) => ({ ...t, payout: result.payouts[i] ?? 0 })),
  };
}

/** 届いた賞金を自分のゲームに反映する */
export type ReceivedPrize = FriendPrize & { fromNickname: string };
export function applyPrizes(game: Game, prizes: ReceivedPrize[]): Game {
  if (!prizes.length) return game;
  const total = prizes.reduce((s, p) => s + p.prize, 0);
  const horses = game.horses.map(h => {
    const won = prizes.filter(p => p.horseId === h.id).reduce((s, p) => s + p.prize, 0);
    return won ? { ...h, earnings: h.earnings + won } : h;
  });
  const lines = prizes.map(p => p.horseName + '｜' + p.fromNickname + 'さんの「' + p.raceTitle + '」で' + p.rank + '着（賞金 ' + p.prize.toLocaleString('ja-JP') + ' pt）');
  return { ...game, horses, points: game.points + total, prize: game.prize + total, report: [...lines, ...game.report] };
}

/** リーグに公開する馬（現役馬のみ。育成中・引退馬は出さない） */
export const publicHorses = (game: Game) => game.horses.filter(h => !h.retired && h.foalUntil === undefined);
