import { courseOf } from './course-data';
// lib/races.ts
// ─────────────────────────────────────────────
// レース・競馬場の設定ファイル
// 実在のレース名・競馬場名はこのファイルだけにまとめています。
// 公開時はここを差し替えるだけで名称を変更できます。
// ─────────────────────────────────────────────

export const classes = ['新馬', '未勝利', '1勝クラス', '2勝クラス', '3勝クラス', 'オープン', 'G3', 'G2', 'G1'];

export type Surface = '芝' | 'ダート';
export type Race = { week: number; title: string; venue: string; distance: number; surface: Surface; level: number; age?: number; prize?: number; course?: '内' | '外' };

export const venueOf = courseOf;

/** 重賞（実在のレース名） */
export const gradedRaces: Race[] = [
  { week: 3, title: 'メイクデビュー東京', venue: '東京', distance: 1600, surface: '芝', level: 0, age: 3 },
  { week: 3, title: 'ニューイヤーステークス', venue: '中山', distance: 1600, surface: '芝', level: 5 },
  { week: 6, title: '3歳未勝利', venue: '東京', distance: 1400, surface: 'ダート', level: 1, age: 3 },
  { week: 9, title: '春風特別', venue: '中山', distance: 1200, surface: 'ダート', level: 2 },
  { week: 12, title: '千里山特別', venue: '阪神', distance: 2000, surface: '芝', level: 3 },
  { week: 15, title: '皐月賞', prize: 200_000_000, venue: '中山', distance: 2000, surface: '芝', level: 8, age: 3 },
  { week: 16, title: '春興ステークス', venue: '中山', distance: 1600, surface: '芝', level: 4 },
  { week: 18, title: '天皇賞（春）', prize: 300_000_000, venue: '京都', distance: 3200, surface: '芝', level: 8 },
  { week: 20, title: 'メイステークス', venue: '東京', distance: 1800, surface: '芝', level: 5 },
  { week: 21, title: '平安ステークス', venue: '京都', distance: 1900, surface: 'ダート', level: 6 },
  { week: 22, title: '日本ダービー', prize: 300_000_000, venue: '東京', distance: 2400, surface: '芝', level: 8, age: 3 },
  { week: 23, title: 'エプソムカップ', venue: '東京', distance: 1800, surface: '芝', level: 6 },
  { week: 25, title: '目黒記念', venue: '東京', distance: 2500, surface: '芝', level: 7 },
  { week: 26, title: '宝塚記念', prize: 300_000_000, venue: '阪神', distance: 2200, surface: '芝', level: 8 },
  { week: 30, title: 'メイクデビュー新潟', venue: '新潟', distance: 1800, surface: '芝', level: 0 },
  { week: 33, title: '札幌記念', venue: '札幌', distance: 2000, surface: '芝', level: 7 },
  { week: 34, title: '夏の未勝利戦', venue: '札幌', distance: 1700, surface: 'ダート', level: 1 },
  { week: 38, title: '神戸新聞杯', venue: '阪神', distance: 2400, surface: '芝', level: 7, age: 3 },
  { week: 42, title: '菊花賞', prize: 200_000_000, venue: '京都', distance: 3000, surface: '芝', level: 8, age: 3 },
  { week: 43, title: '天皇賞（秋）', prize: 300_000_000, venue: '東京', distance: 2000, surface: '芝', level: 8 },
  { week: 48, title: 'チャンピオンズカップ', prize: 150_000_000, venue: '中京', distance: 1800, surface: 'ダート', level: 8 },
  { week: 52, title: '有馬記念', prize: 500_000_000, venue: '中山', distance: 2500, surface: '芝', level: 8 },
];

/** 条件戦（架空・汎用の名前）。クラスを上げやすくするため各クラス年3〜5回 */
export const conditionRaces: Race[] = [
  { week: 5, title: '3歳未勝利（中山）', venue: '中山', distance: 1800, surface: '芝', level: 1, age: 3 },
  { week: 7, title: '1勝クラス（東京）', venue: '東京', distance: 1600, surface: '芝', level: 2 },
  { week: 10, title: '新馬戦（阪神）', venue: '阪神', distance: 1400, surface: '芝', level: 0 },
  { week: 11, title: '未勝利（阪神）', venue: '阪神', distance: 1800, surface: 'ダート', level: 1 },
  { week: 13, title: '2勝クラス（中山）', venue: '中山', distance: 1800, surface: 'ダート', level: 3 },
  { week: 14, title: '1勝クラス（阪神）', venue: '阪神', distance: 2200, surface: '芝', level: 2 },
  { week: 17, title: '3勝クラス（京都）', venue: '京都', distance: 1600, surface: '芝', level: 4 },
  { week: 19, title: '新馬戦（東京）', venue: '東京', distance: 1800, surface: '芝', level: 0 },
  { week: 19, title: '未勝利（東京）', venue: '東京', distance: 2000, surface: '芝', level: 1 },
  { week: 24, title: '2勝クラス（東京）', venue: '東京', distance: 2400, surface: '芝', level: 3 },
  { week: 27, title: '1勝クラス（中京）', venue: '中京', distance: 1400, surface: 'ダート', level: 2 },
  { week: 28, title: '3勝クラス（中京）', venue: '中京', distance: 2000, surface: '芝', level: 4 },
  { week: 31, title: '未勝利（新潟）', venue: '新潟', distance: 1600, surface: '芝', level: 1 },
  { week: 32, title: '2勝クラス（新潟）', venue: '新潟', distance: 1200, surface: 'ダート', level: 3 },
  { week: 36, title: '新馬戦（中山）', venue: '中山', distance: 1600, surface: 'ダート', level: 0 },
  { week: 37, title: '1勝クラス（中山）', venue: '中山', distance: 2500, surface: '芝', level: 2 },
  { week: 39, title: '3勝クラス（阪神）', venue: '阪神', distance: 1400, surface: 'ダート', level: 4 },
  { week: 40, title: 'オープン（東京）', venue: '東京', distance: 1400, surface: '芝', level: 5 },
  { week: 41, title: '未勝利（京都）', venue: '京都', distance: 2000, surface: 'ダート', level: 1 },
  { week: 44, title: '2勝クラス（京都）', venue: '京都', distance: 3000, surface: '芝', level: 3 },
  { week: 45, title: '新馬戦（京都）', venue: '京都', distance: 1600, surface: '芝', level: 0 },
  { week: 46, title: '1勝クラス（東京・秋）', venue: '東京', distance: 2000, surface: 'ダート', level: 2 },
  { week: 47, title: '3勝クラス（中山）', venue: '中山', distance: 2000, surface: '芝', level: 4 },
  { week: 49, title: 'オープン（中山）', venue: '中山', distance: 1200, surface: '芝', level: 5 },
  { week: 50, title: '未勝利（中山）', venue: '中山', distance: 1600, surface: 'ダート', level: 1 },
];

/** 年間の開催日程（週順に並べる。同じ年に同じ title は不可） */
export const races: Race[] = [...gradedRaces, ...conditionRaces].sort((a, b) => a.week - b.week);