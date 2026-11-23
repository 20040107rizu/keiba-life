// lib/breeding.ts
// 配合（ブリーディング）：種牡馬・繁殖牝馬・遺伝・インブリード・血統表
// 種牡馬の名前などの設定はこのファイル上部にまとめています（すべて架空の馬名）。
import { STAT_MAX, STABLE_LIMIT, activeCount, rarity, week, year, type Game, type Horse, type Pedigree, type PedigreeNode, type Pregnancy } from './game';
import { clamp, gaussian, seeded, type Random } from './random';

// ───────── 設定 ─────────
/** 種付けシーズン（この週の範囲で種付けできる） */
export const BREEDING_SEASON: [number, number] = [5, 24];
/** 受胎から誕生までの週数（約11か月）。シーズン中に種付けすると翌年の第1〜20週（春）に生まれる */
export const GESTATION_WEEKS = 48;
/** 誕生からデビューできるまでの育成期間（週） */
export const NURSERY_WEEKS = 20;
/** 繁殖牝馬として種付けできる年齢の上限 */
export const BROODMARE_MAX_AGE = 20;
/** 仔馬は2歳として生まれる（ゲームでは当歳〜1歳の期間を省略） */
export const FOAL_AGE = 2;

/** 種牡馬の祖先（血統表の2〜3代目に出てくる架空の名馬） */
const foundation: PedigreeNode[] = [
  { id: 'root-1', name: 'ロードオブグラス' },
  { id: 'root-2', name: 'グレイトノーザン' },
  { id: 'root-3', name: 'ミスタープロスパー' },
  { id: 'root-4', name: 'サンライズクラウン' },
  { id: 'root-5', name: 'ハイペリオンスター' },
  { id: 'root-6', name: 'ブルーリボンレディ' },
  { id: 'root-7', name: 'エメラルドクイーン' },
  { id: 'root-8', name: 'シルクロードマダム' },
  { id: 'root-9', name: 'スノーホワイトベル' },
  { id: 'root-10', name: 'ムーンライトソング' },
  { id: 'root-11', name: 'ダイヤモンドリリー' },
  { id: 'root-12', name: 'ワイルドフロンティア' },
  { id: 'root-13', name: 'カメリアプリンセス' },
  { id: 'root-14', name: 'スプリングメドウ' },
  { id: 'root-15', name: 'アンバーグロウ' },
  { id: 'root-16', name: 'マーメイドテイル' },
  { id: 'root-17', name: 'タイタンフォース' },
  { id: 'root-18', name: 'リトルウィッシュ' },
];
const F = (i: number) => foundation[i - 1];

