// lib/online.ts
// オンライン対戦（Firebase：Authentication の匿名ログイン ＋ Cloud Firestore）
// NEXT_PUBLIC_FIREBASE_* が未設定なら onlineConfigured=false になり、アプリはひとり用モードで動く。
// Firebase の SDK は使うときだけ読み込む（ひとり用では読み込まない）。
//
// Firestore の構成（ルールは firestore.rules）
//   users/{uid}                    … ニックネーム・参加中のリーグ
//   saves/{uid}                    … セーブデータ（JSON文字列）
//   invites/{招待コード}             … { leagueId }
//   leagues/{leagueId}             … リーグ名・招待コード・作成者
//   leagues/{id}/members/{uid}     … メンバー（ニックネーム）
//   leagues/{id}/stables/{uid}     … 厩舎の最新データ（友だちのレースに出走する馬・ランキング用の成績）
//   leagues/{id}/results/{auto}    … 共有するレース結果と馬券
//   leagues/{id}/prizes/{auto}     … 友だちのレースで自分の馬が獲った賞金（受け取ると claimed=true）
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Game, Horse, Result } from './game';
import { friendPrizes, publicHorses, sharedResult, type ReceivedPrize, type SharedResult, type StableSnapshot } from './league';
import { summarize, type Summary } from './ranking';
import { createLocalStorage, migrate, serialize, type GameStorage } from './storage';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};
/** Firebase の設定があるか（ないときはひとり用モード） */
export const onlineConfigured = !!(config.apiKey && config.authDomain && config.projectId && config.appId);

