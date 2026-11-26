import { cpuNames, damNames, horseNames, starterNames, studNames } from './roster';

const oldHorseNames = ['ブルームフィールド', 'ルミエールリーフ', 'ヴェルデシエロ', 'ナイトリバー', 'ゴールドフェザー', 'ミストバレー', 'グリーンコメット', 'サクラノヴァ', 'オーシャンリズム', 'シルバーパス', 'メドウベル', 'スカイラピス'];
const oldCpuNames = ['ハヤテノツバサ', 'ミナモノシラベ', 'ソラカケルユメ', 'ホシクズダンサー', 'アカツキエール', 'カザハナルート', 'シオサイブルー', 'ヨイマチレター', 'ツキアカリロード', 'ハナミズキワルツ', 'フユノオリオン', 'ナツゾラマーチ', 'アキツシマカゼ', 'コハクスプリント', 'ルリイロノアサ', 'ヒスイノカナタ', 'イブキスピリット', 'マドロミカノン', 'タマユラリズム', 'セセラギエコー', 'オボロヅキ', 'キラメキパレード', 'ノハラノヒカリ', 'ミライノトビラ'];

const oldStarters = ['アオバストライド', 'ルナグレイス', 'ノーブルゲイル'];
const oldStuds = ['グランドマエストロ', 'ストームブレイカー', 'エターナルサーガ', 'アイアンフォートレス', 'シルバーアロー', 'ヴィクトリーロード'];
const oldMares = ['ハルカゼ', 'ユメミヅキ', 'ホシノシズク', 'サクラビジン', 'コトノハ', 'ミヤビ', 'アオイソラ', 'ヒカリノミチ', 'ナデシコ', 'シラユキ', 'カスミソウ', 'ツバキ'];
const oldSires = ['ライジングエース', 'ブレイブハート', 'ミラクルステップ', 'ダンシングキング', 'スカイハイ', 'ウィンドワード'];
const pedigreeAliases: Record<string,string> = {
 'sire-a':'サンデーサイレンス','sire-b':'キングマンボ','sire-c':'キングカメハメハ','sire-d':'ディープインパクト',
 'dam-a':'ウインドインハーヘア','dam-b':'マンファス','dam-c':'レディブラッサム','dam-d':'シーザリオ','dam-e':'キャットクイル','dam-f':'アイリッシュダンス',
};
const roots = ['ヘイロー','ミスタープロスペクター','キングマンボ','アルザオ','ストームキャット','ウィッシングウェル','ミエスク','サラトガデュー','バーグクレア','パイロットバード','マンファス','スペシャルウィーク','キロフプリミエール','サンデーサイレンス','ウインドインハーヘア','パシフィカス','トニービン','ビューパーダンス'];
const oldJockeys: Record<string, string> = {
 kazama: 'take', shiraishi: 'tosaki', yamato: 'tanabe', takanashi: 'sugawara', takamiya: 'tannai',
};

export function legacyJockey(id: string) {
 return Object.prototype.hasOwnProperty.call(oldJockeys,id) ? oldJockeys[id] : id;
}

export function legacyHorseName(id: string, name: string, rarity = 0) {
 const originalId = id.startsWith('friend:') ? id.split(':').slice(2).join(':') : id;
 id = originalId;
 const starter = oldStarters.indexOf(name);
 if (starter >= 0 && id === 'starter-' + (starter + 1)) return starterNames[starter];
 const stud = oldStuds.indexOf(name);
 if (stud >= 0 && id === 'stud-' + (stud + 1)) return studNames[stud];
 const cpu = oldCpuNames.indexOf(name);
 if (cpu >= 0 && id.startsWith('cpu-')) return cpuNames[cpu];
 const market = oldHorseNames.indexOf(name);
 const slot = /^market-(\d+)-([0-2])$/.exec(id);
 const oldMarketName = slot && oldHorseNames[(Number(slot[1]) + Number(slot[2]) + 3) % oldHorseNames.length];
 if (market >= 0 && (name === oldMarketName || /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))) {
  const tier = horseNames[rarity] ?? horseNames[0];
  return tier[market % tier.length];
 }
 if (/^p[sd]+-/.test(id)) {
  const mare = oldMares.findIndex(n => n === name || ['スター','ローズ','ムーン'].some(suffix => n + suffix === name));
  const sire = oldSires.findIndex(n => n === name || n + 'II' === name || n + 'ボーイ' === name);
  if (mare >= 0) return damNames[mare];
  if (sire >= 0) return studNames[sire];
 }
 if (/^root-\d+$/.test(id)) return roots[Number(id.slice(5)) - 1] ?? name;
 if (/^(sire|dam)-[a-f]$/.test(id)) return pedigreeAliases[id] ?? name;
 return name;
}