type StudSpec = {
  id: string; name: string; fee: number; values: number[]; potential: number[]; apt: number[]; style: number; growth: number;
  sire: PedigreeNode; dam: PedigreeNode;
};
/** ゲームが用意する種牡馬（値は引退時の能力。fee=種付け料pt） */
const studSpecs: StudSpec[] = [
  { id: 'stud-1', name: 'グランドマエストロ', fee: 3000, values: [1010, 930, 900, 980, 950, 900], potential: [1100, 1020, 980, 1080, 1040, 980], apt: [3, 5, 7, 6, 7, 2], style: 2, growth: 1,
    sire: { id: 'sire-a', name: 'クラウンロード', sire: F(1), dam: F(6) }, dam: { id: 'dam-a', name: 'セレナーデロマン', sire: F(4), dam: F(9) } },
  { id: 'stud-2', name: 'ストームブレイカー', fee: 2200, values: [990, 780, 1000, 960, 880, 820], potential: [1080, 860, 1080, 1040, 940, 880], apt: [7, 6, 4, 2, 5, 6], style: 0, growth: 0,
    sire: { id: 'sire-b', name: 'サンダーゲート', sire: F(3), dam: F(7) }, dam: { id: 'dam-b', name: 'ハリケーンメイ', sire: F(2), dam: F(10) } },
  { id: 'stud-3', name: 'エターナルサーガ', fee: 2600, values: [920, 1060, 880, 900, 1000, 950], potential: [1000, 1150, 960, 980, 1080, 1020], apt: [1, 3, 6, 7, 7, 3], style: 1, growth: 2,
    sire: { id: 'sire-a', name: 'クラウンロード', sire: F(1), dam: F(6) }, dam: { id: 'dam-c', name: 'ロングジャーニー', sire: F(5), dam: F(8) } },
  { id: 'stud-4', name: 'アイアンフォートレス', fee: 1800, values: [900, 880, 1060, 860, 950, 840], potential: [980, 960, 1140, 940, 1020, 900], apt: [4, 6, 6, 3, 3, 7], style: 1, growth: 1,
    sire: { id: 'sire-c', name: 'ゴールドラッシュ', sire: F(3), dam: F(11) }, dam: { id: 'dam-d', name: 'デザートローズ', sire: F(12), dam: F(13) } },
  { id: 'stud-5', name: 'シルバーアロー', fee: 1200, values: [960, 820, 860, 1000, 820, 880], potential: [1040, 900, 940, 1080, 900, 940], apt: [6, 7, 5, 2, 6, 4], style: 3, growth: 1,
    sire: { id: 'sire-d', name: 'ノーザンライト', sire: F(14), dam: F(15) }, dam: { id: 'dam-e', name: 'フェアリーダンス', sire: F(1), dam: F(16) } },
  { id: 'stud-6', name: 'ヴィクトリーロード', fee: 800, values: [880, 880, 880, 880, 880, 880], potential: [960, 960, 960, 960, 960, 960], apt: [4, 6, 6, 4, 6, 5], style: 1, growth: 1,
    sire: { id: 'sire-c', name: 'ゴールドラッシュ', sire: F(3), dam: F(11) }, dam: { id: 'dam-f', name: 'ハーモニーベル', sire: F(17), dam: F(18) } },
];

export const studFee = (sireId: string) => studSpecs.find(s => s.id === sireId)?.fee ?? 0;

/** ゲームの種牡馬を Horse の形で返す（能力表示・遺伝計算に使う） */
export const studs: Horse[] = studSpecs.map(s => ({
  id: s.id, name: s.name, age: 9, sex: '牡', values: s.values, potential: s.potential, growth: s.growth, apt: s.apt, style: s.style,
  form: 2, fatigue: 0, injury: 0, level: 8, wins: 6, starts: 14, earnings: 0, rarity: 2, retired: true,
  pedigree: { sire: s.sire, dam: s.dam },
}));

// ───────── 血統 ─────────
const damNames = ['ハルカゼ', 'ユメミヅキ', 'ホシノシズク', 'サクラビジン', 'コトノハ', 'ミヤビ', 'アオイソラ', 'ヒカリノミチ', 'ナデシコ', 'シラユキ', 'カスミソウ', 'ツバキ'];
const sireNames = ['ライジングエース', 'ブレイブハート', 'ミラクルステップ', 'ダンシングキング', 'スカイハイ', 'ウィンドワード'];

/** 血統がない馬（セリ・ガチャ・初期馬）には、馬IDから決まる架空の血統をつける。
 *  ゲームの種牡馬の血を引くことがあり、その種牡馬（や同じ父系）と配合するとインブリードになる */
function syntheticPedigree(id: string): Pedigree {
  const r = seeded('pedigree:' + id);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const unique = (role: string, name: string, depth: number): PedigreeNode => {
    const n: PedigreeNode = { id: 'p' + role + '-' + id, name };
    if (depth > 0) {
      n.sire = unique(role + 's', pick(sireNames) + (depth > 1 ? '' : pick(['', 'II', 'ボーイ'])), depth - 1);
      n.dam = unique(role + 'd', pick(damNames) + pick(['', 'スター', 'ローズ', 'ムーン']), depth - 1);
    }
    return n;
  };
  const sire = r() < 0.35 ? node(pick(studs), 2) : unique('s', pick(sireNames), 2);
  const dam = unique('d', pick(damNames) + pick(['', 'スター', 'ローズ', 'ムーン']), 2);
  // 母の父がゲームの種牡馬の父（クラウンロードなど）のこともある
  if (r() < 0.3) dam.sire = node(pick(studs.map(s => pedigreeOf(s).sire)), 1);
  return { sire, dam };
}

