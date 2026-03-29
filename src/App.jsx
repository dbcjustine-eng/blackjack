import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";

// ── TRANSACTION LOGGER ────────────────────────────────────────────────────────
async function logTransaction(playerId, type, amount, description, balanceAfter) {
  await supabase.from("transactions").insert({
    player_id: playerId,
    type,
    amount,
    description,
    balance_after: balanceAfter,
  });
}

// ── CARD ENGINE ───────────────────────────────────────────────────────────────
const SUITS = ["♠","♥","♦","♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const RED   = new Set(["♥","♦"]);

function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit:s, rank:r });
  for (let i = d.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [d[i],d[j]] = [d[j],d[i]];
  }
  return d;
}

// Pioche truquée : le croupier choisit la carte qui l'avantage le plus
// parmi N candidats tirés du dessus du deck (invisible pour le joueur).
// WIN_RATE = probabilité cible que le joueur gagne.
const WIN_RATE = 0.45; // 45%
const CHEAT_POOL = 6;  // nb de candidats scannés en secret

function riggedPop(deck, dealerCurrent, playerScore, winRate = WIN_RATE) {
  if (deck.length === 0) return null;
  // On prend un pool de candidats (sans les retirer du deck encore)
  const pool = deck.slice(-CHEAT_POOL);
  const ds = handScore(dealerCurrent);

  // Si le RNG dit que le croupier doit gagner, on choisit
  // la carte qui rapproche le croupier de battre le joueur sans buster.
  const dealerShouldWin = Math.random() > winRate;

  let chosen = null;
  if (dealerShouldWin) {
    // Cherche la carte qui donne au croupier un score ≤21 et > playerScore
    // Priorité : score le plus proche de 21 sans dépasser
    let bestScore = -1;
    for (const c of pool) {
      const trial = handScore([...dealerCurrent, c]);
      if (trial <= 21 && trial > playerScore && trial > bestScore) {
        bestScore = trial;
        chosen = c;
      }
    }
    // Fallback : score le plus élevé ≤21
    if (!chosen) {
      for (const c of pool) {
        const trial = handScore([...dealerCurrent, c]);
        if (trial <= 21 && trial > bestScore) { bestScore = trial; chosen = c; }
      }
    }
  }

  // Si le RNG dit que le joueur gagne (35%), on prend la carte la moins bonne
  // pour le croupier (la plus basse valeur ou celle qui fait buster)
  if (!chosen) {
    let worstScore = 999;
    for (const c of pool) {
      const trial = handScore([...dealerCurrent, c]);
      if (trial < worstScore) { worstScore = trial; chosen = c; }
    }
  }

  // Retire chosen du deck (on enlève la première occurrence depuis la fin)
  if (!chosen) return deck.pop();
  const idx = deck.lastIndexOf(chosen);
  if (idx !== -1) deck.splice(idx, 1);
  return chosen;
}
function cardValue(rank) {
  if (["J","Q","K"].includes(rank)) return 10;
  if (rank==="A") return 11;
  return parseInt(rank);
}
function handScore(hand) {
  let score=0, aces=0;
  for (const c of hand) { score+=cardValue(c.rank); if(c.rank==="A") aces++; }
  while (score>21 && aces>0) { score-=10; aces--; }
  return score;
}
function canSplit(entries) {
  if (entries.length !== 2) return false;
  return cardValue(entries[0].card.rank) === cardValue(entries[1].card.rank);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── SUPABASE — données viennent de la DB ────────────────────────────────────

// ── ANIMATED CARD ─────────────────────────────────────────────────────────────
function AnimatedCard({ entry, highlight }) {
  const { card, faceUp, visible } = entry;
  const red = card && RED.has(card.suit);
  return (
    <div style={{
      width:52, height:74, flexShrink:0,
      perspective:600,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : "translateY(-48px) scale(0.85)",
      transition: "opacity .22s ease, transform .22s ease",
    }}>
      <div style={{
        width:"100%", height:"100%",
        position:"relative", transformStyle:"preserve-3d",
        transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)",
        transition: "transform .42s cubic-bezier(.4,0,.2,1)",
      }}>
        {/* FRONT */}
        <div style={{
          position:"absolute", inset:0,
          backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
          background:"#fff", borderRadius:8,
          border: highlight ? "2px solid #ffd700" : "1.5px solid #ddd",
          display:"flex", flexDirection:"column",
          justifyContent:"space-between", padding:"3px 4px",
          boxShadow: highlight
            ? "0 0 12px rgba(255,215,0,.6), 2px 3px 12px rgba(0,0,0,.5)"
            : "2px 3px 12px rgba(0,0,0,.5)",
        }}>
          <div style={{fontSize:13,fontWeight:700,color:red?"#c0392b":"#1a1a1a",lineHeight:1.1}}>
            {card?.rank}<br/>{card?.suit}
          </div>
          <div style={{fontSize:13,fontWeight:700,color:red?"#c0392b":"#1a1a1a",lineHeight:1.1,alignSelf:"flex-end",transform:"rotate(180deg)"}}>
            {card?.rank}<br/>{card?.suit}
          </div>
        </div>
        {/* BACK */}
        <div style={{
          position:"absolute", inset:0,
          backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
          transform:"rotateY(180deg)",
          background:"linear-gradient(135deg,#1a1a2e 20%,#16213e 80%)",
          borderRadius:8, border:"1.5px solid #3a3a5c",
          boxShadow:"2px 3px 12px rgba(0,0,0,.5)", overflow:"hidden",
        }}>
          <div style={{
            position:"absolute", inset:5,
            border:"1.5px solid rgba(255,215,0,.25)", borderRadius:4,
            backgroundImage:"repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(255,215,0,.05) 5px,rgba(255,215,0,.05) 10px)",
          }}/>
        </div>
      </div>
    </div>
  );
}

