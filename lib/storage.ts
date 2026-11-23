// lib/storage.ts
// セーブ処理：バージョン付きで保存し、古いデータは順番に移行する。
// 保存先は GameStorage の実装を差し替えるだけで変えられる（将来は Supabase 版を作って setGameStorage）。
import { initialGame, makeMarket, strength, type Card, type Entry, type Game, type Horse, type PedigreeNode, type Pregnancy, type Result } from './game';
import { races } from './races';

export const SAVE_VERSION = 3;
export type SaveData = { version: number; savedAt: string; game: Game };

export interface GameStorage {
  load(): Promise<Game>;
  save(game: Game): Promise<void>;
}

// ───────── 移行処理 ─────────
type Data = Record<string, unknown>;
const isObject = (x: unknown): x is Data => typeof x === 'object' && x !== null && !Array.isArray(x);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const str = (x: unknown, fallback: string) => (typeof x === 'string' ? x : fallback);
const nums = (x: unknown, length: number, fallback: number) => Array.from({ length }, (_, i) => num(list(x)[i], fallback));

/** v1 → v2：能力に「瞬発力」を追加（4番目）、成長限界・成長型・出走数・獲得賞金、結果のタイム・展開などを追加 */
function v1HorseToV2(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const values = list(raw.values);
  if (values.length === 5) {
    const [speed, stamina, power, guts, wits] = values.map(v => num(v, 500));
    return { ...raw, values: [speed, stamina, power, Math.round((speed + power) / 2), guts, wits] };
  }
  return raw;
}
function v1ToV2(data: Data): Data {
  const fixEntry = (e: unknown) => (isObject(e) ? { ...e, horse: v1HorseToV2(e.horse), frame: num(e.frame, num(e.number, 1)) } : e);
  const cards = isObject(data.cards)
    ? Object.fromEntries(Object.entries(data.cards).map(([k, c]) => [k, isObject(c) ? { ...c, entries: list(c.entries).map(fixEntry) } : c]))
    : {};
  return {
    ...data,
    horses: list(data.horses).map(v1HorseToV2),
    market: [],
    cards,
    history: list(data.history).map(r => (isObject(r) ? { ...r, order: list(r.order).map(fixEntry) } : r)),
  };
}

/** キー＝移行元のバージョン。新しい形式を追加したらここに1つ足す */
const migrations: Record<number, (data: Data) => Data> = {
  1: v1ToV2,
  /** v2 → v3：配合（血統・仔馬・受胎）を追加。新しい項目はすべて省略可能なので、受胎リストだけ用意する */
  2: data => ({ ...data, pregnancies: list(data.pregnancies) }),
};

function sanitizeNode(raw: unknown, depth = 0): PedigreeNode | undefined {
  if (!isObject(raw) || depth > 4) return undefined;
  const result: PedigreeNode = { id: str(raw.id, 'unknown'), name: str(raw.name, '不明') };
  const sire = sanitizeNode(raw.sire, depth + 1);
  const dam = sanitizeNode(raw.dam, depth + 1);
  if (sire) result.sire = sire;
  if (dam) result.dam = dam;
  return result;
}

function sanitizeHorse(raw: unknown, index: number): Horse | null {
  if (!isObject(raw)) return null;
  const rarityValue = num(raw.rarity, 0);
  const values = nums(raw.values, 6, 500).map(v => Math.max(0, Math.min(1200, Math.round(v))));
  const ceiling = [900, 1000, 1100][rarityValue] ?? 900;
  const potential = list(raw.potential).length === 6 ? nums(raw.potential, 6, ceiling) : values.map(v => Math.min(1200, Math.max(v + 150, ceiling)));
  return {
    id: str(raw.id, 'horse-' + index),
    name: str(raw.name, '名無しの馬'),
    age: num(raw.age, 3),
    sex: str(raw.sex, '牡'),
    values,
    potential,
    growth: num(raw.growth, 1),
    apt: nums(raw.apt, 6, 3),
    style: num(raw.style, 1),
    form: Math.max(0, Math.min(4, num(raw.form, 2))),
    fatigue: Math.max(0, Math.min(100, num(raw.fatigue, 0))),
    injury: Math.max(0, num(raw.injury, 0)),
    injuryName: typeof raw.injuryName === 'string' ? raw.injuryName : undefined,
    level: Math.max(0, Math.min(8, num(raw.level, 0))),
    wins: num(raw.wins, 0),
    starts: num(raw.starts, num(raw.wins, 0)),
    earnings: num(raw.earnings, 0),
    rarity: rarityValue,
    retired: raw.retired === true ? true : undefined,
    recovery: raw.recovery === true ? true : undefined,
    rehab: typeof raw.rehab === 'number' ? raw.rehab : undefined,
    ...optionalBreeding(raw),
  };
}

