# 競馬ライフ

友だちと遊べる、育成と馬券のスマホ向け競馬ゲームです（PWA対応）。厩舎で何頭も馬を持ち、毎週の調教メニューを選び、「1週進める」「次のレースまでスキップ」で時間を進めます。セリ・ガチャで馬を迎え、新馬からG1までのレースに出走し、単勝〜三連単の馬券（パリミュチュエル方式のオッズ）を買えます。ランキングは6種類あります。

詳しくは `docs/仕様書.md` と `docs/デザインガイド.md` を見てください。

## 担当
- UI・デザイン：Codex（ChatGPT）… `app/`
- ゲームロジック：Claude … `lib/`（`random.ts` 乱数 / `race-engine.ts` レース計算 / `odds.ts` オッズと払戻 / `game.ts` 成長・ケガ・進行 / `races.ts` レース設定 / `storage.ts` セーブ）

## 起動方法
```
npm ci
npm run dev        # http://localhost:3000
npm run build && npm run start   # 本番ビルド
```
技術：Next.js（App Router）、TypeScript、Tailwind CSS、localStorage（`lib/storage.ts` で差し替え可能）。
