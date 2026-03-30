import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { freshDeck, logTransaction } from "./App.jsx";

const RED   = new Set(["♥","♦"]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── CARD HELPERS ──────────────────────────────────────────────────────────────
function cardPoints(rank) {
  if (["A","K","Q","J","10"].includes(rank)) return 10;
  return parseInt(rank) || 0;
}
function cardValue(rank) {
  const v = {"A":14,"K":13,"Q":12,"J":11};
  return v[rank] || parseInt(rank) || 0;
}
// Suite : même couleur ET même signe (♥♦ = rouge, ♠♣ = noir)
function sameSign(s1, s2) {
  const red = new Set(["♥","♦"]);
  return (red.has(s1) && red.has(s2)) || (!red.has(s1) && !red.has(s2));
}
function isSuite(cards) {
  // Filtrer les jokers imaginaires
  const real = cards.filter(c => !c.joker);
  const jokers = cards.length - real.length;
  if (real.length + jokers < 3) return false;
  if (real.length === 0) return false;
  // Toutes même couleur (signe)
  const suit = real[0].suit;
  if (!real.every(c => c.suit === suit)) return false;
  if (!real.every(c => sameSign(c.suit, suit))) return false;
  // Trier par valeur
  const sorted = [...real].sort((a,b) => cardValue(a.rank) - cardValue(b.rank));
  // Vérifier consécutivité (les jokers comblent les trous)
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = cardValue(sorted[i].rank) - cardValue(sorted[i-1].rank);
    if (diff === 0) return false; // doublons
    if (diff > 1) gaps += diff - 1;
  }
  return gaps <= jokers;
}
function isBrelan(cards) {
  const real = cards.filter(c => !c.joker);
  const jokers = cards.length - real.length;
  if (cards.length < 3 || cards.length > 4) return false;
  if (real.length === 0) return true;
  const rank = real[0].rank;
  return real.every(c => c.rank === rank);
}
function isValidMeld(cards) {
  if (!cards || cards.length < 3) return false;
  return isSuite(cards) || isBrelan(cards);
}
function handPoints(hand) {
  return hand.reduce((sum, c) => sum + (c.joker ? 0 : cardPoints(c.rank)), 0);
}

// ── RAMI CARD COMPONENT ───────────────────────────────────────────────────────
function RamiCard({ card, selected, onClick, small, faceDown }) {
  if (!card) return null;
  if (faceDown) return (
    <div onClick={onClick} style={{
      width:small?30:44, height:small?42:62, borderRadius:6, flexShrink:0, cursor:"pointer",
      background:"linear-gradient(135deg,#1a1a2e,#16213e)",
      border:"1.5px solid #3a3a5c", boxShadow:"1px 2px 6px rgba(0,0,0,.5)",
    }}/>
  );
  if (card.joker) return (
    <div onClick={onClick} style={{
      width:small?30:44, height:small?42:62, borderRadius:6, flexShrink:0, cursor:"pointer",
      background:"linear-gradient(135deg,#ffd700,#ff6b00)",
      border:selected?"2.5px solid #fff":"1.5px solid #ffaa00",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:small?14:20, boxShadow:selected?"0 0 12px rgba(255,215,0,.8)":"1px 2px 6px rgba(0,0,0,.5)",
    }}>🃏</div>
  );
  const red = RED.has(card.suit);
  return (
    <div onClick={onClick} style={{
      width:small?30:44, height:small?42:62, borderRadius:6, flexShrink:0,
      background:"#fff", border:selected?"2.5px solid #3498db":"1.5px solid #ddd",
      display:"flex",flexDirection:"column",justifyContent:"space-between",
      padding:"2px 3px", cursor:"pointer",
      boxShadow:selected?"0 0 10px rgba(52,152,219,.6)":"1px 2px 6px rgba(0,0,0,.5)",
      transform:selected?"translateY(-8px)":"none",
      transition:"transform .15s, box-shadow .15s",
    }}>
      <div style={{fontSize:small?9:12,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1}}>
        {card.rank}<br/>{card.suit}
      </div>
      <div style={{fontSize:small?9:12,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1,alignSelf:"flex-end",transform:"rotate(180deg)"}}>
        {card.rank}<br/>{card.suit}
      </div>
    </div>
  );
}