function optionalBreeding(raw: Data): Partial<Horse> {
  const out: Partial<Horse> = {};
  if (isObject(raw.pedigree)) {
    const sire = sanitizeNode(raw.pedigree.sire);
    const dam = sanitizeNode(raw.pedigree.dam);
    if (sire && dam) out.pedigree = { sire, dam };
  }
  if (typeof raw.born === 'number') out.born = raw.born;
  if (typeof raw.foalUntil === 'number') out.foalUntil = raw.foalUntil;
  if (typeof raw.frailty === 'number' && Number.isFinite(raw.frailty)) out.frailty = Math.max(0.5, Math.min(3, raw.frailty));
  if (typeof raw.inbreed === 'string') out.inbreed = raw.inbreed;
  return out;
}

function sanitizePregnancy(raw: unknown, index: number): Pregnancy | null {
  if (!isObject(raw)) return null;
  const foal = sanitizeHorse(raw.foal, index);
  if (!foal) return null;
  return {
    id: str(raw.id, 'preg-' + index), damId: str(raw.damId, ''), sireId: str(raw.sireId, ''),
    sireName: str(raw.sireName, '不明'), damName: str(raw.damName, '不明'),
    matedAt: num(raw.matedAt, 1), dueTime: num(raw.dueTime, 1), foal,
  };
}

function sanitizeEntry(raw: unknown, index: number, raceTitle: string): Entry | null {
  if (!isObject(raw)) return null;
  const horse = sanitizeHorse(raw.horse, index);
  if (!horse) return null;
  const race = races.find(r => r.title === raceTitle);
  const number = num(raw.number, index + 1);
  const entry: Entry = { number, frame: num(raw.frame, number), horse, strength: num(raw.strength, race ? strength(horse, race) : 600), owned: raw.owned === true };
  if (typeof raw.ownerId === 'string') entry.ownerId = raw.ownerId;
  if (typeof raw.owner === 'string') entry.owner = raw.owner;
  return entry;
}

function sanitizeResult(raw: unknown): Result | null {
  if (!isObject(raw) || !isObject(raw.race)) return null;
  const race = raw.race as Result['race'];
  const order = list(raw.order).map((e, i) => sanitizeEntry(e, i, race.title)).filter((e): e is Entry => !!e);
  const tickets = list(raw.tickets).filter(isObject).map(t => ({ type: num(t.type, 0), numbers: list(t.numbers).map(n => num(n, 1)), stake: num(t.stake, 100) }));
  return {
    key: str(raw.key, ''),
    race,
    order,
    tickets,
    payouts: tickets.map((_, i) => num(list(raw.payouts)[i], 0)),
    prize: num(raw.prize, 0),
    times: list(raw.times).map(t => num(t, 0)),
    margins: list(raw.margins).map(m => str(m, '')),
    timeline: Array.isArray(raw.timeline) ? (raw.timeline as Result['timeline']) : [],
    pace: num(raw.pace, 0),
    notes: list(raw.notes).map(n => str(n, '')),
    winOdds: list(raw.winOdds).map(o => num(o, 0)),
  };
}

