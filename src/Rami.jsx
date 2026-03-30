import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { freshDeck } from "./App.jsx";

const RED = new Set(["♥","♦"]);

// ── CARD HELPERS ──────────────────────────────────────────────────────────────
function cardPoints(rank) {
  if (["A","K","Q","J","10"].includes(rank)) return 10;
  return parseInt(rank) || 0;
}
function cardVal(rank) {
  const v = {"A":14,"K":13,"Q":12,"J":11};
  return v[rank] || parseInt(rank) || 0;
}
function sameSign(s1,s2) {
  return (RED.has(s1)&&RED.has(s2)) || (!RED.has(s1)&&!RED.has(s2));
}
function isSuite(cards) {
  const real = cards.filter(c=>!c.joker);
  const jokers = cards.length - real.length;
  if (cards.length < 3 || real.length === 0) return false;
  const suit = real[0].suit;
  if (!real.every(c=>c.suit===suit&&sameSign(c.suit,suit))) return false;
  const sorted = [...real].sort((a,b)=>cardVal(a.rank)-cardVal(b.rank));
  let gaps=0;
  for (let i=1;i<sorted.length;i++) {
    const d=cardVal(sorted[i].rank)-cardVal(sorted[i-1].rank);
    if (d===0) return false;
    gaps+=d-1;
  }
  return gaps<=jokers;
}
function isBrelan(cards) {
  const real = cards.filter(c=>!c.joker);
  if (cards.length<3||cards.length>4) return false;
  if (real.length===0) return true;
  return real.every(c=>c.rank===real[0].rank);
}
function isValidMeld(cards) {
  if (!cards||cards.length<3) return false;
  return isSuite(cards)||isBrelan(cards);
}
function handPoints(hand) {
  return (hand||[]).reduce((s,c)=>s+(c.joker?0:cardPoints(c.rank)),0);
}
function sortHand(hand) {
  const jokers = hand.filter(c=>c.joker);
  const real = hand.filter(c=>!c.joker);
  const sorted = [...real].sort((a,b)=>{
    if (a.suit!==b.suit) return a.suit.localeCompare(b.suit);
    return cardVal(a.rank)-cardVal(b.rank);
  });
  return [...sorted,...jokers];
}

