import type { Entry, Game } from './game';

// These fees, tiers and bonuses are part of the game, not contractual data.
export const apprentice = { id: 'apprentice', name: '騎手なし（自厩舎見習い）', style: null, start: 0, position: 0, spurt: 0, fee: 0, level: 0 };
export const jockeys = [
  { id: 'take', name: '武豊', style: 0, start: 3, position: 2, spurt: 2, fee: 1_500_000, level: 8 },
  { id: 'lemaire', name: 'C.ルメール', style: 1, start: 2, position: 3, spurt: 2, fee: 1_500_000, level: 8 },
  { id: 'kawada', name: '川田将雅', style: 1, start: 3, position: 2, spurt: 2, fee: 1_400_000, level: 8 },
  { id: 'tosaki', name: '戸崎圭太', style: 2, start: 1, position: 2, spurt: 3, fee: 800_000, level: 6 },
  { id: 'takeshi', name: '横山武史', style: 1, start: 2, position: 2, spurt: 1, fee: 700_000, level: 6 },
  { id: 'sakai', name: '坂井瑠星', style: 0, start: 3, position: 2, spurt: 1, fee: 750_000, level: 6 },
  { id: 'matsuyama', name: '松山弘平', style: 1, start: 2, position: 2, spurt: 2, fee: 700_000, level: 6 },
  { id: 'iwata', name: '岩田望来', style: 2, start: 1, position: 2, spurt: 2, fee: 600_000, level: 6 },
  { id: 'sugawara', name: '菅原明良', style: 2, start: 1, position: 0, spurt: 2, fee: 300_000, level: 0 },
  { id: 'nishimura', name: '西村淳也', style: 1, start: 1, position: 2, spurt: 0, fee: 250_000, level: 0 },
  { id: 'sameshima', name: '鮫島克駿', style: 2, start: 0, position: 1, spurt: 2, fee: 200_000, level: 0 },
  { id: 'tanabe', name: '田辺裕信', style: 1, start: 0, position: 3, spurt: 1, fee: 300_000, level: 0 },
  { id: 'tsumura', name: '津村明秀', style: 2, start: 0, position: 1, spurt: 1, fee: 200_000, level: 0 },
  { id: 'tannai', name: '丹内祐次', style: 1, start: 1, position: 0, spurt: 0, fee: 100_000, level: 0 },
  apprentice,
];

const reserve = ['横山典弘','三浦皇成','浜中俊','北村友一','M.デムーロ','池添謙一','幸英明','和田竜二'];
export const automaticJockey = (number: number) => 'reserve-' + number;
export const jockeyOf = (id?: string) => jockeys.find(j => j.id === id) ?? apprentice;
export function jockeyName(entry: Entry) {
  if (!entry.owned && (!entry.jockeyId || entry.jockeyId.startsWith('reserve-'))) {
    const number = entry.jockeyId ? Number(entry.jockeyId.slice(8)) : entry.number;
    return reserve[(number - 1) % reserve.length] ?? reserve[(entry.number - 1) % reserve.length];
  }
  return jockeyOf(entry.jockeyId).name;
}
export function jockeyLock(game: Game, id: string) {
  const { level } = jockeyOf(id);
  if (!level || game.history.some(r => r.race.level >= level && r.order[0]?.owned)) return '';
  return level === 8 ? '所有馬でG1を1勝すると解放' : '所有馬で重賞を1勝すると解放';
}