function sanitizeGame(data: Data): Game {
  const base = initialGame();
  const horses = list(data.horses).map(sanitizeHorse).filter((h): h is Horse => !!h);
  const time = Math.max(1, Math.round(num(data.time, 1)));
  const cards: Record<string, Card> = {};
  if (isObject(data.cards)) {
    for (const [key, c] of Object.entries(data.cards)) {
      if (!isObject(c)) continue;
      const title = key.split('-').slice(2).join('-');
      const tickets = list(c.tickets).filter(isObject).map(t => ({ type: num(t.type, 0), numbers: list(t.numbers).map(n => num(n, 1)), stake: num(t.stake, 100) }));
      cards[key] = {
        registered: typeof c.registered === 'string' ? c.registered : null,
        entries: list(c.entries).map((e, i) => sanitizeEntry(e, i, title)).filter((e): e is Entry => !!e),
        tickets,
      };
    }
  }
  const plans: Record<string, number[]> = {};
  if (isObject(data.plans)) {
    for (const [id, plan] of Object.entries(data.plans)) plans[id] = nums(plan, 7, 5).map(i => Math.max(0, Math.min(6, Math.round(i))));
  }
  const silks = isObject(data.silks) ? { pattern: num(data.silks.pattern, 1), body: str(data.silks.body, base.silks.body), sleeve: str(data.silks.sleeve, base.silks.sleeve), cap: str(data.silks.cap, base.silks.cap) } : base.silks;
  const market = list(data.market).map(sanitizeHorse).filter((h): h is Horse => !!h);
  return {
    time,
    points: num(data.points, base.points),
    horses: horses.length ? horses : base.horses,
    plans,
    cards,
    history: list(data.history).map(sanitizeResult).filter((r): r is Result => !!r),
    silks,
    spent: num(data.spent, 0),
    returned: num(data.returned, 0),
    prize: num(data.prize, 0),
    report: list(data.report).map(r => str(r, '')),
    market: market.length ? market : makeMarket(time),
    pregnancies: list(data.pregnancies).map(sanitizePregnancy).filter((p): p is Pregnancy => !!p),
  };
}

/** 保存データ（どのバージョンでも）を最新の Game に変換する */
export function migrate(raw: unknown): Game {
  let version = 1;
  let data: Data;
  if (isObject(raw) && typeof raw.version === 'number' && isObject(raw.game)) {
    version = raw.version;
    data = raw.game;
  } else if (isObject(raw)) {
    data = raw; // v1：Game をそのまま保存していた
  } else {
    return initialGame();
  }
  while (version < SAVE_VERSION) {
    const step = migrations[version];
    if (step) data = step(data);
    version++;
  }
  return sanitizeGame(data);
}

export const serialize = (game: Game): string => JSON.stringify({ version: SAVE_VERSION, savedAt: new Date().toISOString(), game } satisfies SaveData);

// ───────── localStorage 実装 ─────────
export function createLocalStorage(key = 'keiba-life', legacyKeys: string[] = []): GameStorage {
  const store = () => (typeof window === 'undefined' ? null : window.localStorage);
  return {
    async load() {
      const ls = store();
      if (!ls) return initialGame();
      const text = ls.getItem(key) ?? legacyKeys.map(k => ls.getItem(k)).find((v): v is string => !!v) ?? null;
      if (!text) return initialGame();
      try {
        return migrate(JSON.parse(text));
      } catch {
        // 壊れたデータは消さずに退避しておく
        try { ls.setItem(key + '-broken', text); } catch { /* 容量不足などは無視 */ }
        return initialGame();
      }
    },
    async save(game) {
      store()?.setItem(key, serialize(game));
    },
  };
}

/** メモリ上だけに保存（テスト用） */
export function createMemoryStorage(initial?: Game): GameStorage {
  let text = initial ? serialize(initial) : '';
  return {
    async load() { return text ? migrate(JSON.parse(text)) : initialGame(); },
    async save(game) { text = serialize(game); },
  };
}

let backend: GameStorage = createLocalStorage();
/** 保存先を差し替える（オンライン化のときに Supabase 版などを渡す） */
export function setGameStorage(storage: GameStorage) {
  backend = storage;
}

/** page.tsx から使う窓口。中身は setGameStorage で差し替え可能 */
export const gameStorage: GameStorage = {
  load: () => backend.load(),
  save: game => backend.save(game),
};