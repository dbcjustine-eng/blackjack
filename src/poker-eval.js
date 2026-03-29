// ── POKER HAND EVALUATOR ──────────────────────────────────────────────────────

const HAND_RANKS = [
  "Carte haute", "Paire", "Double paire", "Brelan",
  "Suite", "Couleur", "Full", "Carré", "Quinte flush", "Quinte flush royale"
];

function pokerCardValue(rank) {
  const vals = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };
  return vals[rank] || 0;
}

function evaluateHand(cards) {
  // cards = array of {rank, suit} — on évalue la meilleure main parmi 5-7 cartes
  if (!cards || cards.length < 2) return { rank: 0, name: "?", score: 0 };

  const best = bestFiveFromSeven(cards);
  return scoreHand(best);
}

function bestFiveFromSeven(cards) {
  if (cards.length <= 5) return cards;
  let best = null, bestScore = -1;
  // toutes les combinaisons de 5 parmi n
  const combos = combinations(cards, 5);
  for (const combo of combos) {
    const s = scoreHand(combo).score;
    if (s > bestScore) { bestScore = s; best = combo; }
  }
  return best;
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k-1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function scoreHand(cards) {
  const vals = cards.map(c => pokerCardValue(c.rank)).sort((a,b) => b-a);
  const suits = cards.map(c => c.suit);
  const ranks = cards.map(c => c.rank);

  const isFlush = suits.every(s => s === suits[0]);
  const sortedVals = [...vals].sort((a,b) => a-b);
  const isStraight = (sortedVals[4]-sortedVals[0]===4 && new Set(sortedVals).size===5) ||
    (sortedVals.join(",") === "2,3,4,5,14"); // roue A-2-3-4-5

  const counts = {};
  for (const v of vals) counts[v] = (counts[v]||0)+1;
  const grouped = Object.entries(counts).sort((a,b) => b[1]-a[1] || b[0]-a[0]);
  const groups = grouped.map(g => parseInt(g[1]));
  const topVals = grouped.map(g => parseInt(g[0]));

  let rank = 0, score = 0, name = "";

  if (isFlush && isStraight && vals[0] === 14 && vals[1] === 13) {
    rank = 9; name = "Quinte flush royale 👑";
    score = 9e9;
  } else if (isFlush && isStraight) {
    rank = 8; name = "Quinte flush";
    score = 8e9 + vals[0];
  } else if (groups[0] === 4) {
    rank = 7; name = "Carré de " + rankName(topVals[0]) + "s";
    score = 7e9 + topVals[0]*1000 + topVals[1];
  } else if (groups[0] === 3 && groups[1] === 2) {
    rank = 6; name = "Full aux " + rankName(topVals[0]) + "s par les " + rankName(topVals[1]) + "s";
    score = 6e9 + topVals[0]*1000 + topVals[1];
  } else if (isFlush) {
    rank = 5; name = "Couleur";
    score = 5e9 + vals.reduce((a,v,i) => a + v * Math.pow(100, 4-i), 0);
  } else if (isStraight) {
    rank = 4; name = "Suite au " + rankName(vals[0]);
    score = 4e9 + vals[0];
  } else if (groups[0] === 3) {
    rank = 3; name = "Brelan de " + rankName(topVals[0]) + "s";
    score = 3e9 + topVals[0]*10000 + topVals[1]*100 + topVals[2];
  } else if (groups[0] === 2 && groups[1] === 2) {
    rank = 2; name = "Double paire " + rankName(topVals[0]) + "s et " + rankName(topVals[1]) + "s";
    score = 2e9 + topVals[0]*10000 + topVals[1]*100 + topVals[2];
  } else if (groups[0] === 2) {
    rank = 1; name = "Paire de " + rankName(topVals[0]) + "s";
    score = 1e9 + topVals[0]*1e6 + topVals[1]*10000 + topVals[2]*100 + topVals[3];
  } else {
    rank = 0; name = "Carte haute " + rankName(vals[0]);
    score = vals.reduce((a,v,i) => a + v * Math.pow(100, 4-i), 0);
  }

  return { rank, name, score, cards };
}

function rankName(v) {
  const n = {11:"Valet",12:"Dame",13:"Roi",14:"As"};
  return n[v] || String(v);
}

export { evaluateHand, scoreHand, HAND_RANKS };