// ── MELD DISPLAY ──────────────────────────────────────────────────────────────
function MeldDisplay({ meld, label }) {
  return (
    <div style={{marginBottom:6}}>
      {label && <div style={{color:"#888",fontSize:9,marginBottom:2}}>{label}</div>}
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {meld.map((c,i) => <RamiCard key={i} card={c} small/>)}
      </div>
    </div>
  );
}

// ── RAMI LOBBY ────────────────────────────────────────────────────────────────
export function RamiLobby({ user, onEnterRoom, onBack }) {
  const [code,     setCode]     = useState("");
  const [creating, setCreating] = useState(false);
  const [joining,  setJoining]  = useState(false);
  const [error,    setError]    = useState("");

  async function createRoom() {
    setCreating(true); setError("");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let rc = "";
    for (let i=0;i<4;i++) rc += chars[Math.floor(Math.random()*chars.length)];
    const { data, error: err } = await supabase.from("rami_rooms").insert({
      code:rc, host_id:user.id, status:"waiting",
      deck:[], discard_pile:[], current_seat:0, dealer_seat:0,
      scores:{}, eliminated:[], round:1,
    }).select().single();
    if (err) { setError("Erreur création"); setCreating(false); return; }
    await supabase.from("rami_players").insert({
      room_id:data.id, player_id:user.id, seat:0,
      hand:[], melds:[], has_melded:false, joker_used:false, has_drawn:false, status:"waiting"
    });
    setCreating(false);
    onEnterRoom(data.id);
  }

  async function joinRoom() {
    if (!code.trim()) return;
    setJoining(true); setError("");
    const { data: room } = await supabase.from("rami_rooms").select("*").eq("code",code.trim().toUpperCase()).single();
    if (!room) { setError("Salle introuvable"); setJoining(false); return; }
    if (room.status !== "waiting") { setError("Partie déjà en cours"); setJoining(false); return; }
    const { data: rp } = await supabase.from("rami_players").select("seat,player_id").eq("room_id",room.id);
    if (rp && rp.length >= 6) { setError("Table complète (6/6)"); setJoining(false); return; }
    const already = rp?.find(p=>p.player_id===user.id);
    if (!already) {
      await supabase.from("rami_players").insert({
        room_id:room.id, player_id:user.id, seat:rp?.length||0,
        hand:[], melds:[], has_melded:false, joker_used:false, has_drawn:false, status:"waiting"
      });
    }
    setJoining(false);
    onEnterRoom(room.id);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 20px 20px",background:"#080812",color:"#fff"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 20px"}}>
        <div>
          <div style={{color:"#e74c3c",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Rami 101</div>
          <div style={{color:"#fff",fontSize:22,fontWeight:900}}>Multijoueur</div>
        </div>
        <button onClick={onBack} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#666",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>← Retour</button>
      </div>
      <div style={{color:"#555",fontSize:12,textAlign:"center",marginBottom:24}}>🪙 {user.tokens.toLocaleString()} jetons</div>
      <button onClick={createRoom} disabled={creating} style={{width:"100%",padding:15,marginBottom:12,background:creating?"#1a1a2e":"linear-gradient(135deg,#e74c3c,#c0392b)",border:"none",borderRadius:14,fontSize:15,fontWeight:900,color:"#fff",cursor:creating?"default":"pointer",boxShadow:"0 5px 24px rgba(231,76,60,.4)"}}>
        {creating?"Création…":"🎴 Créer une table"}
      </button>
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"0 0 14px"}}>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/>
        <div style={{color:"#333",fontSize:12}}>ou rejoindre</div>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setError("");}}
          onKeyDown={e=>e.key==="Enter"&&joinRoom()}
          placeholder="Code ex: K7X2" maxLength={4}
          style={{flex:1,background:"#10101e",border:"1.5px solid #1a1a2e",borderRadius:12,padding:"13px 14px",color:"#fff",fontSize:16,fontWeight:700,letterSpacing:3,outline:"none",textAlign:"center"}}/>
        <button onClick={joinRoom} disabled={joining} style={{padding:"13px 18px",background:"#0d1a3a",border:"1.5px solid #1a3a6c",borderRadius:12,fontSize:15,fontWeight:800,color:"#5b8de8",cursor:"pointer"}}>
          {joining?"…":"Rejoindre"}
        </button>
      </div>
      {error && <div style={{color:"#e74c3c",fontSize:13,marginTop:10,textAlign:"center",fontWeight:600}}>⚠ {error}</div>}
    </div>
  );
}