export const pedigreeOf = (h: Horse): Pedigree => h.pedigree ?? syntheticPedigree(h.id);

/** 馬を血統表の1頭分に変換（depth 代前まで残す） */
export function node(h: Horse | PedigreeNode, depth: number): PedigreeNode {
  const p = 'values' in h ? pedigreeOf(h) : h.sire && h.dam ? { sire: h.sire, dam: h.dam } : undefined;
  const result: PedigreeNode = { id: h.id, name: h.name };
  if (depth > 0 && p) {
    result.sire = node(p.sire, depth - 1);
    result.dam = node(p.dam, depth - 1);
  }
  return result;
}

// ───────── インブリード ─────────
export type Cross = { id: string; name: string; sireSide: number; damSide: number; blood: number };
export type Inbreeding = { crosses: Cross[]; blood: number; label: string; effect: string; frailty: number; bonus: number; spread: number };

/** 祖先の一覧（gen=仔馬から見た代数。父母=1） */
function ancestors(n: PedigreeNode, gen: number, out: { id: string; name: string; gen: number }[] = []) {
  out.push({ id: n.id, name: n.name, gen });
  if (gen < 4) {
    if (n.sire) ancestors(n.sire, gen + 1, out);
    if (n.dam) ancestors(n.dam, gen + 1, out);
  }
  return out;
}

/**
 * 父と母に共通する祖先（4代前まで）を調べる。血量 = Σ(1/2)^代数（例：3×4 = 18.75%「奇跡の血量」）
 * - 血量 11〜20%：能力の振れ幅が小さくなり、限界が少し伸びる（効果）。体質はやや弱くなる
 * - 血量 20%超：限界が伸びることもあるが、振れ幅が大きく体質が弱い（ケガしやすい）
 * - 血量 30%以上（親子・きょうだい配合など）：大きなリスク
 */
export function inbreeding(sire: Horse, dam: Horse): Inbreeding {
  const a = ancestors(node(sire, 3), 1);
  const b = ancestors(node(dam, 3), 1);
  const crosses: Cross[] = [];
  for (const x of a) {
    if (crosses.some(c => c.id === x.id)) continue;
    const ys = b.filter(y => y.id === x.id);
    if (!ys.length) continue;
    const xs = a.filter(v => v.id === x.id);
    const sireSide = Math.min(...xs.map(v => v.gen));
    const damSide = Math.min(...ys.map(v => v.gen));
    // 親が共通祖先の子孫として現れるときは、近い方の祖先だけを数える
    crosses.push({ id: x.id, name: x.name, sireSide, damSide, blood: 0.5 ** sireSide + 0.5 ** damSide });
  }
  // 共通祖先の祖先は重複して数えない（例：父父が共通なら、その父も共通になるが表記は近い方だけ）
  const trees = [node(sire, 3), node(dam, 3)];
  const near = crosses.filter(c => !crosses.some(o => o !== c && trees.some(t => contains(find(t, o.id), c.id))));
  const blood = Math.min(1, near.reduce((s, c) => s + c.blood, 0));
  const pct = Math.round(blood * 1000) / 10;
  const label = near.length ? near.map(c => c.name + ' ' + c.sireSide + '×' + c.damSide).join('、') + '（' + pct + '%）' : '';
  if (!near.length) return { crosses: [], blood: 0, label: '', effect: 'アウトブリード：体質が丈夫で、能力の振れ幅は標準', frailty: 0.95, bonus: 0, spread: 1 };
  if (blood <= 0.2 && blood >= 0.11) return { crosses: near, blood, label, effect: '「奇跡の血量」に近い配合：振れ幅が小さく、限界がやや伸びやすい。体質は少し弱め', frailty: 1.15, bonus: 25, spread: 0.7 };
  if (blood < 0.11) return { crosses: near, blood, label, effect: '薄いインブリード：わずかに限界が伸びやすい', frailty: 1.05, bonus: 10, spread: 0.9 };
  if (blood < 0.3) return { crosses: near, blood, label, effect: '濃いインブリード：当たれば大物、外れると虚弱。ケガしやすい', frailty: 1.5, bonus: 20, spread: 1.6 };
  return { crosses: near, blood, label, effect: '危険な近親配合：能力が下がりやすく、とても体質が弱い', frailty: 2.2, bonus: -60, spread: 1.8 };
}