// ── ANIMATED HAND ─────────────────────────────────────────────────────────────
function AnimatedHand({ entries, label, score, active, bust, done }) {
  const borderColor = active ? "#ffd700" : bust ? "#e74c3c" : done ? "#555" : "transparent";
  const opacity = done && !active ? 0.55 : 1;
  return (
    <div style={{
      marginBottom:8, padding:"6px 8px", borderRadius:10,
      border:`1.5px solid ${borderColor}`,
      opacity, transition:"opacity .3s, border-color .3s",
      background: active ? "rgba(255,215,0,.05)" : "transparent",
    }}>
      <div style={{color: active?"#ffd700":"#9a9ab0", fontSize:11, marginBottom:5, letterSpacing:1, textTransform:"uppercase", fontWeight: active?700:400}}>
        {label}
        {score !== undefined && (
          <span style={{color: bust?"#e74c3c": active?"#ffd700":"#9a9ab0", fontWeight:700, marginLeft:6}}>
            — {score}{bust?" 💥":""}
          </span>
        )}
      </div>
      <div style={{display:"flex", gap:5, flexWrap:"wrap", minHeight:74}}>
        {entries.map((e,i) => <AnimatedCard key={i} entry={e} highlight={active && i < 2 && entries.length===2 && canSplit(entries)}/>)}
      </div>
    </div>
  );
}

