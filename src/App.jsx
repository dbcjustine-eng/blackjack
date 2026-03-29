import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";
import { PokerLobby, PokerRoom, PokerSoloBots } from "./Poker.jsx";

// ── TRANSACTION LOGGER ────────────────────────────────────────────────────────
export async function logTransaction(playerId, type, amount, description, balanceAfter) {
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

export function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit:s, rank:r });
  for (let i = d.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [d[i],d[j]] = [d[j],d[i]];
  }
  return d;
}

// Pioche légèrement biaisée — 47% de chance de gagner pour le joueur
const WIN_RATE = 0.47;
const CHEAT_POOL = 4;

function riggedPop(deck, dealerCurrent = [], playerScore = 0) {
  if (deck.length === 0) return null;
  const pool = deck.slice(-CHEAT_POOL);
  const dealerShouldWin = Math.random() > WIN_RATE;
  let chosen = null;
  if (dealerShouldWin) {
    let bestScore = -1;
    for (const c of pool) {
      const trial = handScore([...dealerCurrent, c]);
      if (trial <= 21 && trial > playerScore && trial > bestScore) { bestScore = trial; chosen = c; }
    }
    if (!chosen) {
      for (const c of pool) {
        const trial = handScore([...dealerCurrent, c]);
        if (trial <= 21 && trial > bestScore) { bestScore = trial; chosen = c; }
      }
    }
  }
  if (!chosen) {
    let worstScore = 999;
    for (const c of pool) {
      const trial = handScore([...dealerCurrent, c]);
      if (trial < worstScore) { worstScore = trial; chosen = c; }
    }
  }
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

    if (!allBust && !dealerHasNaturalBJ) {
      while (handScore(finalDealer) < 17) {
        const c = riggedPop(tempDeck, finalDealer, handCards.map(hc=>handScore(hc)).filter(s=>s<=21).reduce((a,b)=>Math.max(a,b),0));
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


// ── LOBBY SCREEN ─────────────────────────────────────────────────────────────
function LobbyScreen({ user, onEnterRoom, onSolo, onPoker, onLogout }) {
  const [roomCode,  setRoomCode]  = useState("");
  const [creating,  setCreating]  = useState(false);
  const [joining,   setJoining]   = useState(false);
  const [error,     setError]     = useState("");

  async function createRoom() {
    setCreating(true); setError("");
    // Génère un code unique
    let code = "";
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i=0;i<4;i++) code += chars[Math.floor(Math.random()*chars.length)];

    const { data, error: err } = await supabase.from("rooms").insert({
      code,
      host_id: user.id,
      status: "waiting",
      dealer_cards: [],
      deck: freshDeck(),
    }).select().single();
    setCreating(false);
    if (err) { setError("Erreur création"); return; }
    // Rejoindre la salle comme hôte
    await supabase.from("room_players").insert({
      room_id: data.id, player_id: user.id, status:"waiting", seat:0, hands:[[]], bet:0
    });
    onEnterRoom(data.id, true);
  }

  async function joinRoom() {
    if (!roomCode.trim()) return;
    setJoining(true); setError("");
    const { data: room } = await supabase.from("rooms").select("*").eq("code", roomCode.trim().toUpperCase()).single();
    if (!room) { setError("Salle introuvable"); setJoining(false); return; }
    if (room.status !== "waiting") { setError("Partie déjà en cours"); setJoining(false); return; }
    // Compter les joueurs
    const { data: rp } = await supabase.from("room_players").select("seat").eq("room_id", room.id);
    if (rp && rp.length >= 6) { setError("Table complète (6/6)"); setJoining(false); return; }
    // Vérifier si déjà dans la salle
    const already = rp?.find(r => r.player_id === user.id);
    const seat = rp ? rp.length : 0;
    if (!already) {
      await supabase.from("room_players").insert({
        room_id: room.id, player_id: user.id, status:"waiting", seat, hands:[[]], bet:0
      });
    }
    setJoining(false);
    onEnterRoom(room.id, room.host_id === user.id);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 20px 20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 16px"}}>
        <div>
          <div style={{color:"#ffd700",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Casino</div>
          <div style={{color:"#fff",fontSize:22,fontWeight:900}}>Bienvenue, @{user.username}</div>
        </div>
        <button onClick={onLogout} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Déco</button>
      </div>

      <div style={{color:"#555",fontSize:10,marginBottom:20,letterSpacing:1,textTransform:"uppercase",textAlign:"center"}}>
        🪙 {user.tokens.toLocaleString()} jetons
      </div>

      {/* Solo */}
      <button onClick={onSolo} style={{
        width:"100%", padding:16, marginBottom:10,
        background:"linear-gradient(135deg,#ffd700,#ffaa00)",
        border:"none", borderRadius:14, fontSize:16, fontWeight:900,
        color:"#111", cursor:"pointer", letterSpacing:1,
        boxShadow:"0 5px 24px rgba(255,185,0,.4)",
      }}>🃏 Blackjack solo</button>

      <button onClick={onPoker} style={{
        width:"100%", padding:16, marginBottom:12,
        background:"linear-gradient(135deg,#e74c3c,#c0392b)",
        border:"none", borderRadius:14, fontSize:16, fontWeight:900,
        color:"#fff", cursor:"pointer", letterSpacing:1,
        boxShadow:"0 5px 24px rgba(231,76,60,.35)",
      }}>♠ Poker Texas Hold'em</button>

      <div style={{display:"flex",alignItems:"center",gap:10,margin:"4px 0 14px"}}>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/>
        <div style={{color:"#333",fontSize:12}}>blackjack multijoueur</div>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/>
      </div>

      {/* Créer */}
      <button onClick={createRoom} disabled={creating} style={{
        width:"100%", padding:14, marginBottom:10,
        background:creating?"#1a1a2e":"#0d2b1a",
        border:"1.5px solid #1a5c2a", borderRadius:14, fontSize:15, fontWeight:800,
        color:creating?"#444":"#4caf50", cursor:creating?"default":"pointer",
      }}>{creating ? "Création…" : "➕ Créer une table blackjack"}</button>

      {/* Rejoindre */}
      <div style={{display:"flex",gap:8}}>
        <input
          value={roomCode} onChange={e=>{setRoomCode(e.target.value.toUpperCase());setError("");}}
          onKeyDown={e=>e.key==="Enter"&&joinRoom()}
          placeholder="Code ex: K7X2"
          maxLength={4}
          style={{flex:1,background:"#10101e",border:"1.5px solid #1a1a2e",borderRadius:12,padding:"13px 14px",color:"#fff",fontSize:16,fontWeight:700,letterSpacing:3,outline:"none",textAlign:"center"}}
        />
        <button onClick={joinRoom} disabled={joining} style={{
          padding:"13px 18px", background:"#0d1a3a", border:"1.5px solid #1a3a6c",
          borderRadius:12, fontSize:15, fontWeight:800, color:"#5b8de8", cursor:"pointer",
        }}>{joining?"…":"Rejoindre"}</button>
      </div>

      {error && <div style={{color:"#e74c3c",fontSize:13,marginTop:10,textAlign:"center",fontWeight:600}}>⚠ {error}</div>}
    </div>
  );
}

// ── ROOM SCREEN ───────────────────────────────────────────────────────────────
function RoomScreen({ user, roomId, isHost: initIsHost, onLeave, onUpdateTokens }) {
  const [room,        setRoom]        = useState(null);
  const [roomPlayers, setRoomPlayers] = useState([]);
  const [myRp,        setMyRp]        = useState(null);
  const [betInput,    setBetInput]    = useState("10");
  const busy = useRef(false);

  const isHost = room?.host_id === user.id;

  // ── Realtime + chargement ──────────────────────────────────────────────────
  useEffect(() => {
    loadRoom(); loadRoomPlayers();
    const sub = supabase.channel("room-"+roomId)
      .on("postgres_changes",{event:"*",schema:"public",table:"rooms",filter:`id=eq.${roomId}`}, p => {
        setRoom(p.new);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"room_players",filter:`room_id=eq.${roomId}`}, p => {
        if (p.eventType==="DELETE") { setRoomPlayers(prev=>prev.filter(x=>x.id!==p.old?.id)); return; }
        setRoomPlayers(prev => {
          const exists = prev.find(x=>x.id===p.new.id);
          // Recalculer tokens affichés si la mise a changé
          const prevTokens = exists?.players?.tokens;
          const players = exists?.players ? {...exists.players} : (p.new.players ?? {});
          // Mettre à jour le solde affiché si on a la valeur en DB
          const merged = {...p.new, players};
          if (exists) return prev.map(x=>x.id===p.new.id ? merged : x);
          loadRoomPlayers(); // nouveau joueur → recharger pour avoir le username
          return prev;
        });
        if (p.new.player_id===user.id) setMyRp(p.new);
      })
      .subscribe();

    // Rafraîchir les tokens des joueurs en temps réel
    const playerIds_ref = { ids: [] };
    const tokenSub = supabase.channel("tokens-"+roomId)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"players"}, p => {
        setRoomPlayers(prev => prev.map(rp =>
          rp.player_id===p.new.id
            ? {...rp, players:{...rp.players, tokens:p.new.tokens}}
            : rp
        ));
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); supabase.removeChannel(tokenSub); };
  }, [roomId]);

  async function loadRoom() {
    const { data } = await supabase.from("rooms").select("*").eq("id",roomId).single();
    if (data) setRoom(data);
  }
  async function loadRoomPlayers() {
    const { data } = await supabase.from("room_players").select("*, players(username,tokens)").eq("room_id",roomId).order("seat");
    if (data) { setRoomPlayers(data); const me=data.find(p=>p.player_id===user.id); if(me) setMyRp(me); }
  }

  // ── Mise ──────────────────────────────────────────────────────────────────
  async function placeBet() {
    const b = parseInt(betInput)||0;
    if (b<1||b>user.tokens||!myRp) return;
    await supabase.from("room_players").update({bet:b,status:"ready"}).eq("id",myRp.id);
    onUpdateTokens(-b,"");
    // Si la room est "finished", la remettre en waiting pour la nouvelle manche
    const { data: roomNow } = await supabase.from("rooms").select("status").eq("id",roomId).single();
    if (roomNow?.status==="finished") {
      await supabase.from("rooms").update({status:"waiting",dealer_cards:[],deck:freshDeck(),action_seat:0}).eq("id",roomId);
    }
    // Vérifier si tout le monde a misé → lancer auto
    const { data: allRp } = await supabase.from("room_players").select("status").eq("room_id",roomId);
    const allReady = allRp && allRp.length >= 2 && allRp.every(p=>p.status==="ready");
    if (allReady) await startGame(allRp);
  }

  // ── Lancer la partie (auto dès que tout le monde est prêt) ──────────────
  async function startGame(cachedPlayers) {
    if (busy.current) return;
    busy.current=true;
    const { data: freshPlayers } = await supabase.from("room_players")
      .select("*, players(username,tokens)").eq("room_id",roomId).order("seat");
    // Vérifier statut room (pas déjà lancée)
    const { data: roomCheck } = await supabase.from("rooms").select("status").eq("id",roomId).single();
    if (roomCheck?.status !== "waiting" && roomCheck?.status !== "finished") { busy.current=false; return; }
    const active = (freshPlayers||[]).filter(p=>p.status==="ready");
    if (active.length===0) { busy.current=false; return; }

    const deck = freshDeck();
    const d1=deck.pop(), dHidden=deck.pop();
    const dealerCards=[{...d1,faceUp:true},{...dHidden,faceUp:false}];

    // Distribuer + détecter blackjack naturel
    const distributed = [];
    for (const rp of active) {
      const c1=deck.pop(), c2=deck.pop();
      const isNaturalBJ = handScore([c1,c2])===21;
      // Si blackjack naturel → statut "done" directement (sauf si dealer BJ aussi, géré au settlement)
      const status = isNaturalBJ ? "done" : "playing";
      await supabase.from("room_players").update({
        hands:[[{card:c1,faceUp:true,visible:true},{card:c2,faceUp:true,visible:true}]],
        active_hand:0, status,
      }).eq("id",rp.id);
      distributed.push({...rp, bjStatus: status});
    }

    // Premier joueur qui doit encore jouer
    const stillPlaying = distributed.filter(p=>p.bjStatus==="playing").sort((a,b)=>a.seat-b.seat);
    const firstSeat = stillPlaying.length>0 ? stillPlaying[0].seat : -1;

    await supabase.from("rooms").update({
      status:"playing", dealer_cards:dealerCards, deck,
      action_seat: firstSeat, // -1 si tout le monde a BJ → dealer joue direct
    }).eq("id",roomId);

    await loadRoomPlayers();
    // Si tout le monde a BJ, dealer joue immédiatement (après un court délai)
    if (firstSeat===-1) {
      await sleep(800);
      await dealerPlay();
    }
    busy.current=false;
  }

  // ── Avancer au prochain joueur ────────────────────────────────────────────
  async function advanceToNext(currentSeat) {
    const { data: allRp } = await supabase.from("room_players")
      .select("seat,status").eq("room_id",roomId).order("seat");
    const stillPlaying = (allRp||[]).filter(p=>p.status==="playing"&&p.seat!==currentSeat);
    if (stillPlaying.length===0) {
      // Tout le monde a joué → dealer joue
      const { data: freshRoom } = await supabase.from("rooms").select("status,host_id").eq("id",roomId).single();
      if (freshRoom?.status==="playing" && freshRoom?.host_id===user.id) {
        await dealerPlay();
      } else if (freshRoom?.status==="playing") {
        // Si non-hôte est le dernier → l'hôte doit quand même déclencher
        // On met un statut intermédiaire pour signaler que c'est l'hôte qui doit agir
        await supabase.from("rooms").update({action_seat:-1}).eq("id",roomId);
      }
    } else {
      // Prochain siège actif après currentSeat
      const sorted = stillPlaying.map(p=>p.seat).sort((a,b)=>a-b);
      const next = sorted.find(s=>s>currentSeat) ?? sorted[0];
      await supabase.from("rooms").update({action_seat:next}).eq("id",roomId);
    }
  }

  // Surveiller action_seat=-1 → l'hôte lance dealerPlay
  useEffect(()=>{
    if (room?.action_seat===-1 && room?.status==="playing" && isHost && !busy.current) {
      busy.current=true;
      dealerPlay().then(()=>{ busy.current=false; });
    }
  },[room?.action_seat, room?.status, isHost]);

  // ── Hit ───────────────────────────────────────────────────────────────────
  async function hit() {
    if (!myRp||myRp.status!=="playing"||room?.action_seat!==myRp.seat||busy.current) return;
    busy.current=true;
    const { data: fr } = await supabase.from("rooms").select("deck").eq("id",roomId).single();
    const deck=[...(fr.deck||[])];
    const c=deck.pop();
    const hands=JSON.parse(JSON.stringify(myRp.hands));
    const activeIdx=myRp.active_hand||0;
    hands[activeIdx].push({card:c,faceUp:true,visible:true});
    const score=handScore(hands[activeIdx].map(e=>e.card||e));
    // Si split: vérifier s'il reste une main à jouer
    let newStatus="playing", newActiveHand=activeIdx;
    if(score>=21) {
      // Passer à la main suivante si split
      if(activeIdx+1 < hands.length) { newActiveHand=activeIdx+1; newStatus="playing"; }
      else newStatus="done";
    }
    await supabase.from("room_players").update({hands,status:newStatus,active_hand:newActiveHand}).eq("id",myRp.id);
    await supabase.from("rooms").update({deck}).eq("id",roomId);
    if (newStatus==="done") await advanceToNext(myRp.seat);
    busy.current=false;
  }

  // ── Stand ─────────────────────────────────────────────────────────────────
  async function stand() {
    if (!myRp||myRp.status!=="playing"||room?.action_seat!==myRp.seat||busy.current) return;
    busy.current=true;
    const activeIdx=myRp.active_hand||0;
    const hands=myRp.hands||[[]];
    // Si split et encore une main à jouer
    if(activeIdx+1 < hands.length) {
      await supabase.from("room_players").update({active_hand:activeIdx+1,status:"playing"}).eq("id",myRp.id);
    } else {
      await supabase.from("room_players").update({status:"done"}).eq("id",myRp.id);
      await advanceToNext(myRp.seat);
    }
    busy.current=false;
  }

  // ── Dealer joue ───────────────────────────────────────────────────────────
  async function dealerPlay() {
    const { data: fr } = await supabase.from("rooms").select("*").eq("id",roomId).single();
    let dealer=[...(fr.dealer_cards||[])];
    let deck=[...(fr.deck||[])];
    dealer=dealer.map(c=>({...c,faceUp:true}));
    await supabase.from("rooms").update({dealer_cards:dealer,action_seat:-2}).eq("id",roomId);
    await sleep(600);
    const dealerCards=dealer.map(c=>c.card||c);
    while(handScore(dealerCards)<17){
      const c=deck.pop(); // jeu aléatoire en multijoueur
      dealerCards.push(c);
      dealer.push({card:c,faceUp:true,visible:true});
      await supabase.from("rooms").update({dealer_cards:dealer,deck}).eq("id",roomId);
      await sleep(700);
    }
    const ds=handScore(dealerCards);
    const { data: finalRp } = await supabase.from("room_players").select("*, players(username)").eq("room_id",roomId);
    for (const rp of finalRp||[]) {
      if(rp.status==="waiting") continue;
      const dealerBJ = dealerCards.length===2 && ds===21;
      const results=rp.hands.map(hand=>{
        const cards=hand.map(e=>e.card||e);
        const ps=handScore(cards);
        const playerBJ=cards.length===2&&ps===21&&rp.hands.length===1;
        // BJ joueur vs BJ dealer → égalité
        if(playerBJ&&dealerBJ) return {text:"🤝 Égalité BJ",gain:rp.bet};
        // BJ joueur vs dealer normal → +150%
        if(playerBJ) return {text:"🎰 Blackjack! +150%",gain:rp.bet*2.5};
        // BJ dealer vs joueur normal → perdu
        if(dealerBJ) return {text:"❌ Blackjack dealer",gain:0};
        if(ps>21) return {text:"💥 Bust",gain:0};
        if(ds>21||ps>ds) return {text:"✅ Gagné!",gain:rp.bet*2};
        if(ps===ds) return {text:"🤝 Égalité",gain:rp.bet};
        return {text:"❌ Perdu",gain:0};
      });
      const totalGain=results.reduce((a,r)=>a+r.gain,0);
      const { data: pl } = await supabase.from("players").select("tokens").eq("id",rp.player_id).single();
      if(pl){
        const newTokens=Math.max(0,pl.tokens+totalGain);
        await supabase.from("players").update({tokens:newTokens}).eq("id",rp.player_id);
        await logTransaction(rp.player_id,"game",totalGain-rp.bet,results.map(r=>r.text).join(" · "),newTokens);
      }
      await supabase.from("room_players").update({result:results,status:"finished"}).eq("id",rp.id);
    }
    await supabase.from("rooms").update({status:"finished"}).eq("id",roomId);
  }

  // ── Double Down ──────────────────────────────────────────────────────────
  async function doubleDown() {
    if (!myRp||myRp.status!=="playing"||room?.action_seat!==myRp.seat||busy.current) return;
    if (user.tokens < myRp.bet) return;
    busy.current=true;
    onUpdateTokens(-myRp.bet,""); // débite la 2e mise
    const { data: fr } = await supabase.from("rooms").select("deck").eq("id",roomId).single();
    const deck=[...(fr.deck||[])];
    const c=deck.pop();
    const hands=JSON.parse(JSON.stringify(myRp.hands));
    hands[myRp.active_hand].push({card:c,faceUp:true,visible:true});
    // Double = une carte puis stand forcé
    await supabase.from("room_players").update({
      hands, status:"done",
      bet: myRp.bet*2
    }).eq("id",myRp.id);
    await supabase.from("rooms").update({deck}).eq("id",roomId);
    await advanceToNext(myRp.seat);
    busy.current=false;
  }

  // ── Split ─────────────────────────────────────────────────────────────────
  async function splitHand() {
    if (!myRp||myRp.status!=="playing"||room?.action_seat!==myRp.seat||busy.current) return;
    if (user.tokens < myRp.bet) return;
    const myCards=myRp.hands[0]||[];
    const c1=myCards[0], c2=myCards[1];
    if (!c1||!c2||cardValue((c1.card||c1).rank)!==cardValue((c2.card||c2).rank)) return;
    busy.current=true;
    onUpdateTokens(-myRp.bet,""); // 2e mise pour le split
    const { data: fr } = await supabase.from("rooms").select("deck").eq("id",roomId).single();
    const deck=[...(fr.deck||[])];
    // Distribuer une carte à chaque main
    const n1=deck.pop(), n2=deck.pop();
    const hand1=[c1,{card:n1,faceUp:true,visible:true}];
    const hand2=[c2,{card:n2,faceUp:true,visible:true}];
    await supabase.from("room_players").update({
      hands:[hand1,hand2], active_hand:0, status:"playing",
    }).eq("id",myRp.id);
    await supabase.from("rooms").update({deck}).eq("id",roomId);
    busy.current=false;
  }

  async function leaveRoom() {
    await supabase.from("room_players").delete().eq("room_id",roomId).eq("player_id",user.id);
    if(isHost) await supabase.from("rooms").delete().eq("id",roomId);
    onLeave();
  }

  async function newGame() {
    // Reset tout le monde en waiting — la partie repartira quand tout le monde remet une mise
    await supabase.from("room_players").update({hands:[[]],bet:0,status:"waiting",result:[],active_hand:0}).eq("room_id",roomId);
    await supabase.from("rooms").update({status:"waiting",dealer_cards:[],deck:freshDeck(),action_seat:0}).eq("id",roomId);
  }

  if (!room) return <div style={{color:"#555",textAlign:"center",marginTop:100,fontSize:14}}>Chargement…</div>;

  const roomStatus=room.status;
  const myResult=myRp?.result;
  const dealerCards=room.dealer_cards||[];
  const dealerScore=dealerCards.every(c=>c.faceUp!==false)
    ? handScore(dealerCards.map(c=>c.card||c))
    : dealerCards.filter(c=>c.faceUp!==false).length>0
      ? handScore(dealerCards.filter(c=>c.faceUp!==false).map(c=>c.card||c))+"+" : "?";

  const isMyTurn = room?.action_seat===myRp?.seat && myRp?.status==="playing" && roomStatus==="playing";
  const iAmDone = myRp?.status==="done"||myRp?.status==="finished";

  function bjSeatPos(idx,total){
    const angle=(Math.PI/2)+(2*Math.PI*idx/total);
    return{x:50+42*Math.cos(angle),y:42+33*Math.sin(angle)};
  }

  const me=roomPlayers.find(p=>p.player_id===user.id);
  const others=roomPlayers.filter(p=>p.player_id!==user.id).sort((a,b)=>a.seat-b.seat);
  const orderedPlayers=me?[me,...others]:roomPlayers;
  const total=orderedPlayers.length;

  function bjCard(e,idx,small=false){
    const c=e.card||e, faceUp=e.faceUp!==false;
    const red=c&&(c.suit==="♥"||c.suit==="♦");
    const W=small?28:36,H=small?40:52,FS=small?8:11;
    if(!faceUp) return(
      <div key={idx} style={{width:W,height:H,borderRadius:5,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1.5px solid #3a3a5c",flexShrink:0,boxShadow:"1px 2px 6px rgba(0,0,0,.6)"}}/>
    );
    return(
      <div key={idx} style={{width:W,height:H,borderRadius:5,background:"#fff",border:"1.5px solid #ddd",
        display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"2px 2px",
        flexShrink:0,boxShadow:"1px 2px 8px rgba(0,0,0,.6)"}}>
        <div style={{fontSize:FS,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1}}>{c.rank}<br/>{c.suit}</div>
        <div style={{fontSize:FS,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1,alignSelf:"flex-end",transform:"rotate(180deg)"}}>{c.rank}<br/>{c.suit}</div>
      </div>
    );
  }

  // Ordre de jeu affiché
  const playOrder=roomPlayers.filter(p=>p.status!=="waiting").sort((a,b)=>a.seat-b.seat);

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#080812",fontFamily:"'SF Pro Display',-apple-system,sans-serif",color:"#fff"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px 4px",flexShrink:0}}>
        <div>
          <div style={{color:"#ffd700",fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>
            ♠ Table #{room.code} — {roomStatus==="waiting"?"Attente":roomStatus==="playing"?"En jeu":roomStatus==="finished"?"Terminé":"..."}
          </div>
          <div style={{color:"#ffd700",fontSize:26,fontWeight:900,lineHeight:1}}>🪙 {user.tokens.toLocaleString()}</div>
        </div>
        <button onClick={leaveRoom} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>Quitter</button>
      </div>

      {/* Table ovale */}
      <div style={{flex:1,position:"relative",overflow:"hidden",minHeight:0}}>
        <div style={{position:"absolute",left:"6%",right:"6%",top:"3%",bottom:"3%",background:"radial-gradient(ellipse at 50% 50%,#1d7a30 0%,#0d4a1a 55%,#071808 100%)",borderRadius:"50%",border:"4px solid #0a3010",boxShadow:"inset 0 0 70px rgba(0,0,0,.65)"}}/>
        <div style={{position:"absolute",left:"3%",right:"3%",top:"0%",bottom:"0%",borderRadius:"50%",border:"9px solid #6b3810",boxShadow:"inset 0 0 0 2px #3a1e08,0 0 0 2px #8a5520",pointerEvents:"none"}}/>

        {/* Dealer au centre */}
        <div style={{position:"absolute",left:"50%",top:"38%",transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:4,zIndex:10}}>
          {dealerCards.length>0?(
            <>
              <div style={{display:"flex",gap:4}}>
                {dealerCards.map((c,i)=>bjCard(c,i,false))}
              </div>
              <div style={{background:"rgba(0,0,0,.7)",borderRadius:6,padding:"2px 10px",color:"#ffd700",fontSize:11,fontWeight:700,border:"1px solid rgba(255,215,0,.2)"}}>
                Croupier — {dealerScore}
              </div>
            </>
          ):(
            <div style={{color:"rgba(255,255,255,.1)",fontSize:11,letterSpacing:2}}>🃏 BANQUE</div>
          )}
          {roomStatus==="finished"&&myResult&&(
            <div style={{background:"rgba(0,0,0,.85)",borderRadius:10,padding:"4px 14px",color:"#ffd700",fontSize:13,fontWeight:900,textShadow:"0 0 16px rgba(255,215,0,.6)",animation:"pulse 1s ease-in-out infinite",border:"1px solid rgba(255,215,0,.3)",textAlign:"center"}}>
              {myResult.map(r=>r.text).join(" · ")}
            </div>
          )}
        </div>

        {/* Joueurs en cercle */}
        {orderedPlayers.map((rp,idx)=>{
          const isMe=rp.player_id===user.id;
          const p=bjSeatPos(idx,total);
          const hands=rp.hands||[[]];
          const activeHand=hands[rp.active_hand||0]||hands[0]||[];
          const sc=activeHand.length>0?handScore(activeHand.map(e=>e.card||e)):null;
          const bust=sc>21;
          const isActing=room?.action_seat===rp.seat&&roomStatus==="playing"&&rp.status==="playing";
          const isDone=rp.status==="done"||rp.status==="finished";
          const playPos=playOrder.findIndex(p=>p.id===rp.id)+1;
          return(
            <div key={rp.id} style={{
              position:"absolute",left:`${p.x}%`,top:`${p.y}%`,
              transform:"translate(-50%,-50%)",zIndex:isActing?20:5,
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,
              opacity:isDone&&!isMe?.65:1,transition:"opacity .3s",
            }}>
              {hands.map((hand,hi)=>{
                const hcards=hand||[];
                if(hcards.length===0) return null;
                const hsc=handScore(hcards.map(e=>e.card||e));
                const hbust=hsc>21;
                const isActiveHand=hi===(rp.active_hand||0)&&isActing;
                return(
                  <div key={hi} style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:2}}>
                    <div style={{display:"flex",gap:3}}>
                      {hcards.map((e,i)=>bjCard(e,i,!isMe))}
                    </div>
                    {hands.length>1&&<div style={{fontSize:8,color:hbust?"#e74c3c":isActiveHand?"#ffd700":"#888"}}>{hsc}{hbust?" 💥":""}{isActiveHand?" ◀":""}</div>}
                  </div>
                );
              })}
              <div style={{
                background:isActing?"rgba(255,215,0,.15)":"rgba(0,0,0,.75)",
                border:`2px solid ${isActing?"#ffd700":isMe?"#3a3a2e":"#1a1a1a"}`,
                borderRadius:10,padding:"4px 10px",textAlign:"center",minWidth:72,
                boxShadow:isActing?"0 0 18px rgba(255,215,0,.6)":"none",
                transition:"all .2s",position:"relative",
              }}>
                {playPos>0&&roomStatus==="playing"&&(
                  <div style={{position:"absolute",top:-8,left:-6,background:isActing?"#ffd700":"#2a2a3e",color:isActing?"#111":"#888",fontSize:8,fontWeight:900,borderRadius:4,padding:"1px 4px"}}>#{playPos}</div>
                )}
                <div style={{color:isMe?"#ffd700":"#ccc",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>
                  {isActing?"▶ ":""}{rp.players?.username||"?"}{isMe?" (moi)":""}
                </div>
                {sc!==null&&<div style={{color:bust?"#e74c3c":"#4caf50",fontSize:11,fontWeight:800}}>{sc}{bust?" 💥":""}</div>}
                {rp.bet>0&&<div style={{color:"#ffa500",fontSize:10,fontWeight:700}}>Mise {rp.bet}</div>}
                <div style={{color:"#666",fontSize:10,fontWeight:600}}>Solde {rp.players?.tokens?.toLocaleString()??"-"}</div>
                {isDone&&rp.result&&<div style={{color:"#4caf50",fontSize:10,fontWeight:700}}>{rp.result[0]?.text||"✓"}</div>}
                {rp.status==="waiting"&&roomStatus==="waiting"&&<div style={{color:"#444",fontSize:9}}>pas encore misé</div>}
                {rp.status==="ready"&&roomStatus==="waiting"&&<div style={{color:"#4caf50",fontSize:9,fontWeight:700}}>✓ misé</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Contrôles */}
      <div style={{padding:"8px 12px 12px",flexShrink:0}}>

        {/* ATTENTE — miser */}
        {roomStatus==="waiting"&&(
          <div>
            <div style={{marginBottom:8}}>
              {/* Raccourcis rapides */}
              <div style={{display:"flex",gap:5,marginBottom:6}}>
                {[20,50,100].map(v=>(
                  <button key={v} onClick={()=>setBetInput(String(Math.min(v,user.tokens)))} style={{
                    flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:700,border:"none",cursor:"pointer",
                    background:betInput===String(v)?"#ffd700":"#141424",
                    color:betInput===String(v)?"#111":"#666",
                  }}>{v}</button>
                ))}
                <button onClick={()=>setBetInput(String(Math.min(parseInt(betInput||"0")*2||20,user.tokens)))} style={{flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:700,border:"1px solid #222",background:"#0e0e1e",color:"#888",cursor:"pointer"}}>×2</button>
                <button onClick={()=>setBetInput(String(Math.max(1,Math.floor((parseInt(betInput||"0")||20)/2))))} style={{flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:700,border:"1px solid #222",background:"#0e0e1e",color:"#888",cursor:"pointer"}}>÷2</button>
              </div>
              {/* Input libre */}
              <div style={{display:"flex",gap:6}}>
                <div style={{position:"relative",flex:1}}>
                  <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:"#ffd700",fontSize:11,fontWeight:700,pointerEvents:"none"}}>Mise</span>
                  <input type="number" min="1" value={betInput} onChange={e=>setBetInput(e.target.value)}
                    style={{width:"100%",background:"#0e0e1e",border:"1.5px solid #2a2a3e",borderRadius:10,padding:"9px 10px 9px 44px",color:"#ffd700",fontSize:15,fontWeight:800,outline:"none",boxSizing:"border-box"}}/>
                </div>
                {myRp?.status!=="ready"
                  ?<button onClick={placeBet} style={{padding:"9px 16px",background:"linear-gradient(135deg,#ffd700,#ffaa00)",border:"none",borderRadius:10,fontSize:14,fontWeight:800,color:"#111",cursor:"pointer"}}>Miser ✓</button>
                  :<div style={{padding:"9px 14px",color:"#4caf50",fontSize:13,fontWeight:700,display:"flex",alignItems:"center"}}>✓ Prêt</div>
                }
              </div>
            </div>
            {/* Progression des mises en temps réel */}
            {(()=>{
              const ready=roomPlayers.filter(p=>p.status==="ready").length;
              const total=roomPlayers.length;
              const pct=total>0?ready/total*100:0;
              return(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{color:"#555",fontSize:11}}>Joueurs prêts</span>
                    <span style={{color:"#4caf50",fontSize:11,fontWeight:700}}>{ready}/{total}</span>
                  </div>
                  <div style={{height:4,background:"#1a1a2e",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#27ae60,#4caf50)",borderRadius:2,transition:"width .4s"}}/>
                  </div>
                  <div style={{color:"#333",textAlign:"center",fontSize:11,marginTop:6}}>La partie démarre automatiquement quand tout le monde a misé</div>
                </div>
              );
            })()}
          </div>
        )}

        {/* JEU */}
        {roomStatus==="playing"&&(
          <div>
            {isMyTurn&&(()=>{
              const myCards=(myRp?.hands?.[0]||[]);
              const myCardObjs=myCards.map(e=>e.card||e);
              const canDouble=myCards.length===2&&user.tokens>=myRp?.bet;
              const canSplit=myCards.length===2&&cardValue(myCardObjs[0]?.rank)===cardValue(myCardObjs[1]?.rank)&&user.tokens>=myRp?.bet;
              return(
                <div>
                  <div style={{display:"flex",gap:7,marginBottom:7}}>
                    <button onClick={hit} style={{flex:1,padding:12,borderRadius:11,fontSize:14,fontWeight:800,border:"none",background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",cursor:"pointer",boxShadow:"0 3px 12px rgba(39,174,96,.35)"}}>HIT</button>
                    <button onClick={stand} style={{flex:1,padding:12,borderRadius:11,fontSize:14,fontWeight:800,border:"none",background:"linear-gradient(135deg,#e74c3c,#c0392b)",color:"#fff",cursor:"pointer",boxShadow:"0 3px 12px rgba(231,76,60,.35)"}}>STAND</button>
                  </div>
                  <div style={{display:"flex",gap:7}}>
                    {canDouble&&<button onClick={doubleDown} style={{flex:1,padding:11,borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#8e44ad,#6c3483)",color:"#fff",cursor:"pointer",boxShadow:"0 3px 10px rgba(142,68,173,.35)"}}>2×</button>}
                    {canSplit&&<button onClick={splitHand} style={{flex:1,padding:11,borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#e67e22,#d35400)",color:"#fff",cursor:"pointer",boxShadow:"0 3px 10px rgba(230,126,34,.4)",animation:"splitPulse 1.2s ease-in-out infinite"}}>SPLIT</button>}
                  </div>
                </div>
              );
            })()}
            {!isMyTurn&&!iAmDone&&(
              <div style={{textAlign:"center",padding:8}}>
                {room?.action_seat>=0?(
                  <div>
                    <div style={{color:"#555",fontSize:11,marginBottom:2}}>Tour de :</div>
                    <div style={{color:"#ffd700",fontSize:14,fontWeight:700}}>
                      {roomPlayers.find(p=>p.seat===room.action_seat)?.players?.username||"..."}
                    </div>
                  </div>
                ):<div style={{color:"#555",fontSize:12}}>Le croupier joue…</div>}
              </div>
            )}
            {iAmDone&&<div style={{color:"#4caf50",textAlign:"center",fontSize:13,fontWeight:600,padding:8}}>✓ En attente des autres…</div>}
          </div>
        )}

        {/* FIN — relance auto quand chacun remet une mise */}
        {roomStatus==="finished"&&(
          <div>
            <div style={{marginBottom:8}}>
              <div style={{display:"flex",gap:5,marginBottom:6}}>
                {[20,50,100].map(v=>(
                  <button key={v} onClick={()=>setBetInput(String(Math.min(v,user.tokens)))} style={{
                    flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:700,border:"none",cursor:"pointer",
                    background:betInput===String(v)?"#ffd700":"#141424",color:betInput===String(v)?"#111":"#666",
                  }}>{v}</button>
                ))}
                <button onClick={()=>setBetInput(String(Math.min((parseInt(betInput||"0")||20)*2,user.tokens)))} style={{flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:700,border:"1px solid #222",background:"#0e0e1e",color:"#888",cursor:"pointer"}}>×2</button>
                <button onClick={()=>setBetInput(String(Math.max(1,Math.floor((parseInt(betInput||"0")||20)/2))))} style={{flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:700,border:"1px solid #222",background:"#0e0e1e",color:"#888",cursor:"pointer"}}>÷2</button>
              </div>
              <div style={{display:"flex",gap:6}}>
                <div style={{position:"relative",flex:1}}>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#ffd700",fontSize:13}}>Mise</span>
                  <input type="number" min="1" value={betInput} onChange={e=>setBetInput(e.target.value)}
                    style={{width:"100%",background:"#0e0e1e",border:"1.5px solid #2a2a3e",borderRadius:10,padding:"9px 10px 9px 42px",color:"#ffd700",fontSize:15,fontWeight:800,outline:"none",boxSizing:"border-box"}}/>
                </div>
                {myRp?.status!=="ready"
                  ?<button onClick={placeBet} style={{padding:"9px 16px",background:"linear-gradient(135deg,#ffd700,#ffaa00)",border:"none",borderRadius:10,fontSize:14,fontWeight:800,color:"#111",cursor:"pointer"}}>↺ Rejouer</button>
                  :<div style={{padding:"9px 14px",color:"#4caf50",fontSize:13,fontWeight:700,display:"flex",alignItems:"center"}}>✓ Prêt</div>
                }
              </div>
            </div>
            {(()=>{
              const ready=roomPlayers.filter(p=>p.status==="ready").length;
              const tot=roomPlayers.length;
              return <div style={{color:"#333",textAlign:"center",fontSize:11}}>En attente: {ready}/{tot} ont choisi leur mise</div>;
            })()}
            <button onClick={leaveRoom} style={{width:"100%",marginTop:8,padding:10,borderRadius:12,fontSize:13,fontWeight:700,border:"1px solid #222",background:"transparent",color:"#555",cursor:"pointer"}}>Quitter la table</button>
          </div>
        )}
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
  const [currentUser, setCurrentUser] = useState(null);
  const [screen,      setScreen]      = useState("lobby"); // lobby | solo | room | poker-lobby | poker-room
  const [roomId,      setRoomId]      = useState(null);
  const [pokerRoomId, setPokerRoomId] = useState(null);
  const [pokerBotCount,setPokerBotCount]= useState(3);
  const [isHost,      setIsHost]      = useState(false);

  async function updateTokens(delta, description = "") {
    if (!currentUser) return;
    const newTokens = Math.max(0, currentUser.tokens + delta);
    setCurrentUser(prev => ({...prev, tokens: newTokens}));
    await supabase.from("players").update({ tokens: newTokens }).eq("id", currentUser.id);
    if (description) {
      await logTransaction(currentUser.id, "game", delta, description, newTokens);
    }
  }

  function handleLogout() { setCurrentUser(null); setScreen("lobby"); setRoomId(null); }
  function handleEnterRoom(id, host) { setRoomId(id); setIsHost(host); setScreen("room"); }

  return (
    <div style={{
      width:"100%", height:"100dvh",
      background:"#080812",
      display:"flex", flexDirection:"column",
      fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
      color:"#fff", overflow:"hidden",
    }}>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {!currentUser && <LoginScreen onLogin={setCurrentUser}/>}
        {currentUser && currentUser.is_admin && <AdminPanel currentUser={currentUser} onLogout={handleLogout}/>}
        {currentUser && !currentUser.is_admin && screen==="lobby" && (
          <LobbyScreen user={currentUser} onSolo={()=>setScreen("solo")} onPoker={()=>setScreen("poker-lobby")} onEnterRoom={handleEnterRoom} onLogout={handleLogout}/>
        )}
        {currentUser && !currentUser.is_admin && screen==="solo" && (
          <GameScreen user={currentUser} onUpdateTokens={updateTokens} onLogout={()=>setScreen("lobby")}/>
        )}
        {currentUser && !currentUser.is_admin && screen==="room" && roomId && (
          <RoomScreen user={currentUser} roomId={roomId} isHost={isHost} onLeave={()=>setScreen("lobby")} onUpdateTokens={updateTokens}/>
        )}
        {currentUser && !currentUser.is_admin && screen==="poker-lobby" && (
          <PokerLobby user={currentUser} onEnterRoom={id=>{setPokerRoomId(id);setScreen("poker-room");}} onSoloBots={n=>{setPokerBotCount(n);setScreen("poker-solo-bots");}} onBack={()=>setScreen("lobby")}/>
        )}
        {currentUser && !currentUser.is_admin && screen==="poker-room" && pokerRoomId && (
          <PokerRoom user={currentUser} roomId={pokerRoomId} onLeave={()=>setScreen("poker-lobby")} onUpdateTokens={updateTokens}/>
        )}
        {currentUser && !currentUser.is_admin && screen==="poker-solo-bots" && (
          <PokerSoloBots user={currentUser} botCount={pokerBotCount} onBack={()=>setScreen("poker-lobby")} onUpdateTokens={updateTokens}/>
        )}
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