const find = (n: PedigreeNode | undefined, id: string): PedigreeNode | undefined =>
  !n ? undefined : n.id === id ? n : find(n.sire, id) ?? find(n.dam, id);
/** n の祖先（n 自身は含まない）に id がいるか */
const contains = (n: PedigreeNode | undefined, id: string): boolean =>
  !!n && [n.sire, n.dam].some(p => !!p && (p.id === id || contains(p, id)));

// ───────── 繁殖馬 ─────────
export const inSeason = (time: number) => week(time) >= BREEDING_SEASON[0] && week(time) <= BREEDING_SEASON[1];
export const isPregnant = (game: Game, damId: string) => (game.pregnancies ?? []).some(p => p.damId === damId);
/** 今シーズン、すでに種付けした牝馬か */
const matedThisYear = (game: Game, damId: string) => (game.pregnancies ?? []).some(p => p.damId === damId && year(p.matedAt) === year(game.time));

export const broodmares = (game: Game) => game.horses.filter(h => h.retired && h.sex === '牝' && h.age <= BROODMARE_MAX_AGE);
export const ownStallions = (game: Game) => game.horses.filter(h => h.retired && h.sex === '牡');
export const stallions = (game: Game) => [...ownStallions(game), ...studs];

/** 種付けできない理由（できるときは空文字） */
export function breedingBlock(game: Game, sire: Horse | undefined, dam: Horse | undefined): string {
  if (!inSeason(game.time)) return '種付けシーズンは第' + BREEDING_SEASON[0] + '〜' + BREEDING_SEASON[1] + '週です。';
  if (!dam || !sire) return '繁殖牝馬と種牡馬を選んでください。';
  if (dam.age > BROODMARE_MAX_AGE) return dam.name + 'は繁殖を引退する年齢です。';
  if (isPregnant(game, dam.id) || matedThisYear(game, dam.id)) return dam.name + 'は受胎中です。';
  if (sire.id === dam.id) return '同じ馬どうしは配合できません。';
  if (activeCount(game) + (game.pregnancies ?? []).length >= STABLE_LIMIT) return '厩舎の空きがありません（仔馬も1頭に数えます）。';
  if (game.points < studFee(sire.id)) return 'ポイントが足りません。';
  return '';
}

// ───────── 遺伝 ─────────
const foalNameParts = ['ブライト', 'ノーブル', 'ミラクル', 'スター', 'ドリーム', 'ロイヤル', 'グレイス', 'ウィング', 'ハート', 'ソング', 'ロード', 'ライト', 'フラワー', 'ブレイズ', 'クラウン'];
function foalName(sire: Horse, dam: Horse, random: Random, taken: Set<string>): string {
  for (let i = 0; i < 30; i++) {
    const head = random() < 0.5 ? dam.name.slice(0, 3 + Math.floor(random() * 2)) : foalNameParts[Math.floor(random() * foalNameParts.length)];
    const tail = foalNameParts[Math.floor(random() * foalNameParts.length)];
    const name = (head + tail).slice(0, 9);
    if (!taken.has(name) && name !== sire.name && name !== dam.name) return name;
  }
  return dam.name.slice(0, 4) + 'ジュニア' + Math.floor(random() * 90 + 10);
}

/** 遺伝の元になる能力：成長限界6割＋引退時の能力4割 */
const genetic = (h: Horse, i: number) => 0.6 * h.potential[i] + 0.4 * h.values[i];