// ── RAMI ROOM ─────────────────────────────────────────────────────────────────
export function RamiRoom({ user, roomId, onLeave }) {
  const [room,         setRoom]         = useState(null);
  const [ramiPlayers,  setRamiPlayers]  = useState([]);
  const [myRp,         setMyRp]         = useState(null);
  const [selected,     setSelected]     = useState([]); // indices cartes sélectionnées
  const [meldGroup,    setMeldGroup]    = useState([]); // combinaison en cours de formation
  const [msg,          setMsg]          = useState("");
  const [scores,       setScores]       = useState({});
  const busy = useRef(false);

  const isHost = room?.host_id === user.id;
  const isMyTurn = room?.current_seat === myRp?.seat && room?.status === "playing";
  const myHand = myRp?.hand || [];
  const hasMelded = myRp?.has_melded || false;
  const hasDrawn = myRp?.has_drawn || false;
  const jokerUsed = myRp?.joker_used || false;

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    loadRoom(); loadPlayers();
    const sub = supabase.channel("rami-"+roomId)
      .on("postgres_changes",{event:"*",schema:"public",table:"rami_rooms",filter:`id=eq.${roomId}`}, p => {
        setRoom(p.new);
        if (p.new.scores) setScores(p.new.scores);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"rami_players",filter:`room_id=eq.${roomId}`}, p => {
        if (p.eventType==="DELETE") return;
        setRamiPlayers(prev => {
          const exists = prev.find(x=>x.id===p.new.id);
          const merged = {...p.new, players: exists?.players ?? p.new.players};
          if (exists) return prev.map(x=>x.id===p.new.id?merged:x);
          loadPlayers(); return prev;
        });
        if (p.new.player_id===user.id) setMyRp(p.new);
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [roomId]);

  async function loadRoom() {
    const { data } = await supabase.from("rami_rooms").select("*").eq("id",roomId).single();
    if (data) { setRoom(data); if(data.scores) setScores(data.scores); }
  }
  async function loadPlayers() {
    const { data } = await supabase.from("rami_players").select("*,players(username,tokens)").eq("room_id",roomId).order("seat");
    if (data) { setRamiPlayers(data); const me=data.find(p=>p.player_id===user.id); if(me) setMyRp(me); }
  }

  // ── Démarrer la manche ────────────────────────────────────────────────────
  async function startRound() {
    if (!isHost || busy.current) return;
    busy.current = true;
    const { data: allRp } = await supabase.from("rami_players").select("*,players(username)").eq("room_id",roomId).order("seat");
    if (!allRp || allRp.length < 2) { busy.current=false; return; }

    // Créer 2 decks pour le Rami
    let deck = [...freshDeck(), ...freshDeck()];
    // Mélanger
    for (let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}

    const dealerSeat = (room.dealer_seat + 1) % allRp.length;
    const freshScores = room.round === 1 ? {} : (room.scores || {});

    // Distribuer 12 ou 13 cartes
    for (const rp of allRp) {
      const count = rp.seat === dealerSeat ? 13 : 12;
      const hand = deck.splice(0, count);
      await supabase.from("rami_players").update({
        hand, melds:[], has_melded:false, joker_used:false, has_drawn:false, status:"playing"
      }).eq("id",rp.id);
    }

    // Retourner la première carte de la défausse
    const firstDiscard = deck.splice(0,1);

    await supabase.from("rami_rooms").update({
      status:"playing", deck, discard_pile:firstDiscard,
      current_seat: dealerSeat, dealer_seat: dealerSeat,
      scores: freshScores,
    }).eq("id",roomId);

    await loadPlayers();
    busy.current = false;
  }

  // ── Piocher ───────────────────────────────────────────────────────────────
  async function drawFromDeck() {
    if (!isMyTurn || hasDrawn || busy.current) return;
    busy.current = true;
    const { data: fr } = await supabase.from("rami_rooms").select("deck,discard_pile").eq("id",roomId).single();
    if (!fr || fr.deck.length === 0) { busy.current=false; return; }
    const deck = [...fr.deck];
    const card = deck.shift();
    const hand = [...myHand, card];
    await supabase.from("rami_players").update({hand, has_drawn:true}).eq("id",myRp.id);
    await supabase.from("rami_rooms").update({deck}).eq("id",roomId);
    setMsg("Tu as pioché une carte");
    busy.current = false;
  }

  async function drawFromDiscard() {
    if (!isMyTurn || hasDrawn || busy.current) return;
    const { data: fr } = await supabase.from("rami_rooms").select("discard_pile").eq("id",roomId).single();
    if (!fr || fr.discard_pile.length === 0) return;
    busy.current = true;
    const pile = [...fr.discard_pile];
    const card = pile.pop();
    const hand = [...myHand, card];
    await supabase.from("rami_players").update({hand, has_drawn:true}).eq("id",myRp.id);
    await supabase.from("rami_rooms").update({discard_pile:pile}).eq("id",roomId);
    setMsg("Tu as pris la défausse : "+card.rank+card.suit);
    busy.current = false;
  }

  // ── Sélectionner une carte ────────────────────────────────────────────────
  function toggleSelect(idx) {
    setSelected(prev => prev.includes(idx) ? prev.filter(i=>i!==idx) : [...prev,idx]);
  }

  // ── Poser une combinaison ─────────────────────────────────────────────────
  async function layMeld() {
    if (!isMyTurn || !hasDrawn || selected.length < 3 || busy.current) return;
    const meldCards = selected.map(i => myHand[i]);
    if (!isValidMeld(meldCards)) { setMsg("❌ Combinaison invalide !"); return; }
    busy.current = true;
    const newHand = myHand.filter((_,i) => !selected.includes(i));
    const newMelds = [...(myRp.melds || []), meldCards];
    const hasMeldedNow = true;
    await supabase.from("rami_players").update({
      hand:newHand, melds:newMelds, has_melded:hasMeldedNow
    }).eq("id",myRp.id);
    setSelected([]);
    setMsg("✅ Combinaison posée !");
    // Vérifier si la main est vide → fin de manche
    if (newHand.length === 0) await endRound();
    busy.current = false;
  }

  // ── Utiliser le joker imaginaire ──────────────────────────────────────────
  async function useJoker() {
    if (!isMyTurn || jokerUsed || busy.current) return;
    const hand = [...myHand, {joker:true, rank:"J*", suit:"★"}];
    await supabase.from("rami_players").update({hand, joker_used:true}).eq("id",myRp.id);
    setMsg("🃏 Joker imaginaire ajouté à ta main !");
  }

  // ── Défausser ────────────────────────────────────────────────────────────
  async function discard(idx) {
    if (!isMyTurn || !hasDrawn || busy.current) return;
    busy.current = true;
    const card = myHand[idx];
    const newHand = myHand.filter((_,i)=>i!==idx);
    const { data: fr } = await supabase.from("rami_rooms").select("discard_pile,current_seat").eq("id",roomId).single();
    const pile = [...(fr.discard_pile||[]), card];
    // Passer au joueur suivant
    const { data: allRp } = await supabase.from("rami_players").select("seat,status").eq("room_id",roomId).order("seat");
    const activePlayers = allRp.filter(p=>p.status==="playing");
    const seats = activePlayers.map(p=>p.seat).sort((a,b)=>a-b);
    const ci = seats.indexOf(fr.current_seat);
    const nextSeat = seats[(ci+1)%seats.length];
    await supabase.from("rami_players").update({hand:newHand, has_drawn:false}).eq("id",myRp.id);
    await supabase.from("rami_rooms").update({discard_pile:pile, current_seat:nextSeat}).eq("id",roomId);
    setSelected([]);
    // Vérifier si main vide → fin de manche
    if (newHand.length === 0) await endRound();
    busy.current = false;
  }

  // ── Fin de manche ────────────────────────────────────────────────────────
  async function endRound() {
    const { data: allRp } = await supabase.from("rami_players").select("*,players(username)").eq("room_id",roomId);
    const { data: fr } = await supabase.from("rami_rooms").select("scores,eliminated").eq("id",roomId).single();
    const currentScores = fr.scores || {};
    const eliminated = [...(fr.eliminated || [])];

    for (const rp of allRp) {
      if (rp.status !== "playing") continue;
      const pts = handPoints(rp.hand || []);
      const prev = currentScores[rp.player_id] || 0;
      currentScores[rp.player_id] = prev + pts;
      // Vérifier élimination
      if (currentScores[rp.player_id] >= 101 && !eliminated.includes(rp.player_id)) {
        eliminated.push(rp.player_id);
      }
    }

    // Compter les survivants
    const allPlayerIds = allRp.map(p=>p.player_id);
    const survivors = allPlayerIds.filter(id => !eliminated.includes(id));

    const newStatus = survivors.length <= 1 ? "finished" : "waiting";
    await supabase.from("rami_rooms").update({
      status:newStatus, scores:currentScores, eliminated,
      round:(fr.round||1)+1,
    }).eq("id",roomId);
    await supabase.from("rami_players").update({status:"done"}).eq("room_id",roomId);
  }

  async function leaveRoom() {
    await supabase.from("rami_players").delete().eq("room_id",roomId).eq("player_id",user.id);
    if (isHost) await supabase.from("rami_rooms").delete().eq("id",roomId);
    onLeave();
  }

  if (!room) return <div style={{color:"#555",textAlign:"center",marginTop:100,fontSize:14,background:"#080812",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>Chargement…</div>;

  const rs = room.status;
  const discardTop = room.discard_pile?.length > 0 ? room.discard_pile[room.discard_pile.length-1] : null;
  const myScore = scores[user.id] || 0;
  const isEliminated = (room.eliminated||[]).includes(user.id);
  const allReady = ramiPlayers.length >= 2 && ramiPlayers.every(p=>p.status==="playing"||p.status==="done"||p.status==="waiting");

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#080812",color:"#fff",fontFamily:"'SF Pro Display',-apple-system,sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px 4px",flexShrink:0}}>
        <div>
          <div style={{color:"#e74c3c",fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>🎴 Rami 101 — Table #{room.code} — Manche {room.round}</div>
          <div style={{color:"#ffd700",fontSize:20,fontWeight:900}}>Score: {myScore}pts</div>
        </div>
        <button onClick={leaveRoom} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>Quitter</button>
      </div>

      {/* Scores en ligne */}
      <div style={{display:"flex",gap:6,padding:"4px 14px",flexShrink:0,overflowX:"auto"}}>
        {ramiPlayers.map(rp=>{
          const sc = scores[rp.player_id]||0;
          const elim = (room.eliminated||[]).includes(rp.player_id);
          const isMe = rp.player_id===user.id;
          const isCurrent = room.current_seat===rp.seat&&rs==="playing";
          return(
            <div key={rp.id} style={{
              background:elim?"#1a0a0a":isCurrent?"rgba(255,215,0,.15)":"#141424",
              border:`1px solid ${isCurrent?"#ffd700":elim?"#5a1a1a":"#222"}`,
              borderRadius:8,padding:"4px 10px",textAlign:"center",flexShrink:0,
            }}>
              <div style={{color:isMe?"#ffd700":elim?"#555":"#ccc",fontSize:10,fontWeight:700}}>{rp.players?.username||"?"}{isMe?" (moi)":""}</div>
              <div style={{color:elim?"#e74c3c":sc>=80?"#e67e22":"#4caf50",fontSize:12,fontWeight:800}}>{sc}pts</div>
              {elim&&<div style={{color:"#e74c3c",fontSize:8}}>éliminé</div>}
              {isCurrent&&!elim&&<div style={{color:"#ffd700",fontSize:8}}>▶ joue</div>}
              <div style={{color:"#444",fontSize:8}}>{(rp.hand||[]).length} cartes</div>
            </div>
          );
        })}
      </div>

      {/* Zone de jeu */}
      <div style={{
        flex:1,
        background:"radial-gradient(ellipse at 50% 40%,#0f5535 0%,#0a3520 60%,#071e12 100%)",
        margin:"6px 10px", borderRadius:16,
        border:"2px solid #1a6b40",
        boxShadow:"inset 0 0 40px rgba(0,0,0,.5)",
        display:"flex",flexDirection:"column",
        overflow:"hidden",padding:"10px 12px",
        position:"relative",
      }}>
        {/* Piles au centre */}
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:20,marginBottom:10}}>
          {/* Pioche */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{color:"#9a9ab0",fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Pioche</div>
            <div onClick={isMyTurn&&!hasDrawn?drawFromDeck:undefined} style={{cursor:isMyTurn&&!hasDrawn?"pointer":"default"}}>
              <RamiCard card={null} faceDown={true}/>
            </div>
            <div style={{color:"#555",fontSize:9}}>{room.deck?.length||0} cartes</div>
          </div>

          {/* Défausse */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{color:"#9a9ab0",fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Défausse</div>
            <div onClick={isMyTurn&&!hasDrawn&&discardTop?drawFromDiscard:undefined} style={{cursor:isMyTurn&&!hasDrawn&&discardTop?"pointer":"default"}}>
              {discardTop
                ? <RamiCard card={discardTop}/>
                : <div style={{width:44,height:62,borderRadius:6,border:"1.5px dashed rgba(255,255,255,.1)",background:"rgba(0,0,0,.2)"}}/>
              }
            </div>
          </div>
        </div>

        {/* Message */}
        {msg && (
          <div style={{textAlign:"center",color:"#ffd700",fontSize:12,fontWeight:700,marginBottom:6,padding:"3px 10px",background:"rgba(0,0,0,.5)",borderRadius:8}}>
            {msg}
          </div>
        )}

        {/* Combinaisons posées */}
        <div style={{flex:1,overflowY:"auto"}}>
          {ramiPlayers.filter(p=>(p.melds||[]).length>0).map(rp=>(
            <div key={rp.id} style={{marginBottom:8}}>
              <div style={{color:"#777",fontSize:9,marginBottom:3}}>{rp.players?.username||"?"} :</div>
              {(rp.melds||[]).map((meld,mi)=>(
                <MeldDisplay key={mi} meld={meld}/>
              ))}
            </div>
          ))}
        </div>

        {/* Tour actuel */}
        {rs==="playing" && !isMyTurn && (
          <div style={{textAlign:"center",color:"#555",fontSize:11,padding:4}}>
            Tour de : <span style={{color:"#ffd700",fontWeight:700}}>
              {ramiPlayers.find(p=>p.seat===room.current_seat)?.players?.username||"..."}
            </span>
          </div>
        )}
      </div>

      {/* Ma main */}
      {rs==="playing" && !isEliminated && (
        <div style={{padding:"6px 10px",flexShrink:0}}>
          <div style={{color:"#666",fontSize:9,marginBottom:4,letterSpacing:1,textTransform:"uppercase"}}>
            Ta main ({myHand.length} cartes — {handPoints(myHand)}pts)
            {selected.length>0&&<span style={{color:"#3498db"}}> — {selected.length} sélectionnées</span>}
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
            {myHand.map((card,i)=>(
              <RamiCard key={i} card={card} selected={selected.includes(i)} onClick={()=>isMyTurn&&hasDrawn?toggleSelect(i):null}/>
            ))}
          </div>

          {/* Actions */}
          {isMyTurn && (
            <div>
              {!hasDrawn ? (
                <div style={{color:"#4caf50",textAlign:"center",fontSize:12,padding:6,fontWeight:600}}>
                  ▶ Pioche dans le tas ou prends la défausse
                </div>
              ) : (
                <div>
                  <div style={{display:"flex",gap:6,marginBottom:6}}>
                    {selected.length>=3 && (
                      <button onClick={layMeld} style={{flex:2,padding:10,borderRadius:10,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",cursor:"pointer"}}>
                        ✅ Poser ({selected.length} cartes)
                      </button>
                    )}
                    {!jokerUsed && (
                      <button onClick={useJoker} style={{flex:1,padding:10,borderRadius:10,fontSize:12,fontWeight:700,border:"none",background:"linear-gradient(135deg,#f39c12,#e67e22)",color:"#fff",cursor:"pointer"}}>
                        🃏 Joker
                      </button>
                    )}
                  </div>
                  {selected.length===1 && (
                    <button onClick={()=>discard(selected[0])} style={{width:"100%",padding:11,borderRadius:10,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#e74c3c,#c0392b)",color:"#fff",cursor:"pointer"}}>
                      🗑 Défausser {myHand[selected[0]]?.rank}{myHand[selected[0]]?.suit}
                    </button>
                  )}
                  {selected.length===0 && (
                    <div style={{color:"#444",textAlign:"center",fontSize:11}}>Sélectionne 3+ cartes pour poser, ou 1 carte pour défausser</div>
                  )}
                </div>
              )}
            </div>
          )}
          {!isMyTurn && hasDrawn===false && (
            <div style={{color:"#444",textAlign:"center",fontSize:11,padding:4}}>En attente de ton tour…</div>
          )}
        </div>
      )}

      {/* Attente / Fin */}
      {(rs==="waiting"||rs==="finished") && (
        <div style={{padding:"8px 14px 14px",flexShrink:0}}>
          {rs==="finished" && (
            <div style={{textAlign:"center",marginBottom:10}}>
              <div style={{color:"#ffd700",fontSize:16,fontWeight:900,marginBottom:4}}>
                🏆 {(() => {
                  const survivors = ramiPlayers.filter(p=>!(room.eliminated||[]).includes(p.player_id));
                  return survivors.length===1 ? (survivors[0].players?.username||"?")+" gagne !" : "Résultats";
                })()}
              </div>
              {ramiPlayers.sort((a,b)=>(scores[a.player_id]||0)-(scores[b.player_id]||0)).map(rp=>(
                <div key={rp.id} style={{color:"#888",fontSize:12}}>
                  {rp.players?.username||"?"} — {scores[rp.player_id]||0}pts
                  {(room.eliminated||[]).includes(rp.player_id)?" ❌":""}
                </div>
              ))}
            </div>
          )}
          {rs==="waiting" && isHost && (
            <button onClick={startRound} style={{width:"100%",padding:13,background:"linear-gradient(135deg,#ffd700,#ffaa00)",border:"none",borderRadius:12,fontSize:15,fontWeight:900,color:"#111",cursor:"pointer"}}>
              ▶ Distribuer — Manche {room.round}
            </button>
          )}
          {rs==="waiting" && !isHost && (
            <div style={{color:"#444",textAlign:"center",fontSize:13}}>En attente du créateur…</div>
          )}
          <button onClick={leaveRoom} style={{width:"100%",marginTop:8,padding:10,borderRadius:10,fontSize:13,border:"1px solid #222",background:"transparent",color:"#555",cursor:"pointer"}}>Quitter</button>
        </div>
      )}

      {isEliminated && rs==="playing" && (
        <div style={{padding:14,textAlign:"center",color:"#e74c3c",fontSize:14,fontWeight:700}}>
          Tu es éliminé cette partie — observe les autres !
        </div>
      )}
    </div>
  );
}