type Sdk = { auth: Auth; db: Firestore; au: typeof import('firebase/auth'); fs: typeof import('firebase/firestore') };
let sdk: Promise<Sdk> | null = null;
function firebase(): Promise<Sdk> {
  if (!onlineConfigured) return Promise.reject(new Error('Firebase が設定されていません'));
  sdk ??= (async () => {
    const [app, au, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const instance = app.getApps()[0] ?? app.initializeApp(config);
    const auth = au.getAuth(instance);
    const db = fs.getFirestore(instance);
    // 開発用：NEXT_PUBLIC_FIREBASE_EMULATOR=true のときはローカルのエミュレータにつなぐ
    if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true') {
      au.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    await auth.authStateReady();
    return { auth, db, au, fs };
  })();
  return sdk;
}

export type Profile = { userId: string; nickname: string };
export type League = { id: string; name: string; inviteCode: string; owner: string };
export type Member = { userId: string; nickname: string };
export type OnlineState = { profile: Profile; league: League | null; members: Member[] };

// 保存時に厩舎を公開するための現在の状態
let context: { userId: string; nickname: string; leagueId: string | null } | null = null;
const cleanNickname = (s: string) => s.trim().slice(0, 20);
const SAVE_KEY = 'keiba-life';

/** ログイン中ならプロフィールを返す（匿名ログインはこの端末のブラウザに保持される） */
export async function currentProfile(): Promise<Profile | null> {
  if (!onlineConfigured) return null;
  const { auth, db, fs } = await firebase();
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await fs.getDoc(fs.doc(db, 'users', user.uid));
  const nickname = (snap.data()?.nickname as string | undefined) ?? 'ななし';
  context = { userId: user.uid, nickname, leagueId: (snap.data()?.leagueId as string | null | undefined) ?? null };
  return { userId: user.uid, nickname };
}

/** 匿名ログイン＋ニックネーム */
export async function signIn(nickname: string): Promise<Profile> {
  const name = cleanNickname(nickname);
  if (!name) throw new Error('ニックネームを入力してください。');
  const { auth, db, au, fs } = await firebase();
  const user = auth.currentUser ?? (await au.signInAnonymously(auth)).user;
  const ref = fs.doc(db, 'users', user.uid);
  const old = await fs.getDoc(ref);
  const leagueId = (old.data()?.leagueId as string | null | undefined) ?? null;
  await fs.setDoc(ref, { nickname: name, leagueId, updatedAt: Date.now() });
  context = { userId: user.uid, nickname: name, leagueId };
  return { userId: user.uid, nickname: name };
}

export async function signOut() {
  const { auth, au } = await firebase();
  await au.signOut(auth);
  context = null;
}

/** 参加中のリーグとメンバー */
export async function loadLeague(profile: Profile): Promise<OnlineState> {
  const { db, fs } = await firebase();
  const user = await fs.getDoc(fs.doc(db, 'users', profile.userId));
  const leagueId = (user.data()?.leagueId as string | null | undefined) ?? null;
  if (context) context.leagueId = leagueId;
  if (!leagueId) return { profile, league: null, members: [] };
  try {
    const [league, members] = await Promise.all([
      fs.getDoc(fs.doc(db, 'leagues', leagueId)),
      fs.getDocs(fs.collection(db, 'leagues', leagueId, 'members')),
    ]);
    if (!league.exists()) return { profile, league: null, members: [] };
    const d = league.data();
    return {
      profile,
      league: { id: leagueId, name: String(d.name), inviteCode: String(d.inviteCode), owner: String(d.owner) },
      members: members.docs.map(m => ({ userId: m.id, nickname: String(m.data().nickname) })),
    };
  } catch {
    // メンバーから外れているなど
    return { profile, league: null, members: [] };
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function enter(leagueId: string, code: string, extra: (batch: import('firebase/firestore').WriteBatch) => void) {
  const { db, fs } = await firebase();
  if (!context) throw new Error('先にログインしてください。');
  const me = context;
  await leaveLeague().catch(() => undefined);
  const batch = fs.writeBatch(db);
  extra(batch);
  batch.set(fs.doc(db, 'leagues', leagueId, 'members', me.userId), { nickname: me.nickname, code, joinedAt: Date.now() });
  batch.set(fs.doc(db, 'users', me.userId), { nickname: me.nickname, leagueId, updatedAt: Date.now() });
  await batch.commit();
  me.leagueId = leagueId;
}

/** リーグを作る（招待コードを発行） */
export async function createLeague(name: string) {
  const { db, fs } = await firebase();
  if (!context) throw new Error('先にログインしてください。');
  const owner = context.userId;
  const title = name.trim().slice(0, 30) || context.nickname + 'のリーグ';
  let code = makeCode();
  for (let i = 0; i < 5 && (await fs.getDoc(fs.doc(db, 'invites', code))).exists(); i++) code = makeCode();
  const league = fs.doc(fs.collection(db, 'leagues'));
  await enter(league.id, code, batch => {
    batch.set(league, { name: title, inviteCode: code, owner, createdAt: Date.now() });
    batch.set(fs.doc(db, 'invites', code), { leagueId: league.id });
  });
}

/** 招待コードでリーグに入る */
export async function joinLeague(input: string) {
  const { db, fs } = await firebase();
  const code = normalizeCode(input);
  if (code.length !== 6) throw new Error('招待コードは6文字です。');
  const invite = await fs.getDoc(fs.doc(db, 'invites', code));
  const leagueId = invite.data()?.leagueId as string | undefined;
  if (!leagueId) throw new Error('招待コードが見つかりません。');
  await enter(leagueId, code, () => undefined);
}

export async function leaveLeague() {
  const { db, fs } = await firebase();
  if (!context?.leagueId) return;
  const { userId, leagueId, nickname } = context;
  const batch = fs.writeBatch(db);
  batch.delete(fs.doc(db, 'leagues', leagueId, 'stables', userId));
  batch.delete(fs.doc(db, 'leagues', leagueId, 'members', userId));
  batch.set(fs.doc(db, 'users', userId), { nickname, leagueId: null, updatedAt: Date.now() });
  await batch.commit();
  context.leagueId = null;
}

// ───────── 厩舎の公開・友だちの馬 ─────────
export async function publishStable(game: Game) {
  if (!context?.leagueId) return;
  const { db, fs } = await firebase();
  const { userId, nickname, leagueId } = context;
  await fs.setDoc(fs.doc(db, 'leagues', leagueId, 'stables', userId), {
    nickname, silks: game.silks, horses: JSON.stringify(publicHorses(game)), summary: summarize(game), gameTime: game.time, updatedAt: Date.now(),
  });
}

/** リーグ全員の厩舎（自分を含む） */
export async function fetchStables(leagueId: string): Promise<StableSnapshot[]> {
  const { db, fs } = await firebase();
  const snap = await fs.getDocs(fs.collection(db, 'leagues', leagueId, 'stables'));
  return snap.docs.map(d => {
    const v = d.data();
    let horses: Horse[] = [];
    try { horses = typeof v.horses === 'string' ? (JSON.parse(v.horses) as Horse[]) : []; } catch { horses = []; }
    return {
      userId: d.id, nickname: String(v.nickname ?? 'ななし'), silks: v.silks, horses,
      summary: (v.summary ?? { prize: 0, g1: 0, spent: 0, returned: 0, bestPayout: 0, strongest: [], hot: [] }) as Summary,
      gameTime: Number(v.gameTime ?? 1), updatedAt: Number(v.updatedAt ?? 0),
    };
  });
}

// ───────── レース結果・馬券・賞金の共有 ─────────
export async function postResult(result: Result) {
  if (!context?.leagueId) return;
  const { db, fs } = await firebase();
  const { userId, nickname, leagueId } = context;
  const batch = fs.writeBatch(db);
  batch.set(fs.doc(fs.collection(db, 'leagues', leagueId, 'results')), { ...sharedResult(result, nickname), userId, createdAt: Date.now() });
  for (const p of friendPrizes(result)) {
    batch.set(fs.doc(fs.collection(db, 'leagues', leagueId, 'prizes')), { ...p, fromUser: userId, fromNickname: nickname, claimed: false, createdAt: Date.now() });
  }
  await batch.commit();
}

export async function fetchFeed(leagueId: string, count = 30): Promise<SharedResult[]> {
  const { db, fs } = await firebase();
  const q = fs.query(fs.collection(db, 'leagues', leagueId, 'results'), fs.orderBy('createdAt', 'desc'), fs.limit(count));
  const snap = await fs.getDocs(q);
  return snap.docs.map(d => ({ ...(d.data() as Omit<SharedResult, 'id'>), id: d.id }));
}

/** 友だちのレースで自分の馬が獲った賞金を受け取る（二重に受け取らないようトランザクションで claimed にする） */
export async function claimPrizes(): Promise<ReceivedPrize[]> {
  if (!context?.leagueId) return [];
  const { db, fs } = await firebase();
  const { userId, leagueId } = context;
  const q = fs.query(fs.collection(db, 'leagues', leagueId, 'prizes'), fs.where('toUser', '==', userId), fs.where('claimed', '==', false));
  const snap = await fs.getDocs(q);
  const received: ReceivedPrize[] = [];
  for (const d of snap.docs) {
    const ok = await fs.runTransaction(db, async tx => {
      const latest = await tx.get(d.ref);
      if (!latest.exists() || latest.data().claimed) return false;
      tx.update(d.ref, { claimed: true });
      return true;
    }).catch(() => false);
    if (!ok) continue;
    const v = d.data();
    received.push({
      toUser: userId, horseId: String(v.horseId), horseName: String(v.horseName), raceTitle: String(v.raceTitle),
      rank: Number(v.rank), prize: Number(v.prize), fromNickname: String(v.fromNickname),
    });
  }
  return received;
}

// ───────── セーブ（端末＋クラウド） ─────────
const savedAtOf = (text: string | null) => {
  try { return text ? String((JSON.parse(text) as { savedAt?: string }).savedAt ?? '') : ''; } catch { return ''; }
};
/** Firestore の1ドキュメント上限（1MB）に収まるよう、大きすぎるときは古い履歴を削る */
function cloudText(game: Game) {
  const text = serialize(game);
  if (text.length < 900_000) return text;
  return serialize({ ...game, history: game.history.slice(0, 80).map(r => ({ ...r, timeline: [] })) });
}

/**
 * ログイン中の保存先：端末（localStorage）に保存しつつ、数秒まとめてクラウドにも保存し、厩舎をリーグに公開する。
 * 読み込み時は端末とクラウドの新しい方を使う。通信できなくても端末の保存だけで遊べる。
 */
export function createSyncedStorage(userId: string, onError?: () => void): GameStorage {
  const local = createLocalStorage(SAVE_KEY);
  let pending: Game | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    clearTimeout(timer);
    const game = pending;
    pending = null;
    if (!game) return;
    try {
      const { db, fs } = await firebase();
      await fs.setDoc(fs.doc(db, 'saves', userId), { data: cloudText(game), savedAt: new Date().toISOString() });
      await publishStable(game);
    } catch {
      onError?.();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
  }
  return {
    async load() {
      const localText = typeof window === 'undefined' ? null : window.localStorage.getItem(SAVE_KEY);
      try {
        const { db, fs } = await firebase();
        const remote = (await fs.getDoc(fs.doc(db, 'saves', userId))).data() as { data?: string } | undefined;
        if (remote?.data && (!localText || savedAtOf(remote.data) > savedAtOf(localText))) {
          try { window.localStorage.setItem(SAVE_KEY, remote.data); } catch { /* 容量不足は無視 */ }
          return migrate(JSON.parse(remote.data));
        }
      } catch {
        // オフラインなどは端末のデータで続ける
      }
      return local.load();
    },
    async save(game) {
      await local.save(game);
      pending = game;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 2500);
    },
  };
}

/** 今すぐクラウドに保存（レース前などに友だちへ最新の馬を見せたいとき） */
export async function publishNow(game: Game) {
  if (!context) return;
  const { db, fs } = await firebase();
  await fs.setDoc(fs.doc(db, 'saves', context.userId), { data: cloudText(game), savedAt: new Date().toISOString() });
  await publishStable(game);
}