/** 種付け：仔馬の能力・適性・脚質を決める */
export function makeFoal(game: Game, sire: Horse, dam: Horse, random: Random = Math.random): Horse {
  const ib = inbreeding(sire, dam);
  const id = 'foal-' + game.time + '-' + Math.floor(random() * 1e9).toString(36);
  const potential = Array.from({ length: 6 }, (_, i) => {
    // 両親の平均（ややランダムにどちらかへ寄る）＋全体平均への回帰＋振れ幅
    const w = 0.3 + random() * 0.4;
    const parent = w * genetic(sire, i) + (1 - w) * genetic(dam, i);
    const value = 0.85 * parent + 0.15 * 950 + gaussian(random) * 55 * ib.spread + ib.bonus;
    return clamp(Math.round(value), 650, STAT_MAX);
  });
  const values = potential.map(p => Math.round(p * (0.33 + random() * 0.05)));
  // 適性：両親の平均＋ブレ。インブリードで振れ幅が変わる
  const apt = Array.from({ length: 6 }, (_, i) => clamp(Math.round((sire.apt[i] + dam.apt[i]) / 2 + gaussian(random) * 0.8 * ib.spread), 0, 7));
  // 脚質：父か母のどちらか。まれに隣の脚質
  const roll = random();
  const base = roll < 0.45 ? sire.style : roll < 0.9 ? dam.style : Math.floor(random() * 4);
  const style = random() < 0.12 ? clamp(base + (random() < 0.5 ? -1 : 1), 0, 3) : base;
  const growth = random() < 0.4 ? sire.growth : random() < 0.75 ? dam.growth : Math.floor(random() * 3);
  const avg = potential.reduce((a, b) => a + b, 0) / 6;
  const frailty = Math.round(ib.frailty * (0.9 + random() * 0.2) * 100) / 100;
  const taken = new Set([...game.horses.map(h => h.name), ...(game.pregnancies ?? []).map(p => p.foal.name)]);
  return {
    id, name: foalName(sire, dam, random, taken), age: FOAL_AGE, sex: random() < 0.5 ? '牡' : '牝',
    values, potential, growth, apt, style, form: 2, fatigue: 0, injury: 0, level: 0, wins: 0, starts: 0, earnings: 0,
    rarity: avg >= 1040 ? 2 : avg >= 960 ? 1 : 0,
    pedigree: { sire: node(sire, 2), dam: node(dam, 2) },
    frailty, inbreed: ib.label || undefined,
    foalUntil: 0, // 誕生時に設定し直す
  };
}

/** 種付けする。受胎して、GESTATION_WEEKS 後に誕生する */
export function breed(game: Game, sire: Horse, dam: Horse, random: Random = Math.random): Game {
  const block = breedingBlock(game, sire, dam);
  if (block) throw new Error(block);
  const foal = makeFoal(game, sire, dam, random);
  const dueTime = game.time + GESTATION_WEEKS;
  const pregnancy: Pregnancy = {
    id: 'preg-' + foal.id, damId: dam.id, sireId: sire.id, sireName: sire.name, damName: dam.name,
    matedAt: game.time, dueTime, foal: { ...foal, foalUntil: dueTime + NURSERY_WEEKS },
  };
  return { ...game, points: game.points - studFee(sire.id), pregnancies: [...(game.pregnancies ?? []), pregnancy] };
}

/** 配合前の目安（どの能力が伸びそうか）。実際の値は種付けで決まる */
export function previewFoal(sire: Horse, dam: Horse) {
  const ib = inbreeding(sire, dam);
  const potential = Array.from({ length: 6 }, (_, i) => Math.round(0.85 * (genetic(sire, i) + genetic(dam, i)) / 2 + 0.15 * 950 + ib.bonus));
  const avg = potential.reduce((a, b) => a + b, 0) / 6;
  const apt = Array.from({ length: 6 }, (_, i) => Math.round((sire.apt[i] + dam.apt[i]) / 2));
  return { potential, apt, rank: rarity[avg >= 1040 ? 2 : avg >= 960 ? 1 : 0], range: Math.round(55 * ib.spread * 2), inbreeding: ib };
}

/** 年齢の表示（育成中の仔馬は「仔馬」） */
export const ageLabel = (h: Horse) => (h.foalUntil !== undefined ? '仔馬' : h.age + '歳');
/** 引退馬の表示 */
export const retiredLabel = (h: Horse) => (h.sex === '牝' ? (h.age <= BROODMARE_MAX_AGE ? '繁殖牝馬' : '功労馬') : h.sex === '牡' ? '種牡馬' : '引退');