// ── CARTE ─────────────────────────────────────────────────────────────────────
function RCard({ card, selected, onClick, small, faceDown, highlight }) {
  const W=small?32:46, H=small?46:66;
  if (faceDown) return (
    <div onClick={onClick} style={{width:W,height:H,borderRadius:6,flexShrink:0,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1.5px solid #3a3a5c",boxShadow:"1px 2px 6px rgba(0,0,0,.5)",cursor:onClick?"pointer":"default",position:"relative"}}>
      <div style={{position:"absolute",inset:4,border:"1px solid rgba(255,215,0,.1)",borderRadius:3}}/>
    </div>
  );
  if (!card) return null;
  if (card.joker) return (
    <div onClick={onClick} style={{width:W,height:H,borderRadius:6,flexShrink:0,cursor:"pointer",background:"linear-gradient(135deg,#ffd700,#ff6b00)",border:selected?"2.5px solid #fff":"1.5px solid #ffaa00",display:"flex",alignItems:"center",justifyContent:"center",fontSize:small?16:24,boxShadow:selected?"0 0 14px rgba(255,215,0,.9)":"1px 2px 6px rgba(0,0,0,.5)",transform:selected?"translateY(-10px)":"none",transition:"transform .12s"}}>🃏</div>
  );
  const red = RED.has(card.suit);
  return (
    <div onClick={onClick} style={{width:W,height:H,borderRadius:6,flexShrink:0,background:"#fff",border:selected?"2.5px solid #3498db":highlight?"2.5px solid #27ae60":"1.5px solid #ddd",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"2px 3px",cursor:onClick?"pointer":"default",boxShadow:selected?"0 0 12px rgba(52,152,219,.7)":highlight?"0 0 8px rgba(39,174,96,.5)":"1px 2px 6px rgba(0,0,0,.5)",transform:selected?"translateY(-10px)":"none",transition:"transform .12s, box-shadow .12s"}}>
      <div style={{fontSize:small?9:13,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1}}>{card.rank}<br/>{card.suit}</div>
      <div style={{fontSize:small?9:13,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1,alignSelf:"flex-end",transform:"rotate(180deg)"}}>{card.rank}<br/>{card.suit}</div>
    </div>
  );
}

// ── RAMI LOBBY ────────────────────────────────────────────────────────────────
export function RamiLobby({ user, onEnterRoom, onBack }) {
  const [code,setCode]=useState("");
  const [creating,setCreating]=useState(false);
  const [joining,setJoining]=useState(false);
  const [error,setError]=useState("");

  async function createRoom() {
    setCreating(true);setError("");
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let rc=""; for(let i=0;i<4;i++) rc+=chars[Math.floor(Math.random()*chars.length)];
    const {data,error:err}=await supabase.from("rami_rooms").insert({code:rc,host_id:user.id,status:"waiting",deck:[],discard_pile:[],current_seat:0,dealer_seat:0,scores:{},eliminated:[],round:1}).select().single();
    if(err){setError("Erreur");setCreating(false);return;}
    await supabase.from("rami_players").insert({room_id:data.id,player_id:user.id,seat:0,hand:[],melds:[],has_melded:false,joker_used:false,has_drawn:false,status:"waiting"});
    setCreating(false);onEnterRoom(data.id);
  }

  async function joinRoom() {
    if(!code.trim())return;
    setJoining(true);setError("");
    const{data:room}=await supabase.from("rami_rooms").select("*").eq("code",code.trim().toUpperCase()).single();
    if(!room){setError("Salle introuvable");setJoining(false);return;}
    if(room.status!=="waiting"){setError("Partie déjà en cours");setJoining(false);return;}
    const{data:rp}=await supabase.from("rami_players").select("seat,player_id").eq("room_id",room.id);
    if(rp&&rp.length>=6){setError("Table complète");setJoining(false);return;}
    const already=rp?.find(p=>p.player_id===user.id);
    if(!already)await supabase.from("rami_players").insert({room_id:room.id,player_id:user.id,seat:rp?.length||0,hand:[],melds:[],has_melded:false,joker_used:false,has_drawn:false,status:"waiting"});
    setJoining(false);onEnterRoom(room.id);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 20px 20px",background:"#080812",color:"#fff"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 20px"}}>
        <div><div style={{color:"#8e44ad",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Rami 101</div><div style={{color:"#fff",fontSize:22,fontWeight:900}}>Multijoueur</div></div>
        <button onClick={onBack} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#666",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>← Retour</button>
      </div>
      <div style={{color:"#555",fontSize:12,textAlign:"center",marginBottom:24}}>🪙 {user.tokens.toLocaleString()} jetons</div>
      <button onClick={createRoom} disabled={creating} style={{width:"100%",padding:15,marginBottom:12,background:creating?"#1a1a2e":"linear-gradient(135deg,#8e44ad,#6c3483)",border:"none",borderRadius:14,fontSize:15,fontWeight:900,color:"#fff",cursor:creating?"default":"pointer",boxShadow:"0 5px 24px rgba(142,68,173,.4)"}}>{creating?"Création…":"🎴 Créer une table"}</button>
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"0 0 14px"}}><div style={{flex:1,height:1,background:"#1a1a2e"}}/><div style={{color:"#333",fontSize:12}}>ou rejoindre</div><div style={{flex:1,height:1,background:"#1a1a2e"}}/></div>
      <div style={{display:"flex",gap:8}}>
        <input value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setError("");}} onKeyDown={e=>e.key==="Enter"&&joinRoom()} placeholder="Code ex: K7X2" maxLength={4} style={{flex:1,background:"#10101e",border:"1.5px solid #1a1a2e",borderRadius:12,padding:"13px 14px",color:"#fff",fontSize:16,fontWeight:700,letterSpacing:3,outline:"none",textAlign:"center"}}/>
        <button onClick={joinRoom} disabled={joining} style={{padding:"13px 18px",background:"#0d1a3a",border:"1.5px solid #1a3a6c",borderRadius:12,fontSize:15,fontWeight:800,color:"#5b8de8",cursor:"pointer"}}>{joining?"…":"Rejoindre"}</button>
      </div>
      {error&&<div style={{color:"#e74c3c",fontSize:13,marginTop:10,textAlign:"center",fontWeight:600}}>⚠ {error}</div>}
    </div>
  );
}

