import { marketPrices, type Game, type Horse } from './game';

export function saleQuote(game: Game, horse: Horse) {
 const wins = game.history.filter(r => r.order[0]?.horse.id === horse.id && r.order[0].owned);
 const graded = wins.filter(r => r.race.level >= 6);
 const g1 = graded.some(r => r.race.level === 8);
 const ability = horse.values.reduce((total, value) => total + value, 0) / horse.values.length;
 const base = marketPrices[horse.rarity] ?? marketPrices[0];
 const abilityFactor = Math.min(1.35, Math.max(.60, ability / 680));
 const ageFactor = Math.max(.3, 1 - Math.max(0, horse.age - 5) * .095);
 const condition = horse.injury ? .55 : horse.recovery ? .77 : [.73,.82,.90,.95,1][horse.form] ?? .90;
 const achievements = Math.min(base * .7, horse.wins * 160_000 + graded.length * 500_000 + Math.max(0,horse.earnings) * .012);
 const immediateCap = (horse.purchasePrice ?? (horse.id.startsWith('market-') ? base : 2_700_000)) * .78;
 const estimated = base * .47 * abilityFactor * ageFactor * condition + achievements;
 const limit = horse.starts > 0 ? Math.min(base * 1.10, 14_000_000) : immediateCap;
 const price = Math.max(100_000, Math.floor(Math.min(estimated, limit) / 10_000) * 10_000);
 const reasons = ['ランクと平均能力 ' + Math.round(ability) + ' が基準'];
 if(g1)reasons.push('G1勝利を加算');
 else if(graded.length)reasons.push('重賞勝利を加算');
 if(horse.wins||horse.earnings)reasons.push(horse.wins+'勝と獲得賞金を加算');
 if(ageFactor<1)reasons.push('高齢で値下がり');
 if(horse.injury||horse.recovery)reasons.push(horse.injury?'ケガで値下がり':'ケガ明けで値下がり');
 else if(horse.form<=1)reasons.push('調子が悪く値下がり');
 if(horse.starts===0&&estimated>limit)reasons.push('未出走馬の売却上限を適用');
 return { price, reasons };
}

export function sellHorse(game: Game, horseId: string) {
 const horse = game.horses.find(h => h.id === horseId);
 if (!horse || horse.retired) throw new Error('現役の所有馬を選んでください。');
 if (game.pregnancies.some(p => p.damId === horseId)) throw new Error('受胎中の馬は売却できません。');
 if (Object.values(game.cards).some(c => c.registered === horseId && c.tickets.length)) {
  throw new Error('購入済み馬券があるレースの登録馬は、結果確定後に売却できます。');
 }
 const { price } = saleQuote(game, horse);
 const cards = Object.fromEntries(Object.entries(game.cards).filter(([,card]) => card.registered !== horseId));
 const plans = { ...game.plans };
 delete plans[horseId];
 return { ...game, cards, plans, points: game.points + price,
  horses: game.horses.filter(h => h.id !== horseId),
  soldHorses: [...game.soldHorses, { horse, time: game.time, price }],
 };
}
