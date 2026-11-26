import { YEN_PER_POINT } from './economy';
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
import { MAIN_LEAGUE, leagueProgress, friendPrizes, publicHorses, sharedResult, type ReceivedPrize, type SharedResult, type StableSnapshot } from './league';
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
  const nickname = snap.data()?.nickname as string | undefined;
  if (!nickname) return null;
  if (snap.data()?.leagueId !== MAIN_LEAGUE) return signIn(nickname);
  context = { userId: user.uid, nickname, leagueId: MAIN_LEAGUE };
  return { userId: user.uid, nickname };
}

/** 匿名ログイン＋ニックネーム */
export async function signIn(nickname: string): Promise<Profile> {
  const name = cleanNickname(nickname);
  if (!name) throw new Error('ニックネームを入力してください。');
  const { auth, db, au, fs } = await firebase();
  const user = auth.currentUser ?? (await au.signInAnonymously(auth)).user;
  const ref = fs.doc(db, 'users', user.uid);
  const leagueId = MAIN_LEAGUE;
  await fs.setDoc(ref, { nickname: name, leagueId, updatedAt: Date.now() });
  context = { userId: user.uid, nickname: name, leagueId };
  return { userId: user.uid, nickname: name };
}

export async function loadLeague(profile: Profile): Promise<OnlineState> {
  return { profile, league: { id: MAIN_LEAGUE, name: '共通リーグ', inviteCode: '', owner: '' }, members: [] };
}

const transferKey = (uid: string) => 'keiba-life-transfer:' + uid;
export const savedTransferCode = (uid: string) => window.localStorage.getItem(transferKey(uid)) ?? '';
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const transferPassword = (raw: string) => raw.trim().toLowerCase().replace(/[\s-]/g, '');
async function transferEmail(password: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return hex(new Uint8Array(digest)).slice(0, 40) + '@transfer.keiba-life.invalid';
}
async function linkTransfer(game: Game, recovery = '') {
  const { auth, au } = await firebase();
  const user = auth.currentUser;
  if (!user || context?.userId !== user.uid) throw new Error('先に名前を登録してください。');
  const existing = savedTransferCode(user.uid);
  if (existing) { await publishNow(game); return existing; }
  const password = recovery ? transferPassword(recovery) : hex(crypto.getRandomValues(new Uint8Array(20)));
  if (!/^[a-f0-9]{40}$/.test(password)) throw new Error('引き継ぎコードの形式を確認してください。');
  const email = await transferEmail(password);
  await publishNow(game);
  if (user.email) {
    if (!recovery || user.email !== email) throw new Error('このアカウントはコード発行済みです。保存したコードを入力してください。');
    await au.reauthenticateWithCredential(user, au.EmailAuthProvider.credential(email,password));
  } else {
    await au.linkWithCredential(user, au.EmailAuthProvider.credential(email,password));
  }
  const code = password.match(/.{5}/g)!.join('-');
  window.localStorage.setItem(transferKey(user.uid), code);
  return code;
}

export const issueTransferCode = (game: Game) => linkTransfer(game);

export async function restoreTransfer(raw: string) {
  const password = transferPassword(raw);
  if (!/^[a-f0-9]{40}$/.test(password)) throw new Error('引き継ぎコードの形式を確認してください。');
  const email = await transferEmail(password);
  const { auth, au, fs } = await firebase();
  const appSdk = await import('firebase/app');
  const staging = appSdk.initializeApp(config, 'keiba-transfer-' + crypto.randomUUID());
  try {
    const stagingAuth = au.initializeAuth(staging, { persistence: au.inMemoryPersistence });
    const stagingDb = fs.getFirestore(staging);
    if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true') {
      au.connectAuthEmulator(stagingAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fs.connectFirestoreEmulator(stagingDb, '127.0.0.1', 8080);
    }
    const credential = await au.signInWithEmailAndPassword(stagingAuth, email, password);
    const uid = credential.user.uid;
    const [remote, owner] = await Promise.all([
      fs.getDocFromServer(fs.doc(stagingDb, 'saves', uid)),
      fs.getDocFromServer(fs.doc(stagingDb, 'users', uid)),
    ]);
    const text = remote.data()?.data;
    const nickname = owner.data()?.nickname;
    if (typeof text !== 'string' || typeof nickname !== 'string') throw new Error('引き継ぐセーブが見つかりません。');
    const game = migrate(JSON.parse(text));
    await au.signInWithEmailAndPassword(auth, email, password);
    const profile = { userId: uid, nickname };
    context = { ...profile, leagueId: MAIN_LEAGUE };
    window.localStorage.setItem(SAVE_KEY, text);
    window.localStorage.setItem(SAVE_KEY + '-owner', uid);
    window.localStorage.setItem(transferKey(uid), password.match(/.{5}/g)!.join('-'));
    return { profile, game };
  } finally {
    await appSdk.deleteApp(staging);
  }
}