// ── RAMI ROOM ─────────────────────────────────────────────────────────────────
export function RamiRoom({ user, roomId, onLeave }) {
  const [room,setRoom]=useState(null);
  const [ramiPlayers,setRamiPlayers]=useState([]);
  const [myRp,setMyRp]=useState(null);
  const [selected,setSelected]=useState([]);
  const [scores,setScores]=useState({});
  const [msg,setMsg]=useState("");
  const busy=useRef(false);

  const isHost=room?.host_id===user.id;
  const rs=room?.status;
  const isMyTurn=rs==="playing"&&room?.current_seat===myRp?.seat;
  const myHand=myRp?.hand||[];
  const hasDrawn=myRp?.has_drawn||false;
  const jokerUsed=myRp?.joker_used||false;
  const isDealer=room?.dealer_seat===myRp?.seat&&rs==="playing";
  const isElim=(room?.eliminated||[]).includes(user.id);
  // Distributeur a 13 cartes → doit prendre la défausse obligatoirement, pas piocher dans le tas
  // Le distributeur (13 cartes) doit UNIQUEMENT défausser une carte — pas de pioche
  const dealerMustDiscard=isMyTurn&&!hasDrawn&&isDealer;
  const canDrawDeck=isMyTurn&&!hasDrawn&&!isDealer;
  const canDrawDiscard=isMyTurn&&!hasDrawn&&!isDealer;
  const discardTop=room?.discard_pile?.length>0?room.discard_pile[room.discard_pile.length-1]:null;
  const myScore=scores[user.id]||0;
  const selCards=selected.map(i=>myHand[i]);
  const selValid=selCards.length>=3&&isValidMeld(selCards);
  const allMyCardsValid=myHand.length>=3&&isValidMeld(myHand);

  useEffect(()=>{
    loadRoom();loadPlayers();
    const sub=supabase.channel("rami-"+roomId)
      .on("postgres_changes",{event:"*",schema:"public",table:"rami_rooms",filter:`id=eq.${roomId}`},p=>{setRoom(p.new);if(p.new.scores)setScores(p.new.scores);})
      .on("postgres_changes",{event:"*",schema:"public",table:"rami_players",filter:`room_id=eq.${roomId}`},p=>{
        if(p.eventType==="DELETE")return;
        setRamiPlayers(prev=>{const exists=prev.find(x=>x.id===p.new.id);const merged={...p.new,players:exists?.players??p.new.players};if(exists)return prev.map(x=>x.id===p.new.id?merged:x);loadPlayers();return prev;});
        if(p.new.player_id===user.id)setMyRp(p.new);
      }).subscribe();
    return()=>supabase.removeChannel(sub);
  },[roomId]);

  async function loadRoom(){const{data}=await supabase.from("rami_rooms").select("*").eq("id",roomId).single();if(data){setRoom(data);if(data.scores)setScores(data.scores);}}
  async function loadPlayers(){const{data}=await supabase.from("rami_players").select("*,players(username,tokens)").eq("room_id",roomId).order("seat");if(data){setRamiPlayers(data);const me=data.find(p=>p.player_id===user.id);if(me)setMyRp(me);}}

  async function startRound(){
    if(!isHost||busy.current)return;
    busy.current=true;
    const{data:allRp}=await supabase.from("rami_players").select("*").eq("room_id",roomId).order("seat");
    if(!allRp||allRp.length<2){busy.current=false;return;}
    let deck=[...freshDeck(),...freshDeck()];
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    const dealerSeat=(room.dealer_seat+1)%allRp.length;
    const freshScores=room.round===1?{}:(room.scores||{});
    for(const rp of allRp){
      const count=rp.seat===dealerSeat?13:12;
      const hand=sortHand(deck.splice(0,count));
      await supabase.from("rami_players").update({hand,melds:[],has_melded:false,joker_used:false,has_drawn:false,status:"playing"}).eq("id",rp.id);
    }
    const firstDiscard=deck.splice(0,1);
    await supabase.from("rami_rooms").update({status:"playing",deck,discard_pile:firstDiscard,current_seat:dealerSeat,dealer_seat:dealerSeat,scores:freshScores}).eq("id",roomId);
    await loadPlayers();busy.current=false;
  }

  async function drawDeck(){
    if(!canDrawDeck||busy.current)return;
    busy.current=true;
    const{data:fr}=await supabase.from("rami_rooms").select("deck").eq("id",roomId).single();
    if(!fr||!fr.deck.length){busy.current=false;return;}
    const deck=[...fr.deck];
    const card=deck.shift();
    const hand=sortHand([...myHand,card]);
    await supabase.from("rami_players").update({hand,has_drawn:true}).eq("id",myRp.id);
    await supabase.from("rami_rooms").update({deck}).eq("id",roomId);
    setMsg("Carte piochée !");busy.current=false;
  }

  async function drawDiscard(){
    if(!canDrawDiscard||busy.current)return;
    const{data:fr}=await supabase.from("rami_rooms").select("discard_pile").eq("id",roomId).single();
    if(!fr||!fr.discard_pile.length)return;
    busy.current=true;
    const pile=[...fr.discard_pile];
    const card=pile.pop();
    const hand=sortHand([...myHand,card]);
    await supabase.from("rami_players").update({hand,has_drawn:true}).eq("id",myRp.id);
    await supabase.from("rami_rooms").update({discard_pile:pile}).eq("id",roomId);
    setMsg("Défausse prise : "+card.rank+card.suit);setSelected([]);busy.current=false;
  }

  async function addJoker(){
    if(!isMyTurn||jokerUsed||busy.current)return;
    const hand=sortHand([...myHand,{joker:true,rank:"J*",suit:"★"}]);
    await supabase.from("rami_players").update({hand,joker_used:true}).eq("id",myRp.id);
    setMsg("🃏 Joker ajouté !");
  }

  function toggleSel(idx){
    if(!isMyTurn)return;
    setSelected(prev=>prev.includes(idx)?prev.filter(i=>i!==idx):[...prev,idx]);
  }

  async function layMeld(){
    if(!isMyTurn||(!hasDrawn&&!isDealer)||!selValid||busy.current)return;
    busy.current=true;
    const meldCards=selected.map(i=>myHand[i]);
    const newHand=sortHand(myHand.filter((_,i)=>!selected.includes(i)));
    const newMelds=[...(myRp.melds||[]),meldCards];
    await supabase.from("rami_players").update({hand:newHand,melds:newMelds,has_melded:true}).eq("id",myRp.id);
    setSelected([]);setMsg("✅ Posé !");
    if(newHand.length===0)await endRound();
    busy.current=false;
  }

  async function layAll(){
    if(!isMyTurn||(!hasDrawn&&!isDealer)||!allMyCardsValid||busy.current)return;
    busy.current=true;
    const newMelds=[...(myRp.melds||[]),myHand];
    await supabase.from("rami_players").update({hand:[],melds:newMelds,has_melded:true}).eq("id",myRp.id);
    setSelected([]);setMsg("🎉 Tout posé !");await endRound();busy.current=false;
  }

  async function discardCard(idx){
    if(!isMyTurn||busy.current)return;
    // Non-distributeur doit avoir pioché avant de défausser
    if(!isDealer&&!hasDrawn){setMsg("Pioche d'abord une carte !");return;}
    busy.current=true;
    const card=myHand[idx];
    const newHand=sortHand(myHand.filter((_,i)=>i!==idx));
    const{data:fr}=await supabase.from("rami_rooms").select("discard_pile,current_seat").eq("id",roomId).single();
    const pile=[...(fr.discard_pile||[]),card];
    const{data:allRp}=await supabase.from("rami_players").select("seat,status").eq("room_id",roomId).order("seat");
    const active=allRp.filter(p=>p.status==="playing").map(p=>p.seat).sort((a,b)=>a-b);
    const ci=active.indexOf(fr.current_seat);
    const nextSeat=active[(ci+1)%active.length];
    await supabase.from("rami_players").update({hand:newHand,has_drawn:false}).eq("id",myRp.id);
    await supabase.from("rami_rooms").update({discard_pile:pile,current_seat:nextSeat}).eq("id",roomId);
    setSelected([]);
    if(newHand.length===0)await endRound();
    busy.current=false;
  }

  async function endRound(){
    const{data:allRp}=await supabase.from("rami_players").select("*,players(username)").eq("room_id",roomId);
    const{data:fr}=await supabase.from("rami_rooms").select("scores,eliminated,round").eq("id",roomId).single();
    const cs={...(fr.scores||{})};const elim=[...(fr.eliminated||[])];
    for(const rp of allRp){
      if(rp.status!=="playing")continue;
      const pts=handPoints(rp.hand||[]);
      cs[rp.player_id]=(cs[rp.player_id]||0)+pts;
      if(cs[rp.player_id]>=101&&!elim.includes(rp.player_id))elim.push(rp.player_id);
    }
    const allIds=allRp.map(p=>p.player_id);
    const survivors=allIds.filter(id=>!elim.includes(id));
    await supabase.from("rami_rooms").update({status:survivors.length<=1?"finished":"waiting",scores:cs,eliminated:elim,round:(fr.round||1)+1}).eq("id",roomId);
    await supabase.from("rami_players").update({status:"done"}).eq("room_id",roomId);
  }

  async function leaveRoom(){
    await supabase.from("rami_players").delete().eq("room_id",roomId).eq("player_id",user.id);
    if(isHost)await supabase.from("rami_rooms").delete().eq("id",roomId);
    onLeave();
  }

  if(!room)return <div style={{background:"#080812",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"#555",fontSize:14}}>Chargement…</div>;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#080812",color:"#fff",fontFamily:"'SF Pro Display',-apple-system,sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px 4px",flexShrink:0}}>
        <div>
          <div style={{color:"#8e44ad",fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>🎴 Rami 101 — #{room.code} — Manche {room.round}</div>
          <div style={{color:"#ffd700",fontSize:20,fontWeight:900}}>{myScore}pts</div>
        </div>
        <button onClick={leaveRoom} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>Quitter</button>
      </div>

      {/* Scores */}
      <div style={{display:"flex",gap:5,padding:"3px 10px",flexShrink:0,overflowX:"auto"}}>
        {ramiPlayers.map(rp=>{
          const sc=scores[rp.player_id]||0,elim=(room.eliminated||[]).includes(rp.player_id);
          const isMe=rp.player_id===user.id,isCur=room.current_seat===rp.seat&&rs==="playing";
          const isD=room.dealer_seat===rp.seat&&rs==="playing";
          return(
            <div key={rp.id} style={{background:elim?"#1a0a0a":isCur?"rgba(255,215,0,.12)":"#141424",border:`1px solid ${isCur?"#ffd700":elim?"#5a1a1a":"#222"}`,borderRadius:8,padding:"3px 8px",textAlign:"center",flexShrink:0}}>
              <div style={{color:isMe?"#ffd700":elim?"#555":"#ccc",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{isCur?"▶ ":""}{rp.players?.username||"?"}{isD?" 🃏":""}</div>
              <div style={{color:elim?"#e74c3c":sc>=80?"#e67e22":"#4caf50",fontSize:12,fontWeight:800}}>{sc}pts</div>
              <div style={{color:"#444",fontSize:8}}>{(rp.hand||[]).length}🃏</div>
            </div>
          );
        })}
      </div>

      {/* TABLE RONDE */}
      <div style={{flex:1,position:"relative",overflow:"hidden",minHeight:0}}>
        <div style={{position:"absolute",left:"5%",right:"5%",top:"2%",bottom:"2%",background:"radial-gradient(ellipse at 50% 50%,#1d7a30 0%,#0d4a1a 55%,#071808 100%)",borderRadius:"50%",border:"5px solid #0a3010",boxShadow:"inset 0 0 70px rgba(0,0,0,.65)"}}/>
        <div style={{position:"absolute",left:"2%",right:"2%",top:"0%",bottom:"0%",borderRadius:"50%",border:"9px solid #6b3810",boxShadow:"inset 0 0 0 2px #3a1e08",pointerEvents:"none"}}/>

        {/* PIOCHE + DÉFAUSSE AU CENTRE */}
        <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",display:"flex",gap:18,alignItems:"flex-start",zIndex:10}}>
          {/* Pioche */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{color:"rgba(255,255,255,.4)",fontSize:8,textTransform:"uppercase",letterSpacing:1}}>Pioche</div>
            <div onClick={canDrawDeck?drawDeck:undefined} style={{cursor:canDrawDeck?"pointer":"default",position:"relative",width:52,height:72}}>
              {[3,2,1,0].map(n=>(
                <div key={n} style={{position:"absolute",top:n*1.5,left:n*1,width:52,height:72,borderRadius:7,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:`1.5px solid ${canDrawDeck&&n===0?"#ffd700":"#3a3a5c"}`,boxShadow:canDrawDeck&&n===0?"0 0 16px rgba(255,215,0,.6)":"none",opacity:dealerMustDiscard?0.3:1}}>
                  {n===0&&<div style={{position:"absolute",inset:4,border:"1px solid rgba(255,215,0,.15)",borderRadius:4}}/>}
                </div>
              ))}
            </div>
            <div style={{color:"#555",fontSize:8}}>{room.deck?.length||0}</div>
          </div>

          {/* Défausse */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{color:"rgba(255,255,255,.4)",fontSize:8,textTransform:"uppercase",letterSpacing:1}}>Défausse</div>
            <div onClick={canDrawDiscard&&discardTop?drawDiscard:undefined} style={{cursor:canDrawDiscard&&discardTop?"pointer":"default",opacity:dealerMustDiscard?0.3:1}}>
              {discardTop
                ? <RCard card={discardTop} highlight={canDrawDiscard&&!!discardTop}/>
                : <div style={{width:52,height:72,borderRadius:7,border:"1.5px dashed rgba(255,255,255,.1)",background:"rgba(0,0,0,.2)"}}/>
              }
            </div>
            {discardTop&&<div style={{color:"#888",fontSize:8}}>{discardTop.rank}{discardTop.suit}</div>}
          </div>
        </div>

        {/* Message */}
        {msg&&<div style={{position:"absolute",left:"50%",top:"20%",transform:"translateX(-50%)",background:"rgba(0,0,0,.88)",borderRadius:10,padding:"5px 14px",color:"#ffd700",fontSize:12,fontWeight:700,whiteSpace:"nowrap",border:"1px solid rgba(255,215,0,.3)",zIndex:20}}>{msg}</div>}

        {/* Tour */}
        {rs==="playing"&&!isMyTurn&&<div style={{position:"absolute",left:"50%",top:"78%",transform:"translateX(-50%)",color:"rgba(255,255,255,.3)",fontSize:10,whiteSpace:"nowrap",zIndex:10}}>
          Tour de <span style={{color:"#ffd700",fontWeight:700}}>{ramiPlayers.find(p=>p.seat===room.current_seat)?.players?.username||"..."}</span>
        </div>}

        {/* Joueurs en cercle */}
        {ramiPlayers.map((rp,idx)=>{
          const total=ramiPlayers.length;
          const angle=(Math.PI/2)+(2*Math.PI*idx/total);
          const px=50+43*Math.cos(angle),py=50-37*Math.sin(angle);
          const isMe=rp.player_id===user.id,isCur=room.current_seat===rp.seat&&rs==="playing";
          const isD=room.dealer_seat===rp.seat&&rs==="playing",elim=(room.eliminated||[]).includes(rp.player_id);
          return(
            <div key={rp.id} style={{position:"absolute",left:`${px}%`,top:`${py}%`,transform:"translate(-50%,-50%)",zIndex:isCur?15:5,display:"flex",flexDirection:"column",alignItems:"center",gap:2,opacity:elim?.4:1}}>
              {!isMe&&(rp.hand||[]).length>0&&rs==="playing"&&(
                <div style={{display:"flex",marginBottom:2}}>
                  {Array.from({length:Math.min((rp.hand||[]).length,6)}).map((_,i)=>(
                    <div key={i} style={{width:14,height:20,borderRadius:2,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1px solid #3a3a5c",marginLeft:i>0?-9:0}}/>
                  ))}
                </div>
              )}
              <div style={{background:isCur?"rgba(255,215,0,.18)":"rgba(0,0,0,.8)",border:`2px solid ${isCur?"#ffd700":isMe?"#2a2a2e":"#1a1a1a"}`,borderRadius:8,padding:"3px 8px",textAlign:"center",minWidth:55,boxShadow:isCur?"0 0 16px rgba(255,215,0,.5)":"none"}}>
                <div style={{color:isMe?"#ffd700":"#ccc",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{isCur?"▶ ":""}{rp.players?.username||"?"}{isD?" 🃏":""}</div>
                <div style={{color:"#888",fontSize:9}}>{(rp.hand||[]).length} cartes</div>
                {(rp.melds||[]).map((meld,mi)=>(
                  <div key={mi} style={{display:"flex",gap:1,justifyContent:"center",marginTop:1,flexWrap:"wrap"}}>
                    {meld.slice(0,5).map((c,ci)=>(
                      <div key={ci} style={{width:10,height:14,borderRadius:1,background:c.joker?"#ffd700":"#fff",border:"0.5px solid #aaa",fontSize:5,color:RED.has(c?.suit)?"#c0392b":"#111",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>
                        {c.joker?"J":c.rank?.[0]}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* MA MAIN */}
      {rs==="playing"&&!isElim&&(
        <div style={{padding:"5px 8px 6px",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
            <div style={{color:"#666",fontSize:9,textTransform:"uppercase",letterSpacing:1}}>
              Main ({myHand.length} — {handPoints(myHand)}pts)
              {selected.length>0&&<span style={{color:selValid?"#27ae60":"#e74c3c"}}> {selected.length}sél {selValid?"✓":"✗"}</span>}
              {dealerMustDiscard&&<span style={{color:"#8e44ad"}}> — Sélectionne une carte à défausser</span>}
            </div>
            {isMyTurn&&!jokerUsed&&<button onClick={addJoker} style={{padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700,border:"none",background:"linear-gradient(135deg,#f39c12,#e67e22)",color:"#fff",cursor:"pointer"}}>🃏 Joker</button>}
          </div>

          <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:5}}>
            {myHand.map((card,i)=>(<RCard key={i} card={card} selected={selected.includes(i)} onClick={()=>(isMyTurn)?toggleSel(i):null}/>))}
          </div>

          {isMyTurn&&(
            <div style={{display:"flex",gap:6}}>
              {/* Poser combo sélectionnée */}
              {selValid&&hasDrawn&&(
                <button onClick={layMeld} style={{flex:2,padding:10,borderRadius:10,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",cursor:"pointer"}}>✅ Poser {selected.length}</button>
              )}
              {/* Défausser */}
              {selected.length===1&&hasDrawn&&(
                <button onClick={()=>discardCard(selected[0])} style={{flex:2,padding:10,borderRadius:10,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#e74c3c,#c0392b)",color:"#fff",cursor:"pointer"}}>🗑 Défausser</button>
              )}
              {/* Tout poser */}
              {allMyCardsValid&&hasDrawn&&selected.length===0&&(
                <button onClick={layAll} style={{flex:1,padding:10,borderRadius:10,fontSize:12,fontWeight:800,border:"none",background:"linear-gradient(135deg,#f39c12,#e67e22)",color:"#fff",cursor:"pointer",animation:"splitPulse 1.2s ease-in-out infinite"}}>🎉 Tout poser</button>
              )}
              {!hasDrawn&&!isDealer&&<div style={{color:"#4caf50",flex:1,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600}}>▶ Pioche ou prends défausse</div>}
              {dealerMustDiscard&&<div style={{color:"#8e44ad",flex:1,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600,textAlign:"center"}}>🃏 Distributeur — sélectionne 1 carte à défausser</div>}
            </div>
          )}
        </div>
      )}

      {/* Attente / Fin */}
      {(rs==="waiting"||rs==="finished")&&(
        <div style={{padding:"8px 14px 14px",flexShrink:0}}>
          {rs==="finished"&&(
            <div style={{textAlign:"center",marginBottom:10}}>
              <div style={{color:"#ffd700",fontSize:16,fontWeight:900,marginBottom:6}}>
                🏆 {(()=>{const s=ramiPlayers.filter(p=>!(room.eliminated||[]).includes(p.player_id));return s.length===1?(s[0].players?.username||"?")+" gagne !":"Partie terminée";})()}
              </div>
              {[...ramiPlayers].sort((a,b)=>(scores[a.player_id]||0)-(scores[b.player_id]||0)).map(rp=>(
                <div key={rp.id} style={{color:"#888",fontSize:12,marginBottom:2}}>{rp.players?.username||"?"} — {scores[rp.player_id]||0}pts {(room.eliminated||[]).includes(rp.player_id)?"❌":""}</div>
              ))}
            </div>
          )}
          {rs==="waiting"&&isHost&&ramiPlayers.length>=2&&(
            <button onClick={startRound} style={{width:"100%",padding:13,background:"linear-gradient(135deg,#ffd700,#ffaa00)",border:"none",borderRadius:12,fontSize:15,fontWeight:900,color:"#111",cursor:"pointer",marginBottom:8}}>▶ Distribuer — Manche {room.round}</button>
          )}
          {rs==="waiting"&&!isHost&&<div style={{color:"#444",textAlign:"center",fontSize:13,marginBottom:8}}>En attente du créateur…</div>}
          <button onClick={leaveRoom} style={{width:"100%",padding:10,borderRadius:10,fontSize:13,border:"1px solid #222",background:"transparent",color:"#555",cursor:"pointer"}}>Quitter</button>
        </div>
      )}
      {isElim&&rs==="playing"&&<div style={{padding:10,textAlign:"center",color:"#e74c3c",fontSize:13,fontWeight:700,flexShrink:0}}>Éliminé — observe !</div>}
    </div>
  );
}