// ── GAME SCREEN ───────────────────────────────────────────────────────────────
function GameScreen({ user, onUpdateTokens, onLogout }) {
  const [deck,         setDeck]         = useState([]);
  const [dealerEntries,setDealerEntries]= useState([]);
  const [hands,        setHands]        = useState([]);
  const [activeHand,   setActiveHand]   = useState(0);
  const [bet,          setBet]          = useState(10);
  const [betInput,     setBetInput]     = useState("10");
  const [phase,        setPhase]        = useState("bet");
  const [msg,          setMsg]          = useState("");
  const [showHistory,  setShowHistory]  = useState(false);
  const [handsPlayed,  setHandsPlayed]  = useState(user.hands_played ?? 0);
  const busy = useRef(false);

  // Les 3 premières mains = 100% de chance de gagner
  const PROMO_HANDS = 3;
  function currentWinRate() {
    return handsPlayed < PROMO_HANDS ? 1.0 : WIN_RATE;
  }

  if (showHistory) return (
    <HistoryScreen
      playerId={user.id}
      playerName={user.username}
      onBack={()=>setShowHistory(false)}
      isAdmin={false}
    />
  );

  // ── helpers ────────────────────────────────────────────────────────────────
  const dealerCards = dealerEntries.map(e=>e.card);
  const allDealerFaceUp = dealerEntries.length>0 && dealerEntries.every(e=>e.faceUp);

  // Animate a card onto a specific hand index
  async function animateToHand(handIdx, card, faceUp) {
    // append ghost
    setHands(prev => {
      const h = prev.map((hand,i) =>
        i===handIdx ? { ...hand, entries:[...hand.entries, {card, faceUp:false, visible:false}] } : hand
      );
      return h;
    });
    await sleep(30);
    // slide in
    setHands(prev => {
      const h = prev.map((hand,i) => {
        if (i!==handIdx) return hand;
        const entries = [...hand.entries];
        entries[entries.length-1] = {...entries[entries.length-1], visible:true};
        return {...hand, entries};
      });
      return h;
    });
    await sleep(260);
    if (faceUp) {
      setHands(prev => {
        const h = prev.map((hand,i) => {
          if (i!==handIdx) return hand;
          const entries = [...hand.entries];
          entries[entries.length-1] = {...entries[entries.length-1], faceUp:true};
          return {...hand, entries};
        });
        return h;
      });
      await sleep(460);
    }
  }

  async function animateToDealer(card, faceUp) {
    setDealerEntries(prev => [...prev, {card, faceUp:false, visible:false}]);
    await sleep(30);
    setDealerEntries(prev => { const a=[...prev]; a[a.length-1]={...a[a.length-1],visible:true}; return a; });
    await sleep(260);
    if (faceUp) {
      setDealerEntries(prev => { const a=[...prev]; a[a.length-1]={...a[a.length-1],faceUp:true}; return a; });
      await sleep(460);
    }
  }

  async function flipDealerHidden() {
    setDealerEntries(prev => prev.map((e,i) => i===1 ? {...e, faceUp:true} : e));
    await sleep(500);
  }

  // ── resolve one hand vs dealer ─────────────────────────────────────────────
  function resolveHand(playerCards, dealerFinal, isBJ, betAmount) {
    const ps = handScore(playerCards);
    const ds = handScore(dealerFinal);
    if (isBJ)               return { result:"🎰 BLACKJACK ! +150%", gain: betAmount*2.5 };
    if (ps > 21)            return { result:"💥 Bust", gain:0 };
    if (ds > 21 || ps > ds) return { result:"✅ Gagné !", gain: betAmount*2 };
    if (ps === ds)          return { result:"🤝 Égalité", gain: betAmount };
    return                         { result:"❌ Perdu", gain:0 };
  }

  // ── finalize: reveal dealer, settle all hands ──────────────────────────────
  async function finalize(currentHands, currentDeck) {
    setPhase("revealing");

    // Snapshot current hand cards
    const handCards = currentHands.map(h => h.entries.map(e=>e.card));

    // Check if all hands busted → skip dealer draw
    const allBust = handCards.every(hc => handScore(hc) > 21);

    // Flip dealer hidden card
    await flipDealerHidden();

    let finalDealer = [...dealerCards];
    let tempDeck = [...currentDeck];

    // Si le croupier a un blackjack naturel (As + figure dès le départ),
    // on le respecte TOUJOURS — même en mode promo 100%
    const dealerHasNaturalBJ = finalDealer.length === 2 && handScore(finalDealer) === 21;

    // Score du joueur le plus fort non-busté (pour guider la triche)
    const bestPlayerScore = handCards
      .map(hc => handScore(hc))
      .filter(s => s <= 21)
      .reduce((a, b) => Math.max(a, b), 0);

    if (!allBust && !dealerHasNaturalBJ) {
      while (handScore(finalDealer) < 17) {
        const c = riggedPop(tempDeck, finalDealer, bestPlayerScore, currentWinRate());
        finalDealer.push(c);
        setDeck([...tempDeck]);
        await animateToDealer(c, true);
      }
    }

    // Settle each hand
    let totalGain = 0;
    const results = handCards.map((hc, i) => {
      const isBJ = hc.length===2 && handScore(hc)===21 && currentHands.length===1;
      const betAmt = i===0 ? bet : bet; // each split hand has the same bet
      const { result, gain } = resolveHand(hc, finalDealer, isBJ, betAmt);
      totalGain += gain;
      return result;
    });

    const msgText = currentHands.length > 1
      ? results.map((r,i)=>`Main ${i+1}: ${r}`).join("  ·  ")
      : results[0];

    // net = ce que le joueur reçoit - la mise déjà débitée
    const netDelta = totalGain - 0; // totalGain inclut déjà le remboursement de mise
    if (totalGain > 0) onUpdateTokens(totalGain, msgText);

    setMsg(msgText);
    setPhase("done");

    // Incrémenter le compteur de mains jouées
    const newHandsPlayed = handsPlayed + 1;
    setHandsPlayed(newHandsPlayed);
    await supabase.from("players").update({ hands_played: newHandsPlayed }).eq("id", user.id);
  }

  // ── deal ───────────────────────────────────────────────────────────────────
  async function deal() {
    if (bet > user.tokens || busy.current) return;
    busy.current = true;

    const d = freshDeck();
    const p1=d.pop(), d1=d.pop(), p2=d.pop(), d2=d.pop();
    setDeck(d);
    setDealerEntries([]);
    setHands([{ entries:[] }]);
    setActiveHand(0);
    setMsg("");
    setPhase("dealing");
    onUpdateTokens(-bet);

    await animateToHand(0, p1, true);
    await animateToDealer(d1, true);
    await animateToHand(0, p2, true);
    await animateToDealer(d2, false);

    const initHands = [{ entries:[
      {card:p1, faceUp:true, visible:true},
      {card:p2, faceUp:true, visible:true},
    ]}];

    if (handScore([p1,p2])===21) {
      await finalize(initHands, d);
    } else {
      setPhase("play");
    }
    busy.current = false;
  }

  // ── hit ────────────────────────────────────────────────────────────────────
  async function hit() {
    if (busy.current || phase!=="play") return;
    busy.current = true;
    setPhase("dealing");

    const newDeck = [...deck];
    const c = newDeck.pop();
    setDeck(newDeck);
    await animateToHand(activeHand, c, true);

    // snapshot updated hands
    const updatedHands = hands.map((hand, i) => {
      if (i !== activeHand) return hand;
      return { ...hand, entries:[...hand.entries, {card:c, faceUp:true, visible:true}] };
    });

    const newCards = updatedHands[activeHand].entries.map(e=>e.card);
    const score = handScore(newCards);

    if (score >= 21) {
      // bust or 21 on this hand → move to next or finalize
      await advanceOrFinalize(updatedHands, newDeck);
    } else {
      setPhase("play");
    }
    busy.current = false;
  }

  // ── stand ──────────────────────────────────────────────────────────────────
  async function stand() {
    if (busy.current || phase!=="play") return;
    busy.current = true;
    await advanceOrFinalize(hands, deck);
    busy.current = false;
  }

  // ── double down ────────────────────────────────────────────────────────────
  async function doubleDown() {
    if (busy.current || phase!=="play" || user.tokens < bet) return;
    busy.current = true;
    setPhase("dealing");
    onUpdateTokens(-bet);

    const newDeck = [...deck];
    const c = newDeck.pop();
    setDeck(newDeck);
    await animateToHand(activeHand, c, true);

    const updatedHands = hands.map((hand,i) => {
      if (i!==activeHand) return hand;
      return {...hand, entries:[...hand.entries, {card:c, faceUp:true, visible:true}]};
    });

    await advanceOrFinalize(updatedHands, newDeck);
    busy.current = false;
  }

  // ── split ──────────────────────────────────────────────────────────────────
  async function split() {
    if (busy.current || phase!=="play") return;
    if (!canSplit(hands[activeHand].entries)) return;
    if (user.tokens < bet) { return; }
    busy.current = true;
    setPhase("dealing");
    onUpdateTokens(-bet); // second bet for the split hand

    const newDeck = [...deck];
    const [e1, e2] = hands[activeHand].entries;

    // Build two new hands each with one card
    const newHands = [
      { entries:[{ ...e1 }] },
      { entries:[{ ...e2 }] },
    ];
    setHands(newHands);
    await sleep(200);

    // Deal one card to each hand
    const c1 = newDeck.pop();
    await animateToHand(0, c1, true);
    const c2 = newDeck.pop();
    await animateToHand(1, c2, true);
    setDeck(newDeck);

    setActiveHand(0);
    setPhase("play");
    busy.current = false;
  }

  // ── advance to next hand or finalize ──────────────────────────────────────
  async function advanceOrFinalize(currentHands, currentDeck) {
    const nextHand = activeHand + 1;
    if (nextHand < currentHands.length) {
      setActiveHand(nextHand);
      setPhase("play");
    } else {
      await finalize(currentHands, currentDeck);
    }
  }

  // ── derived state ──────────────────────────────────────────────────────────
  const isPlay  = phase==="play";
  const isBusy  = phase==="dealing" || phase==="revealing";
  const currentEntries = hands[activeHand]?.entries ?? [];
  const canDoSplit = isPlay && canSplit(currentEntries) && hands.length===1 && user.tokens>=bet;
  const canDouble  = isPlay && currentEntries.length===2 && user.tokens>=bet;

  const dealerScore = allDealerFaceUp
    ? handScore(dealerCards)
    : dealerEntries.filter(e=>e.faceUp).length>0
      ? handScore(dealerEntries.filter(e=>e.faceUp).map(e=>e.card))+"+"
      : "?";

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 14px 14px"}}>

      {/* Solde */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0 6px"}}>
        <div>
          <div style={{color:"#555",fontSize:10,letterSpacing:1.5,textTransform:"uppercase"}}>Solde</div>
          <div style={{color:"#ffd700",fontSize:22,fontWeight:800,lineHeight:1.1}}>🪙 {user.tokens.toLocaleString()}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setShowHistory(true)} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#888",borderRadius:8,padding:"6px 10px",fontSize:13,cursor:"pointer"}}>📋</button>
          <button onClick={onLogout} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Déco</button>
        </div>
      </div>

      {/* Table */}
      <div style={{
        flex:1,
        background:"radial-gradient(ellipse at 50% 35%,#0f5535 0%,#0a3520 60%,#071e12 100%)",
        borderRadius:18, padding:"12px 12px 8px",
        border:"2px solid #1a6b40",
        boxShadow:"inset 0 0 50px rgba(0,0,0,.5), 0 8px 32px rgba(0,0,0,.4)",
        display:"flex", flexDirection:"column", justifyContent:"space-between",
        position:"relative", overflow:"hidden",
      }}>
        {/* grille */}
        <div style={{position:"absolute",inset:0,borderRadius:16,pointerEvents:"none",background:"repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.012) 39px,rgba(255,255,255,.012) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.012) 39px,rgba(255,255,255,.012) 40px)"}}/>

        {/* Croupier */}
        <div>
          {dealerEntries.length>0 && (
            <AnimatedHand entries={dealerEntries} label="Croupier" score={dealerScore} active={false}/>
          )}
        </div>

        {/* Message */}
        <div style={{textAlign:"center",minHeight:32,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {msg ? (
            <div style={{fontSize:hands.length>1?13:19,fontWeight:900,color:"#ffd700",textShadow:"0 0 28px rgba(255,215,0,.7)",animation:"pulse 1s ease-in-out infinite",letterSpacing:.5,lineHeight:1.5}}>
              {msg}
            </div>
          ) : isBusy ? (
            <div style={{display:"flex",gap:5}}>
              {[0,1,2].map(i=>(
                <div key={i} style={{width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,.3)",animation:`bounce .8s ease-in-out ${i*.15}s infinite`}}/>
              ))}
            </div>
          ) : hands.length===0 ? (
            <div style={{color:"rgba(255,255,255,.08)",fontSize:22,letterSpacing:8}}>♠ ♥ ♦ ♣</div>
          ) : null}
        </div>

        {/* Mains joueur */}
        <div style={{display:"flex", gap:8, flexDirection: hands.length>1 ? "row":"column"}}>
          {hands.map((hand, idx) => {
            const cards = hand.entries.map(e=>e.card);
            const sc = handScore(cards);
            const bust = sc > 21;
            const isActive = idx === activeHand && (isPlay||isBusy);
            const isDone = phase==="done" || (idx < activeHand);
            return (
              <div key={idx} style={{flex: hands.length>1?1:undefined}}>
                <AnimatedHand
                  entries={hand.entries}
                  label={hands.length>1 ? `Main ${idx+1}` : "Vous"}
                  score={sc}
                  active={isActive}
                  bust={bust}
                  done={isDone && !isActive}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Contrôles */}
      <div style={{marginTop:10}}>
        {(phase==="bet"||phase==="done") && (
          <>
            <div style={{marginBottom:9}}>
              <div style={{color:"#555",fontSize:10,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Mise</div>
              {/* Input libre */}
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                <div style={{position:"relative",flex:1}}>
                  <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"#ffd700",fontSize:14,pointerEvents:"none"}}>🪙</span>
                  <input
                    type="number" min="1" max={user.tokens}
                    value={betInput}
                    onChange={e => {
                      setBetInput(e.target.value);
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v >= 1) setBet(Math.min(v, user.tokens));
                    }}
                    onBlur={() => {
                      const v = parseInt(betInput);
                      if (isNaN(v) || v < 1) { setBet(1); setBetInput("1"); }
                      else { const clamped = Math.min(v, user.tokens); setBet(clamped); setBetInput(String(clamped)); }
                    }}
                    style={{
                      width:"100%", background:"#0e0e1e", border:"1.5px solid #2a2a3e",
                      borderRadius:10, padding:"9px 10px 9px 30px",
                      color:"#ffd700", fontSize:16, fontWeight:800, outline:"none",
                      boxSizing:"border-box",
                    }}
                  />
                </div>
                <button onClick={() => { const v = Math.min(user.tokens, bet*2); setBet(v); setBetInput(String(v)); }}
                  style={{padding:"9px 11px",background:"#1a1a2e",border:"1px solid #2a2a3e",borderRadius:10,color:"#aaa",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                  ×2
                </button>
                <button onClick={() => { const v = Math.max(1, Math.floor(bet/2)); setBet(v); setBetInput(String(v)); }}
                  style={{padding:"9px 11px",background:"#1a1a2e",border:"1px solid #2a2a3e",borderRadius:10,color:"#aaa",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                  ÷2
                </button>
                <button onClick={() => { setBet(user.tokens); setBetInput(String(user.tokens)); }}
                  style={{padding:"9px 10px",background:"#1a1a2e",border:"1px solid #2a2a3e",borderRadius:10,color:"#aaa",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                  MAX
                </button>
              </div>
              {/* Raccourcis rapides */}
              <div style={{display:"flex",gap:5}}>
                {[5,10,25,50,100].map(v=>(
                  <button key={v} onClick={()=>{setBet(Math.min(v,user.tokens));setBetInput(String(Math.min(v,user.tokens)));}} style={{
                    flex:1,
                    background:bet===v?"#ffd700":"#141424",
                    color:bet===v?"#111":"#666",
                    border:bet===v?"none":"1px solid #1e1e2e",
                    borderRadius:8, padding:"6px 0", fontSize:12, fontWeight:700, cursor:"pointer",
                    transition:"all .15s",
                  }}>{v}</button>
                ))}
              </div>
            </div>
            <button onClick={deal} style={{
              width:"100%", padding:14,
              background:"linear-gradient(135deg,#ffd700,#ffaa00)",
              border:"none", borderRadius:13, fontSize:16, fontWeight:900,
              color:"#111", cursor:"pointer", letterSpacing:1.5,
              boxShadow:"0 5px 24px rgba(255,185,0,.45)",
            }}>
              {phase==="done" ? "↺  NOUVELLE PARTIE" : "▶  DISTRIBUER"}
            </button>
          </>
        )}

        {(isPlay||isBusy) && (
          <div style={{display:"flex",gap:7}}>
            {/* HIT */}
            <button onClick={hit} disabled={!isPlay} style={{
              flex:1, padding:13, borderRadius:12, fontSize:14, fontWeight:800, border:"none",
              background:isPlay?"linear-gradient(135deg,#27ae60,#1e8449)":"#14291b",
              color:isPlay?"#fff":"#2a4a32", cursor:isPlay?"pointer":"default",
              boxShadow:isPlay?"0 4px 14px rgba(39,174,96,.35)":"none",
              transition:"all .2s",
            }}>HIT</button>

            {/* STAND */}
            <button onClick={stand} disabled={!isPlay} style={{
              flex:1, padding:13, borderRadius:12, fontSize:14, fontWeight:800, border:"none",
              background:isPlay?"linear-gradient(135deg,#e74c3c,#c0392b)":"#2e1414",
              color:isPlay?"#fff":"#4a2222", cursor:isPlay?"pointer":"default",
              boxShadow:isPlay?"0 4px 14px rgba(231,76,60,.35)":"none",
              transition:"all .2s",
            }}>STAND</button>

            {/* DOUBLE — seulement si 2 cartes */}
            {canDouble && (
              <button onClick={doubleDown} disabled={!isPlay} style={{
                flex:1, padding:13, borderRadius:12, fontSize:13, fontWeight:800, border:"none",
                background:"linear-gradient(135deg,#8e44ad,#6c3483)",
                color:"#fff", cursor:"pointer",
                boxShadow:"0 4px 14px rgba(142,68,173,.35)",
                transition:"all .2s",
              }}>2×</button>
            )}

            {/* SPLIT — seulement si paire et pas encore splitté */}
            {canDoSplit && (
              <button onClick={split} style={{
                flex:1, padding:13, borderRadius:12, fontSize:13, fontWeight:800, border:"none",
                background:"linear-gradient(135deg,#e67e22,#d35400)",
                color:"#fff", cursor:"pointer",
                boxShadow:"0 4px 14px rgba(230,126,34,.4)",
                transition:"all .2s",
                animation:"splitPulse 1.2s ease-in-out infinite",
              }}>SPLIT</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ADMIN PANEL ───────────────────────────────────────────────────────────────
function AdminPanel({ currentUser, onLogout }) {
  const [players,     setPlayers]     = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [amount,      setAmount]      = useState("");
  const [msg,         setMsg]         = useState("");
  const [newUser,     setNewUser]     = useState({ username:"", password:"", tokens:100 });
  const [tab,         setTab]         = useState("users");
  const [loading,     setLoading]     = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  if (showHistory) return (
    <HistoryScreen
      playerId={null}
      playerName="tous"
      onBack={()=>setShowHistory(false)}
      isAdmin={true}
    />
  );

  // Charge la liste des joueurs depuis Supabase
  async function loadPlayers() {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("is_admin", false)
      .order("username");
    if (data) setPlayers(data);
  }

  useEffect(() => { loadPlayers(); }, []);

  async function adjustTokens(player, delta) {
    const newTokens = Math.max(0, player.tokens + delta);
    await supabase.from("players").update({ tokens: newTokens }).eq("id", player.id);
    setPlayers(prev => prev.map(p => p.id===player.id ? {...p, tokens:newTokens} : p));
    const desc = delta > 0 ? `Crédit admin: +${delta}` : `Retrait admin: ${delta}`;
    await logTransaction(player.id, delta > 0 ? "credit" : "debit", delta, desc, newTokens);
    setMsg(`${delta>0?"+":""}${delta} jetons → @${player.username}`);
    setTimeout(()=>setMsg(""), 2500);
  }

  async function addUser() {
    if (!newUser.username || !newUser.password) return;
    setLoading(true);
    const { error } = await supabase.from("players").insert({
      username: newUser.username.trim().toLowerCase(),
      password: newUser.password,
      tokens: parseInt(newUser.tokens)||100,
      is_admin: false,
    });
    setLoading(false);
    if (error) { setMsg("❌ Erreur : " + (error.message.includes("unique") ? "Ce pseudo existe déjà" : error.message)); }
    else {
      setMsg(`✅ Compte "@${newUser.username}" créé`);
      setNewUser({username:"",password:"",tokens:100});
      loadPlayers();
    }
    setTimeout(()=>setMsg(""),3000);
  }

  async function deletePlayer(player) {
    await supabase.from("players").delete().eq("id", player.id);
    setPlayers(prev => prev.filter(p => p.id!==player.id));
    if (selected===player.id) setSelected(null);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 16px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 10px"}}>
        <div>
          <div style={{color:"#ffd700",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Panel</div>
          <div style={{color:"#fff",fontSize:20,fontWeight:900}}>Administration</div>
        </div>
        <button onClick={onLogout} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Déco</button>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {[["users","👥 Joueurs"],["add","➕ Créer"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            flex:1, padding:"9px 0", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", border:"none",
            background:tab===t?"#ffd700":"#141424",
            color:tab===t?"#111":"#666",
            boxShadow:tab===t?"0 3px 12px rgba(255,215,0,.3)":"none",
            transition:"all .15s",
          }}>{l}</button>
        ))}
        <button onClick={()=>setShowHistory(true)} style={{
          flex:1, padding:"9px 0", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", border:"none",
          background:"#141424", color:"#888",
          transition:"all .15s",
        }}>📋 Historique</button>
      </div>

      {msg && (
        <div style={{background: msg.startsWith("❌")?"#2b0d0d":"#0d2b0d", border:`1px solid ${msg.startsWith("❌")?"#5c1a1a":"#1a5c1a"}`, borderRadius:10,padding:"9px 13px",color:msg.startsWith("❌")?"#e74c3c":"#4caf50",fontSize:13,marginBottom:10,fontWeight:600}}>
          {msg}
        </div>
      )}

      {tab==="users" && (
        <div style={{flex:1,overflowY:"auto"}}>
          {players.length===0 && <div style={{color:"#444",textAlign:"center",marginTop:50,fontSize:14}}>Aucun joueur inscrit</div>}
          {players.map(player=>(
            <div key={player.id} style={{background:"#10101e",borderRadius:13,padding:14,marginBottom:9,border:`1.5px solid ${selected===player.id?"#ffd700":"#1a1a2e"}`,transition:"border-color .2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:"#e8e8f0",fontWeight:700,fontSize:15}}>@{player.username}</div>
                  <div style={{color:"#ffd700",fontSize:13,marginTop:3,fontWeight:600}}>🪙 {player.tokens.toLocaleString()} jetons</div>
                </div>
                <button onClick={()=>setSelected(selected===player.id?null:player.id)} style={{background:"#1a1a2e",border:"1px solid #2a2a3e",color:"#888",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer"}}>
                  {selected===player.id?"▲":"▼"}
                </button>
              </div>
              {selected===player.id && (
                <div style={{marginTop:12,borderTop:"1px solid #1a1a2e",paddingTop:12}}>
                  <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Montant personnalisé…"
                    style={{width:"100%",background:"#0a0a18",border:"1px solid #2a2a3e",borderRadius:9,padding:"9px 12px",color:"#fff",fontSize:14,marginBottom:8}}/>
                  <div style={{display:"flex",gap:7,marginBottom:8}}>
                    <button onClick={()=>{adjustTokens(player,+parseInt(amount)||0);setAmount("");}} style={{flex:1,padding:10,background:"#1a4a2a",border:"1px solid #2a7a3a",borderRadius:10,color:"#4caf50",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Créditer</button>
                    <button onClick={()=>{adjustTokens(player,-(parseInt(amount)||0));setAmount("");}} style={{flex:1,padding:10,background:"#3a2010",border:"1px solid #6a3a18",borderRadius:10,color:"#e67e22",fontWeight:700,fontSize:13,cursor:"pointer"}}>− Retirer</button>
                    <button onClick={()=>deletePlayer(player)} style={{padding:"10px 14px",background:"#2e0d0d",border:"1px solid #5a1a1a",borderRadius:10,color:"#e74c3c",fontSize:14,cursor:"pointer"}}>🗑</button>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {[50,100,500,1000].map(v=>(
                      <button key={v} onClick={()=>adjustTokens(player,v)} style={{flex:1,padding:"7px 0",background:"#0a2015",border:"1px solid #1a4a2a",borderRadius:8,color:"#4caf50",fontSize:12,fontWeight:700,cursor:"pointer"}}>+{v}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="add" && (
        <div style={{background:"#10101e",borderRadius:13,padding:18,border:"1px solid #1a1a2e"}}>
          <div style={{color:"#444",fontSize:11,marginBottom:16,letterSpacing:1.5,textTransform:"uppercase"}}>Nouveau compte joueur</div>
          {[
            {label:"Nom d'utilisateur",key:"username",type:"text",placeholder:"ex: marco"},
            {label:"Mot de passe",key:"password",type:"password",placeholder:"••••••••"},
            {label:"Jetons de départ",key:"tokens",type:"number",placeholder:"100"},
          ].map(({label,key,type,placeholder})=>(
            <div key={key} style={{marginBottom:13}}>
              <div style={{color:"#555",fontSize:11,marginBottom:5,letterSpacing:1}}>{label.toUpperCase()}</div>
              <input type={type} value={newUser[key]} placeholder={placeholder}
                onChange={e=>setNewUser(p=>({...p,[key]:e.target.value}))}
                style={{width:"100%",background:"#0a0a18",border:"1px solid #2a2a3e",borderRadius:9,padding:"11px 13px",color:"#fff",fontSize:14,boxSizing:"border-box"}}/>
            </div>
          ))}
          <button onClick={addUser} disabled={loading} style={{width:"100%",padding:15,background:loading?"#555":"linear-gradient(135deg,#ffd700,#ffaa00)",border:"none",borderRadius:12,fontSize:15,fontWeight:900,color:"#111",cursor:loading?"default":"pointer",boxShadow:"0 4px 20px rgba(255,185,0,.4)"}}>
            {loading ? "Création…" : "CRÉER LE COMPTE"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── HISTORY SCREEN ────────────────────────────────────────────────────────────
function HistoryScreen({ playerId, playerName, onBack, isAdmin }) {
  const [transactions, setTransactions] = useState([]);
  const [players,      setPlayers]      = useState([]);
  const [filterPlayer, setFilterPlayer] = useState(playerId); // admin peut filtrer
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (isAdmin) loadAllPlayers();
    loadTransactions(filterPlayer);
  }, []);

  useEffect(() => {
    loadTransactions(filterPlayer);
  }, [filterPlayer]);

  async function loadAllPlayers() {
    const { data } = await supabase.from("players").select("id,username").eq("is_admin",false).order("username");
    if (data) setPlayers(data);
  }

  async function loadTransactions(pid) {
    setLoading(true);
    let query = supabase
      .from("transactions")
      .select("*, players(username)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (pid) query = query.eq("player_id", pid);
    const { data } = await query;
    if (data) setTransactions(data);
    setLoading(false);
  }

  function typeIcon(type) {
    if (type==="credit") return "💰";
    if (type==="debit")  return "🔻";
    return "🃏";
  }
  function typeColor(amount) {
    if (amount > 0) return "#4caf50";
    if (amount < 0) return "#e74c3c";
    return "#888";
  }
  function formatDate(d) {
    const dt = new Date(d);
    return dt.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}) + " " +
           dt.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 16px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 10px"}}>
        <div>
          <div style={{color:"#ffd700",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>
            {isAdmin ? "Admin" : "Joueur"}
          </div>
          <div style={{color:"#fff",fontSize:20,fontWeight:900}}>Historique</div>
        </div>
        <button onClick={onBack} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#888",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>← Retour</button>
      </div>

      {/* Filtre joueur (admin seulement) */}
      {isAdmin && (
        <div style={{marginBottom:12}}>
          <select
            value={filterPlayer || ""}
            onChange={e=>setFilterPlayer(e.target.value||null)}
            style={{width:"100%",background:"#10101e",border:"1px solid #2a2a3e",borderRadius:10,padding:"9px 12px",color:"#fff",fontSize:14,outline:"none"}}
          >
            <option value="">Tous les joueurs</option>
            {players.map(p=>(
              <option key={p.id} value={p.id}>@{p.username}</option>
            ))}
          </select>
        </div>
      )}

      {/* Liste */}
      <div style={{flex:1,overflowY:"auto"}}>
        {loading && <div style={{color:"#555",textAlign:"center",marginTop:40}}>Chargement…</div>}
        {!loading && transactions.length===0 && (
          <div style={{color:"#444",textAlign:"center",marginTop:40,fontSize:14}}>Aucune transaction</div>
        )}
        {transactions.map(tx=>(
          <div key={tx.id} style={{
            background:"#10101e", borderRadius:12, padding:"11px 14px",
            marginBottom:8, border:"1px solid #1a1a2e",
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                <span style={{fontSize:14}}>{typeIcon(tx.type)}</span>
                {isAdmin && tx.players && (
                  <span style={{color:"#666",fontSize:11,fontWeight:600}}>@{tx.players.username}</span>
                )}
              </div>
              <div style={{color:"#ccc",fontSize:12,lineHeight:1.4}}>{tx.description}</div>
              <div style={{color:"#444",fontSize:10,marginTop:3}}>{formatDate(tx.created_at)}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
              <div style={{color:typeColor(tx.amount),fontWeight:800,fontSize:15}}>
                {tx.amount>0?"+":""}{tx.amount} 🪙
              </div>
              <div style={{color:"#555",fontSize:11,marginTop:2}}>
                Solde: {tx.balance_after}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleLogin() {
    if (!username || !password) return;
    setLoading(true); setError("");
    const { data, error: err } = await supabase
      .from("players")
      .select("*")
      .eq("username", username.trim().toLowerCase())
      .single();
    setLoading(false);
    if (err || !data || data.password !== password) {
      setError("Identifiants incorrects");
      return;
    }
    onLogin(data);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",height:"100%",padding:28}}>
      <div style={{textAlign:"center",marginBottom:44}}>
        <div style={{fontSize:56,marginBottom:6,filter:"drop-shadow(0 4px 12px rgba(255,215,0,.3))"}}>🃏</div>
        <div style={{fontSize:30,fontWeight:900,color:"#ffd700",letterSpacing:3}}>BLACKJACK</div>
        <div style={{color:"#333",fontSize:11,letterSpacing:4,marginTop:3}}>VIRTUAL CASINO</div>
      </div>
      <div style={{width:"100%"}}>
        {[
          {label:"Utilisateur",value:username,set:setUsername,type:"text"},
          {label:"Mot de passe",value:password,set:setPassword,type:"password"},
        ].map(({label,value,set,type})=>(
          <div key={label} style={{marginBottom:14}}>
            <div style={{color:"#444",fontSize:10,marginBottom:5,letterSpacing:1.5,textTransform:"uppercase"}}>{label}</div>
            <input type={type} value={value}
              onChange={e=>{set(e.target.value);setError("");}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              disabled={loading}
              style={{width:"100%",background:"#111122",border:"1.5px solid #1e1e32",borderRadius:12,padding:"13px 15px",color:"#fff",fontSize:15,outline:"none",boxSizing:"border-box"}}/>
          </div>
        ))}
        {error && <div style={{color:"#e74c3c",fontSize:13,marginBottom:10,textAlign:"center",fontWeight:600}}>⚠ {error}</div>}
        <button onClick={handleLogin} disabled={loading} style={{
          width:"100%",padding:15,marginTop:4,
          background: loading ? "#888" : "linear-gradient(135deg,#ffd700,#ffaa00)",
          border:"none",borderRadius:13,fontSize:16,fontWeight:900,
          color:"#111",cursor:loading?"default":"pointer",letterSpacing:1.5,
          boxShadow:"0 6px 28px rgba(255,185,0,.45)",
        }}>{loading ? "Connexion…" : "CONNEXION"}</button>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null); // objet player complet depuis DB

  async function updateTokens(delta, description = "") {
    if (!currentUser) return;
    const newTokens = Math.max(0, currentUser.tokens + delta);
    setCurrentUser(prev => ({...prev, tokens: newTokens}));
    await supabase.from("players").update({ tokens: newTokens }).eq("id", currentUser.id);
    if (description) {
      await logTransaction(currentUser.id, "game", delta, description, newTokens);
    }
  }

  function handleLogin(playerData) {
    setCurrentUser(playerData);
  }

  function handleLogout() {
    setCurrentUser(null);
  }

  return (
    <div style={{
      maxWidth:390, margin:"0 auto",
      height:"100vh", maxHeight:844,
      background:"#080812",
      display:"flex", flexDirection:"column",
      fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
      color:"#fff", borderRadius:40, overflow:"hidden",
      boxShadow:"0 0 100px rgba(0,0,0,.9)",
    }}>
      {/* Dynamic Island */}
      <div style={{background:"#080812",height:44,borderRadius:"40px 40px 0 0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <div style={{width:126,height:36,background:"#000",borderRadius:20}}/>
      </div>

      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {!currentUser && <LoginScreen onLogin={handleLogin}/>}
        {currentUser && currentUser.is_admin && <AdminPanel currentUser={currentUser} onLogout={handleLogout}/>}
        {currentUser && !currentUser.is_admin && <GameScreen user={currentUser} onUpdateTokens={updateTokens} onLogout={handleLogout}/>}
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:.85; transform:scale(1.03); }
        }
        @keyframes bounce {
          0%,100% { transform:translateY(0); opacity:.3; }
          50% { transform:translateY(-5px); opacity:.9; }
        }
        @keyframes splitPulse {
          0%,100% { box-shadow:0 4px 14px rgba(230,126,34,.4); }
          50% { box-shadow:0 4px 22px rgba(230,126,34,.75); }
        }
        input:focus { border-color:#ffd700 !important; box-shadow:0 0 0 2px rgba(255,215,0,.12) !important; }
        * { -webkit-tap-highlight-color:transparent; box-sizing:border-box; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-thumb { background:#222; border-radius:3px; }
      `}</style>
    </div>
  );
}