// ───────── 厩舎の公開・友だちの馬 ─────────
export async function publishStable(game: Game) {
  const progress = leagueProgress(game);
  if (!context?.leagueId || !progress.eligible) return;
  const { db, fs } = await firebase();
  const { userId, nickname, leagueId } = context;
  await fs.setDoc(fs.doc(db, 'leagues', leagueId, 'stables', userId), {
    completedRaces: progress.races, currency: 'JPY', nickname, silks: game.silks, horses: JSON.stringify(publicHorses(game)), names: Object.fromEntries([...game.horses,...game.soldHorses.map(s=>s.horse)].map(h => ['id:' + h.id, h.name])), summary: summarize(game), gameTime: game.time, updatedAt: Date.now(),
  });
}

/** リーグ全員の厩舎（自分を含む） */
export async function fetchStables(leagueId: string): Promise<StableSnapshot[]> {
  const { db, fs } = await firebase();
  const snap = await fs.getDocs(fs.collection(db, 'leagues', leagueId, 'stables'));
  return snap.docs.filter(d => Number(d.data().completedRaces) >= 3 && Number(d.data().gameTime) >= 6).map(d => {
    const v = d.data();
    let horses: Horse[] = [];
    try { horses = typeof v.horses === 'string' ? (JSON.parse(v.horses) as Horse[]) : []; } catch { horses = []; }
    const multiplier = v.currency === 'JPY' ? 1 : YEN_PER_POINT;
    if (multiplier !== 1) horses = horses.map(h => ({ ...h, earnings: (h.earnings ?? 0) * multiplier }));
    const summary = (v.summary ?? { prize: 0, g1: 0, spent: 0, returned: 0, bestPayout: 0, strongest: [], hot: [] }) as Summary;
    return {
      userId: d.id, nickname: String(v.nickname ?? 'ななし'), silks: v.silks, horses, names: v.names ? Object.fromEntries(Object.entries(v.names as Record<string,string>).map(([id,name])=>[id.slice(3),name])) : undefined,
      summary: { ...summary, prize: summary.prize * multiplier, spent: summary.spent * multiplier, returned: summary.returned * multiplier, bestPayout: summary.bestPayout * multiplier },
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
  batch.set(fs.doc(fs.collection(db, 'leagues', leagueId, 'results')), { ...sharedResult(result, nickname), currency: 'JPY', userId, createdAt: Date.now() });
  for (const p of friendPrizes(result)) {
    batch.set(fs.doc(fs.collection(db, 'leagues', leagueId, 'prizes')), { ...p, currency: 'JPY', fromUser: userId, fromNickname: nickname, claimed: false, createdAt: Date.now() });
  }
  await batch.commit();
}

export async function fetchFeed(leagueId: string, count = 30): Promise<SharedResult[]> {
  const { db, fs } = await firebase();
  const q = fs.query(fs.collection(db, 'leagues', leagueId, 'results'), fs.orderBy('createdAt', 'desc'), fs.limit(count));
  const snap = await fs.getDocs(q);
  return snap.docs.map(d => {
    const value = d.data() as Omit<SharedResult, 'id'> & { currency?: string };
    const rate = value.currency === 'JPY' ? 1 : YEN_PER_POINT;
    return { ...value, id: d.id, prize: value.prize * rate,
      tickets: value.tickets.map(t => ({ ...t, stake: t.stake * rate, payout: t.payout * rate })) };
  });
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
      rank: Number(v.rank), prize: Number(v.prize) * (v.currency === 'JPY' ? 1 : YEN_PER_POINT), fromNickname: String(v.fromNickname),
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
      const { auth, db, fs } = await firebase();
      if (auth.currentUser?.uid !== userId) return;
      await fs.setDoc(fs.doc(db, 'saves', userId), { data: cloudText(game), savedAt: new Date().toISOString() });
      if (context?.userId === userId) await publishStable(game);
    } catch {
      onError?.();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
  }
  return {
    async load() {
      const owner = window.localStorage.getItem(SAVE_KEY + '-owner');
      const localText = owner && owner !== userId ? null : window.localStorage.getItem(SAVE_KEY);
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
      return owner && owner !== userId ? migrate(undefined) : local.load();
    },
    async save(game) {
      window.localStorage.setItem(SAVE_KEY + '-owner', userId);
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
