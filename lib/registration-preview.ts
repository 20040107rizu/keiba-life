import { simulateRace } from './race-engine';
import { makeOdds } from './odds';
import { seeded } from './random';
import type { Card } from './game';
import type { Race } from './races';

export function registrationPreview(race: Race, card: Card, raceKey: string) {
 const entry = card.entries.find(e => e.owned && e.horse.id === card.registered);
 if (!entry) return undefined;

 // Use the same trial seeds for each candidate so changing the selection does
 // not reroll the prediction independently of the horse or jockey.
 const trials = 48;
 let wins = 0;
 for (let i=0;i<trials;i++){
  const run=simulateRace(race,card.entries,seeded('registration:'+raceKey+':'+i));
  if(run.finish[0]===entry.number)wins++;
 }
 return {
  winPct: wins/trials*100,
  trials,
  odds: makeOdds(card.entries,card.tickets)(0,[entry.number]),
 };
}
