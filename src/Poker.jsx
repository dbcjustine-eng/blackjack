import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";
import { evaluateHand } from "./poker-eval.js";
import { freshDeck, logTransaction } from "./App.jsx";

const RED   = new Set(["♥","♦"]);
const BIG_BLIND = 10, SMALL_BLIND = 5;
const BOT_TOKENS = 1000;
const BOT_NAMES  = ["Carlos","Yuki","Frank","Sofia","Luca","Ines","Theo"];
const BOT_ICONS  = ["🤠","🧠","😎","🦊","🐻","🎩","🤖"];

// ── CARTE POKER ───────────────────────────────────────────────────────────────
function PCard({ card, hidden, size="md" }) {
  const [face, setFace] = useState(false);
  const red = card && RED.has(card.suit);
  const sz = size==="sm" ? {w:32,h:46,fs:9} : size==="lg" ? {w:48,h:68,fs:13} : size==="xl" ? {w:58,h:82,fs:15} : {w:42,h:60,fs:12};
  useEffect(() => {
    if (!hidden) { const t=setTimeout(()=>setFace(true),60); return()=>clearTimeout(t); }
    else setFace(false);
  }, [hidden, card?.rank, card?.suit]);
  return (
    <div style={{width:sz.w,height:sz.h,flexShrink:0,perspective:500}}>
      <div style={{width:"100%",height:"100%",position:"relative",transformStyle:"preserve-3d",transform:face?"rotateY(0deg)":"rotateY(180deg)",transition:"transform .35s cubic-bezier(.4,0,.2,1)"}}>
        <div style={{position:"absolute",inset:0,backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",background:"#fff",borderRadius:6,border:"1.5px solid #ddd",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"2px 3px",boxShadow:"0 3px 10px rgba(0,0,0,.55)"}}>
          <div style={{fontSize:sz.fs,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1}}>{card?.rank}<br/>{card?.suit}</div>
          <div style={{fontSize:sz.fs,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1,alignSelf:"flex-end",transform:"rotate(180deg)"}}>{card?.rank}<br/>{card?.suit}</div>
        </div>
        <div style={{position:"absolute",inset:0,backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",transform:"rotateY(180deg)",background:"linear-gradient(135deg,#1a1a2e,#16213e)",borderRadius:6,border:"1.5px solid #3a3a5c",boxShadow:"0 3px 10px rgba(0,0,0,.55)",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:4,border:"1px solid rgba(255,215,0,.2)",borderRadius:3,backgroundImage:"repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,215,0,.04) 4px,rgba(255,215,0,.04) 8px)"}}/>
        </div>
      </div>
    </div>
  );
}

// ── POSITIONS AUTOUR DE LA TABLE OVALE ───────────────────────────────────────
function getSeatPos(total) {
  return Array.from({length:total},(_,i)=>{
    const angle = (Math.PI/2) + (2*Math.PI*i/total);
    return { x: 50 + 42*Math.cos(angle), y: 42 + 34*Math.sin(angle) };
  });
}

// ── SIÈGE ─────────────────────────────────────────────────────────────────────
function Seat({ name, icon, tokens, betThisRound, status, holeCards, isMe, isActive, isDealer, isSB, isBB, showCards, winner, posStyle }) {
  const folded = status==="folded";
  const cards  = holeCards || [];
  return (
    <div style={{position:"absolute",transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:2,...posStyle}}>
      <div style={{display:"flex",gap:2,marginBottom:2}}>
        {isMe
          ? cards.map((c,i)=><PCard key={i} card={c} hidden={false} size="lg"/>)
          : cards.length>0 && !folded
            ? showCards
              ? cards.map((c,i)=><PCard key={i} card={c} hidden={false} size="md"/>)
              : [<PCard key={0} card={null} hidden={true} size="md"/>,<PCard key={1} card={null} hidden={true} size="md"/>]
            : null
        }
      </div>
      <div style={{background:isActive?"rgba(255,215,0,.15)":"rgba(0,0,0,.55)",border:`2px solid ${isActive?"#ffd700":winner?"#4caf50":isMe?"#2a2a2e":"#1a1a1a"}`,borderRadius:12,padding:"4px 9px",textAlign:"center",minWidth:62,opacity:folded?.45:1,boxShadow:isActive?"0 0 18px rgba(255,215,0,.45)":"none",transition:"all .2s",position:"relative"}}>
        <div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)",display:"flex",gap:2}}>
          {isDealer&&<span style={{background:"#ffd700",color:"#111",fontSize:8,fontWeight:900,padding:"1px 4px",borderRadius:3}}>D</span>}
          {isSB&&<span style={{background:"#3498db",color:"#fff",fontSize:8,fontWeight:900,padding:"1px 4px",borderRadius:3}}>SB</span>}
          {isBB&&<span style={{background:"#e74c3c",color:"#fff",fontSize:8,fontWeight:900,padding:"1px 4px",borderRadius:3}}>BB</span>}
        </div>
        {winner&&<span style={{position:"absolute",top:-10,right:-4,fontSize:14}}>🏆</span>}
        <div style={{fontSize:isMe?11:14}}>{isMe?"👤":icon}</div>
        <div style={{color:isMe?"#ffd700":"#ccc",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{isMe?"Vous":name}</div>
        <div style={{color:"#4caf50",fontSize:9}}>🪙{tokens}</div>
        {betThisRound>0&&<div style={{color:"#ffa500",fontSize:8}}>bet:{betThisRound}</div>}
        {status==="allin"&&<div style={{color:"#8e44ad",fontSize:8,fontWeight:700}}>ALL-IN</div>}
        {folded&&<div style={{color:"#e74c3c",fontSize:8}}>FOLD</div>}
      </div>
    </div>
  );
}

// ── BOT AI ────────────────────────────────────────────────────────────────────
function botStrength(holeCards, community) {
  if (!holeCards||holeCards.length<2) return 0.3;
  if (community.length===0) {
    const v={A:14,K:13,Q:12,J:11};
    const vals=holeCards.map(c=>v[c.rank]||parseInt(c.rank)||0);
    const pair=vals[0]===vals[1], hi=Math.max(...vals);
    if(pair) return 0.70+(hi/14)*0.28;
    if(hi>=13) return 0.55; if(hi>=11) return 0.44; if(hi>=9) return 0.36;
    return 0.22+Math.random()*0.12;
  }
  const e=evaluateHand([...holeCards,...community]);
  return Math.min(0.97, e.rank/9*0.75+Math.random()*0.18);
}

function botAction(bot, g) {
  const str=botStrength(bot.holeCards,g.community);
  const tc=Math.max(0,g.currentBet-(bot.betThisRound||0));
  const r=Math.random(), agg=0.25+(bot.seat%3)*0.2;
  if(str>0.75) return r<agg?"raise":tc===0?"check":"call";
  if(str>0.5)  { if(tc===0) return r<0.25?"raise":"check"; if(tc<g.pot*0.35) return r<0.2?"raise":"call"; return r<0.35?"fold":"call"; }
  if(str>0.3)  { if(tc===0) return "check"; if(tc<15) return r<0.45?"call":"fold"; return "fold"; }
  return tc===0?"check":r<0.15?"call":"fold";
}


// ── AUTO NEXT HAND (relance automatique après 3s) ─────────────────────────────
function AutoNextHand({ onNext, onQuit }) {
  const [count, setCount] = useState(4);
  useEffect(()=>{
    const t = setInterval(()=>{
      setCount(p=>{
        if(p<=1){ clearInterval(t); onNext(); return 0; }
        return p-1;
      });
    },1000);
    return()=>clearInterval(t);
  },[]);
  return(
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <div style={{flex:1,textAlign:"center"}}>
        <div style={{color:"#555",fontSize:10,marginBottom:2}}>Prochaine main dans…</div>
        <div style={{color:"#ffd700",fontSize:28,fontWeight:900,lineHeight:1}}>{count}</div>
      </div>
      <button onClick={onQuit} style={{padding:"12px 16px",borderRadius:12,fontSize:13,fontWeight:800,border:"1px solid #333",background:"transparent",color:"#888",cursor:"pointer",flexShrink:0}}>Quitter</button>
    </div>
  );
}

// ── POKER SOLO VS BOTS ────────────────────────────────────────────────────────
export function PokerSoloBots({ user, botCount, onBack, onUpdateTokens }) {
  function makeBots(n) {
    return Array.from({length:n},(_,i)=>({id:"bot-"+i,name:BOT_NAMES[i],icon:BOT_ICONS[i],tokens:BOT_TOKENS,seat:i+1,holeCards:[],betThisRound:0,totalBet:0,status:"active"}));
  }

  function buildGame(playerTokens, existingBots) {
    const bots=existingBots?existingBots.map(b=>({...b,holeCards:[],betThisRound:0,status:"active"})):makeBots(botCount);
    const deck=freshDeck();
    const allSeats=[0,...bots.map(b=>b.seat)];
    const sbSeat=allSeats[0], bbSeat=allSeats[1%allSeats.length], actionSeat=allSeats[(2)%allSeats.length<allSeats.length?(2)%allSeats.length:0];
    const playerCards=[deck.pop(),deck.pop()];
    const newBots=bots.map(b=>({...b,holeCards:[deck.pop(),deck.pop()]}));
    let pot=SMALL_BLIND+BIG_BLIND, pBet=0;
    if(sbSeat===0){playerTokens-=SMALL_BLIND;}
    else{const b=newBots.find(x=>x.seat===sbSeat);if(b){b.betThisRound=SMALL_BLIND;b.totalBet=SMALL_BLIND;b.tokens-=SMALL_BLIND;}}
    if(bbSeat===0){playerTokens-=BIG_BLIND;pBet=BIG_BLIND;}
    else{const b=newBots.find(x=>x.seat===bbSeat);if(b){b.betThisRound=BIG_BLIND;b.totalBet=BIG_BLIND;b.tokens-=BIG_BLIND;}}
    return {deck,community:[],pot,currentBet:BIG_BLIND,phase:"preflop",actionSeat,dealerSeat:0,sbSeat,bbSeat,playerCards,playerBet:pBet,playerTotalBet:pBet,playerStatus:"active",bots:newBots,playerTokens,msg:"",winners:[],lastRaiseSeat:null,actedSinceRaise:new Set()};
  }

  const [game,setGame]=useState(()=>buildGame(user.tokens));
  const [raiseInput,setRaiseInput]=useState("");

  const advance=useCallback((g,isRaise=false)=>{
    // Joueurs encore en jeu (pas foldés)
    const stillIn=[
      ...(g.playerStatus!=="folded"?[0]:[]),
      ...g.bots.filter(b=>b.status!=="folded").map(b=>b.seat)
    ];
    if(stillIn.length<=1) return doShowdown(g);

    // Tous les sièges dans l'ordre (incluant les foldés pour garder l'ordre de rotation)
    const allSeatsOrdered=[0,...g.bots.map(b=>b.seat)].sort((a,b)=>a-b);

    // Si raise : mémoriser qui a raisé + réinitialiser les "ont agi depuis raise"
    if(isRaise){
      g.lastRaiseSeat=g.actionSeat;
      g.actedSinceRaise=new Set([g.actionSeat]);
    } else {
      // Marquer que ce siège a agi
      if(!g.actedSinceRaise) g.actedSinceRaise=new Set();
      g.actedSinceRaise.add(g.actionSeat);
    }

    // Trouver le prochain siège DANS L'ORDRE (en incluant foldés pour rotation)
    // mais on skip les foldés pour l'action
    const ci=allSeatsOrdered.indexOf(g.actionSeat);
    let nextSeat=null;
    for(let i=1;i<=allSeatsOrdered.length;i++){
      const candidate=allSeatsOrdered[(ci+i)%allSeatsOrdered.length];
      // Skip si foldé
      if(candidate===0 && g.playerStatus==="folded") continue;
      const bot=g.bots.find(b=>b.seat===candidate);
      if(bot && bot.status==="folded") continue;
      nextSeat=candidate;
      break;
    }
    if(nextSeat===null) return doNextPhase(g);

    // Joueurs actifs (pas foldés, pas all-in)
    const activeSeats=[
      ...(g.playerStatus==="active"?[0]:[]),
      ...g.bots.filter(b=>b.status==="active").map(b=>b.seat)
    ];

    // Le tour est terminé si :
    // 1. Le prochain joueur est le raiser ET tous ceux qui pouvaient agir l'ont fait
    // 2. Pas de raise en cours et tout le monde a égalisé
    const allEq=activeSeats.every(s=>{
      if(s===0) return g.playerBet===g.currentBet||g.playerStatus==="allin";
      const b=g.bots.find(x=>x.seat===s);
      return b&&(b.betThisRound===g.currentBet||b.status==="allin");
    });

    if(allEq){
      // Si raise en cours : finir seulement si le prochain est le raiser (il a déjà agi)
      if(g.lastRaiseSeat!=null){
        if(nextSeat===g.lastRaiseSeat) return doNextPhase(g);
      } else {
        return doNextPhase(g);
      }
    }

    g.actionSeat=nextSeat;
    return g;
  },[]);

  function doNextPhase(g) {
    g.playerBet=0; g.bots=g.bots.map(b=>({...b,betThisRound:0})); g.currentBet=0;
    g.lastRaiseSeat=null; g.actedSinceRaise=new Set(); // réinitialiser pour la nouvelle phase
    const as=[...(g.playerStatus!=="folded"?[0]:[]),...g.bots.filter(b=>b.status!=="folded").map(b=>b.seat)].sort((a,b)=>a-b);
    g.actionSeat=as[0]??0;
    if(g.phase==="preflop"){g.community=[g.deck.pop(),g.deck.pop(),g.deck.pop()];g.phase="flop";}
    else if(g.phase==="flop"){g.community=[...g.community,g.deck.pop()];g.phase="turn";}
    else if(g.phase==="turn"){g.community=[...g.community,g.deck.pop()];g.phase="river";}
    else return doShowdown(g);
    return g;
  }

  function doShowdown(g) {
    g.phase="showdown"; g.botThinking=false;
    const res=[];
    if(g.playerStatus!=="folded"){const h=evaluateHand([...g.playerCards,...g.community]);res.push({seat:0,name:"Vous",score:h.score,handName:h.name});}
    g.bots.filter(b=>b.status!=="folded").forEach(b=>{const h=evaluateHand([...b.holeCards,...g.community]);res.push({seat:b.seat,name:b.icon+" "+b.name,score:h.score,handName:h.name});});
    if(res.length===0){g.msg="Tout le monde a foldé !";return g;}
    res.sort((a,b)=>b.score-a.score);
    const top=res[0].score, ws=res.filter(r=>r.score===top), share=Math.floor(g.pot/ws.length);
    ws.forEach(w=>{if(w.seat===0)g.playerTokens+=share;else{const b=g.bots.find(x=>x.seat===w.seat);if(b)b.tokens+=share;}});
    g.winners=ws;
    g.msg="🏆 "+ws.map(w=>w.name+" ("+w.handName+")").join(" & ")+" +"+share+"🪙";
    return g;
  }

  function act(action, raiseAmt=0) {
    setGame(prev=>{
      let g={...prev,bots:prev.bots.map(b=>({...b})),msg:""};
      const tc=Math.max(0,g.currentBet-(g.playerBet||0));
      if(action==="fold"){g.playerStatus="folded";}
      else if(action==="call"){const c=Math.min(tc,g.playerTokens);g.playerTokens-=c;g.playerBet=(g.playerBet||0)+c;g.playerTotalBet=(g.playerTotalBet||0)+c;g.pot+=c;}
      else if(action==="raise"){const c=Math.min(tc,g.playerTokens);const tot=Math.min(c+raiseAmt,g.playerTokens);g.playerTokens-=tot;g.playerBet=(g.playerBet||0)+tot;g.playerTotalBet=(g.playerTotalBet||0)+tot;g.pot+=tot;g.currentBet=g.playerBet;}
      return advance(g,action==="raise");
    });
  }

  // Bots réactifs — simple et robuste
  const botTimerRef = useRef(null);
  useEffect(()=>{
    clearTimeout(botTimerRef.current);
    if(!["preflop","flop","turn","river"].includes(game.phase)) return;
    if(game.actionSeat===0) return;
    const snapshot = { seat: game.actionSeat, phase: game.phase };
    botTimerRef.current = setTimeout(()=>{
      setGame(prev=>{
        // Vérifier que le tour n'a pas changé entre-temps
        if(prev.actionSeat!==snapshot.seat||prev.phase!==snapshot.phase) return prev;
        if(!["preflop","flop","turn","river"].includes(prev.phase)) return prev;
        let g={...prev,bots:prev.bots.map(b=>({...b}))};
        const b=g.bots.find(x=>x.seat===g.actionSeat);
        if(!b||b.status!=="active") return advance(g,false);
        const decision=botAction(b,g);
        const tc=Math.max(0,g.currentBet-(b.betThisRound||0));
        if(decision==="fold"){b.status="folded";g.msg=b.icon+" "+b.name+" passe";}
        else if(decision==="call"||decision==="check"){const c=tc>0?Math.min(tc,b.tokens):0;if(c>0){b.tokens-=c;b.betThisRound=(b.betThisRound||0)+c;b.totalBet=(b.totalBet||0)+c;g.pot+=c;}g.msg=tc===0?b.icon+" "+b.name+" check":b.icon+" "+b.name+" call "+c+"🪙";}
        else{const extra=Math.max(BIG_BLIND,Math.floor(BIG_BLIND+Math.random()*g.pot*0.35));const tot=Math.min(tc+extra,b.tokens);b.tokens-=tot;b.betThisRound=(b.betThisRound||0)+tot;b.totalBet=(b.totalBet||0)+tot;g.pot+=tot;g.currentBet=b.betThisRound;g.msg=b.icon+" "+b.name+" relance "+tot+"🪙 💪";}
        return advance(g,decision==="raise");
      });
    }, 1000+Math.random()*800);
    return()=>clearTimeout(botTimerRef.current);
  },[game.actionSeat,game.phase]);

  // Timer 20s joueur
  const isMyTurnNow = game.actionSeat===0&&game.playerStatus==="active"&&["preflop","flop","turn","river"].includes(game.phase);
  const turnTimerRef2=useRef(null);
  const [turnTimer,setTurnTimer]=useState(null);
  useEffect(()=>{
    if(!isMyTurnNow){clearInterval(turnTimerRef2.current);setTurnTimer(null);return;}
    setTurnTimer(20);
    clearInterval(turnTimerRef2.current);
    turnTimerRef2.current=setInterval(()=>{
      setTurnTimer(prev=>{
        if(prev===null)return null;
        if(prev<=1){
          clearInterval(turnTimerRef2.current);
          setGame(p=>{ const g2={...p,bots:p.bots.map(b=>({...b})),msg:""}; g2.playerStatus="folded"; return advance(g2,false); });
          return null;
        }
        return prev-1;
      });
    },1000);
    return()=>clearInterval(turnTimerRef2.current);
  },[isMyTurnNow]);

  function newHand() {
    const diff=game.playerTokens-user.tokens;
    if(diff!==0) onUpdateTokens(diff,diff>0?"Poker vs Bots (gagné)":"Poker vs Bots (perdu)");
    const surv=game.bots.filter(b=>b.tokens>0);
    setGame(buildGame(game.playerTokens<=0?1000:game.playerTokens,surv.length>0?surv.map((b,i)=>({...b,seat:i+1})):undefined));
    setRaiseInput("");
  }

  const g=game;
  const isMyTurn=g.actionSeat===0&&g.playerStatus==="active"&&["preflop","flop","turn","river"].includes(g.phase);
  const toCall=Math.max(0,g.currentBet-(g.playerBet||0));
  const PHASE={preflop:"Preflop",flop:"Flop",turn:"Turn",river:"River",showdown:"Showdown"};
  const total=1+g.bots.length;
  const positions=getSeatPos(total);
  const myHandName=g.playerCards.length===2&&g.community.length>=3?evaluateHand([...g.playerCards,...g.community]).name:null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#080812",fontFamily:"'SF Pro Display',-apple-system,sans-serif",color:"#fff"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px 4px",flexShrink:0}}>
        <div>
          <div style={{color:"#e74c3c",fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>♠ Texas Hold em — {PHASE[g.phase]||""}</div>
          <div style={{color:"#ffd700",fontSize:22,fontWeight:900}}>🪙 {g.playerTokens.toLocaleString()}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{textAlign:"right"}}><div style={{color:"#555",fontSize:9}}>POT</div><div style={{color:"#ffd700",fontWeight:800,fontSize:15}}>🪙{g.pot}</div></div>
          <button onClick={()=>{const d=g.playerTokens-user.tokens;if(d!==0)onUpdateTokens(d,"Poker vs Bots");onBack();}} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
        </div>
      </div>

      <div style={{flex:1,position:"relative",overflow:"hidden",minHeight:0}}>
        <div style={{position:"absolute",left:"7%",right:"7%",top:"4%",bottom:"4%",background:"radial-gradient(ellipse at 50% 50%,#1d7a30 0%,#0d4a1a 55%,#071808 100%)",borderRadius:"50%",border:"5px solid #0a3010",boxShadow:"inset 0 0 70px rgba(0,0,0,.65),0 0 20px rgba(0,0,0,.4)"}}/>
        <div style={{position:"absolute",left:"4%",right:"4%",top:"1%",bottom:"1%",borderRadius:"50%",border:"9px solid #6b3810",boxShadow:"inset 0 0 0 2px #3a1e08,0 0 0 2px #8a5520",pointerEvents:"none"}}/>

        {/* Cartes communes + POT */}
        <div style={{position:"absolute",left:"50%",top:"40%",transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:5,alignItems:"center"}}>
            {[0,1,2,3,4].map(i=>(
              g.community[i]
                ? <PCard key={i} card={g.community[i]} hidden={false} size="xl"/>
                : <div key={i} style={{width:58,height:82,borderRadius:7,border:"1.5px dashed rgba(255,255,255,.1)",background:"rgba(0,0,0,.12)"}}/>
            ))}
          </div>
          {g.pot>0&&(
            <div style={{
              background:"rgba(0,0,0,.75)",borderRadius:20,
              padding:"5px 18px",
              border:"1.5px solid rgba(255,215,0,.35)",
              display:"flex",alignItems:"center",gap:6,
            }}>
              <span style={{color:"#aaa",fontSize:11,textTransform:"uppercase",letterSpacing:1}}>Pot</span>
              <span style={{color:"#ffd700",fontSize:22,fontWeight:900,lineHeight:1}}>{g.pot.toLocaleString()}</span>
              <span style={{color:"#ffd700",fontSize:14}}>🪙</span>
            </div>
          )}
        </div>

        {myHandName&&g.phase!=="showdown"&&(
          <div style={{position:"absolute",left:"50%",top:"56%",transform:"translateX(-50%)",background:"rgba(0,0,0,.7)",borderRadius:6,padding:"2px 12px",color:"#ffd700",fontSize:10,fontWeight:700,whiteSpace:"nowrap",border:"1px solid rgba(255,215,0,.2)"}}>{myHandName}</div>
        )}

        {g.msg&&(
          <div style={{position:"absolute",left:"50%",top:g.phase==="showdown"?"26%":"23%",transform:"translateX(-50%)",background:"rgba(0,0,0,.85)",borderRadius:10,padding:"5px 14px",color:g.phase==="showdown"?"#ffd700":"#ccc",fontSize:g.phase==="showdown"?13:11,fontWeight:g.phase==="showdown"?800:400,whiteSpace:"nowrap",maxWidth:"88%",textAlign:"center",lineHeight:1.4,textShadow:g.phase==="showdown"?"0 0 16px rgba(255,215,0,.6)":"none",animation:g.phase==="showdown"?"tableGlow 1s ease-in-out infinite":"none",border:g.phase==="showdown"?"1px solid rgba(255,215,0,.3)":"none"}}>
            {g.msg}
          </div>
        )}

        {g.actionSeat!==0&&g.phase!=="showdown"&&(
          <div style={{position:"absolute",left:"50%",top:"18%",transform:"translateX(-50%)",color:"rgba(255,255,255,.3)",fontSize:10,whiteSpace:"nowrap"}}>
            {g.bots.find(b=>b.seat===g.actionSeat)?.icon} réfléchit…
          </div>
        )}

        {/* Siège joueur */}
        <Seat
          name="Vous" icon="👤" tokens={g.playerTokens} betThisRound={g.playerBet}
          status={g.playerStatus} holeCards={g.playerCards}
          isMe={true} isActive={isMyTurn}
          isDealer={g.dealerSeat===0} isSB={g.sbSeat===0} isBB={g.bbSeat===0}
          showCards={false} winner={!!g.winners?.find(w=>w.seat===0)}
          posStyle={{left:`${positions[0].x}%`,top:`${positions[0].y}%`}}
        />
        {g.bots.map((bot,i)=>(
          <Seat key={bot.id}
            name={bot.name} icon={bot.icon} tokens={bot.tokens} betThisRound={bot.betThisRound}
            status={bot.status} holeCards={bot.holeCards}
            isMe={false} isActive={g.actionSeat===bot.seat&&["preflop","flop","turn","river"].includes(g.phase)}
            isDealer={g.dealerSeat===bot.seat} isSB={g.sbSeat===bot.seat} isBB={g.bbSeat===bot.seat}
            showCards={g.phase==="showdown"} winner={!!g.winners?.find(w=>w.seat===bot.seat)}
            posStyle={{left:`${positions[i+1].x}%`,top:`${positions[i+1].y}%`}}
          />
        ))}
      </div>

      <div style={{padding:"8px 12px 14px",flexShrink:0}}>
        {isMyTurn&&(
          <div>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <div style={{display:"flex",flexDirection:"column",flex:1,alignItems:"center",gap:3}}>
                {turnTimer!==null&&<div style={{fontSize:11,fontWeight:800,color:turnTimer<=5?"#e74c3c":"#ffd700",lineHeight:1}}>⏱ {turnTimer}s</div>}
                <button onClick={()=>act("fold")} style={{width:"100%",padding:"11px 0",borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#5c1010,#3a0808)",color:"#e74c3c",cursor:"pointer"}}>FOLD</button>
              </div>
              {toCall===0
                ?<button onClick={()=>act("check")} style={{flex:2,padding:"11px 0",borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#1a5a9a,#0d3a6a)",color:"#fff",cursor:"pointer"}}>CHECK</button>
                :<button onClick={()=>act("call")} style={{flex:2,padding:"11px 0",borderRadius:11,fontSize:14,fontWeight:800,border:"none",background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",cursor:"pointer",boxShadow:"0 3px 12px rgba(39,174,96,.4)"}}>CALL {toCall}🪙</button>
              }
            </div>
            <div style={{display:"flex",gap:6}}>
              <input type="number" value={raiseInput} onChange={e=>setRaiseInput(e.target.value)} placeholder={"Raise min "+BIG_BLIND+"🪙"} style={{flex:1,background:"#0e0e1e",border:"1.5px solid #2a2a3e",borderRadius:10,padding:"10px 10px",color:"#ffd700",fontSize:13,fontWeight:700,outline:"none"}}/>
              <button onClick={()=>{const a=parseInt(raiseInput)||0;if(a>=BIG_BLIND){act("raise",a);setRaiseInput("");}}} style={{padding:"10px 16px",background:"linear-gradient(135deg,#8e44ad,#6c3483)",border:"none",borderRadius:10,fontSize:13,fontWeight:800,color:"#fff",cursor:"pointer"}}>RAISE</button>
            </div>
          </div>
        )}
        {!isMyTurn&&g.phase!=="showdown"&&(
          <div style={{color:"#444",textAlign:"center",fontSize:12,padding:8}}>{g.playerStatus==="folded"?"Vous avez passé — en attente du showdown…":"Attente de votre tour…"}</div>
        )}
        {g.phase==="showdown"&&(
          <AutoNextHand onNext={newHand} onQuit={()=>{const d=g.playerTokens-user.tokens;if(d!==0)onUpdateTokens(d,"Poker vs Bots");onBack();}}/>
        )}
      </div>

      <style>{"@keyframes tableGlow{0%,100%{opacity:1}50%{opacity:.82}}"}</style>
    </div>
  );
}

// ── POKER LOBBY ───────────────────────────────────────────────────────────────
export function PokerLobby({ user, onEnterRoom, onSoloBots, onBack }) {
  const [code,setCode]=useState("");
  const [creating,setCreating]=useState(false);
  const [joining,setJoining]=useState(false);
  const [error,setError]=useState("");
  const [botCount,setBotCount]=useState(3);

  async function createRoom(){
    setCreating(true);setError("");
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let rc="";
    for(let i=0;i<4;i++)rc+=chars[Math.floor(Math.random()*chars.length)];
    const{data,error:err}=await supabase.from("poker_rooms").insert({code:rc,host_id:user.id,status:"waiting",deck:freshDeck(),community_cards:[],pot:0,current_bet:0}).select().single();
    if(err){setError("Erreur création");setCreating(false);return;}
    await supabase.from("poker_players").insert({room_id:data.id,player_id:user.id,seat:0,status:"waiting",is_ready:false,hole_cards:[]});
    setCreating(false);onEnterRoom(data.id);
  }

  async function joinRoom(){
    if(!code.trim())return;setJoining(true);setError("");
    const{data:room}=await supabase.from("poker_rooms").select("*").eq("code",code.trim().toUpperCase()).single();
    if(!room){setError("Salle introuvable");setJoining(false);return;}
    if(room.status!=="waiting"){setError("Partie déjà en cours");setJoining(false);return;}
    const{data:pp}=await supabase.from("poker_players").select("seat,player_id").eq("room_id",room.id);
    if(pp&&pp.length>=6){setError("Table complète");setJoining(false);return;}
    const already=pp?.find(p=>p.player_id===user.id);
    if(!already)await supabase.from("poker_players").insert({room_id:room.id,player_id:user.id,seat:pp?.length||0,status:"waiting",is_ready:false,hole_cards:[]});
    setJoining(false);onEnterRoom(room.id);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 20px 20px",background:"#080812",color:"#fff"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 18px"}}>
        <div><div style={{color:"#e74c3c",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Poker</div><div style={{color:"#fff",fontSize:22,fontWeight:900}}>Texas Hold'em</div></div>
        <button onClick={onBack} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#666",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>← Retour</button>
      </div>
      <div style={{color:"#555",fontSize:12,textAlign:"center",marginBottom:16}}>🪙 {user.tokens.toLocaleString()} jetons</div>

      <div style={{background:"#0a1a0a",border:"1.5px solid #1a4a1a",borderRadius:14,padding:14,marginBottom:14}}>
        <div style={{color:"#4caf50",fontSize:12,fontWeight:700,marginBottom:10}}>🤖 Solo vs Bots</div>
        <div style={{display:"flex",gap:5,marginBottom:10}}>
          {[2,3,4,5,6].map(n=>(
            <button key={n} onClick={()=>setBotCount(n)} style={{flex:1,padding:"8px 0",borderRadius:8,fontSize:14,fontWeight:700,border:"none",cursor:"pointer",background:botCount===n?"#4caf50":"#0a200a",color:botCount===n?"#111":"#4caf50",transition:"all .15s"}}>{n}</button>
          ))}
        </div>
        <div style={{color:"#444",fontSize:10,textAlign:"center",marginBottom:8}}>{botCount} adversaire{botCount>1?"s":""} IA</div>
        <button onClick={()=>onSoloBots(botCount)} style={{width:"100%",padding:12,background:"linear-gradient(135deg,#27ae60,#1e8449)",border:"none",borderRadius:10,fontSize:14,fontWeight:900,color:"#fff",cursor:"pointer",boxShadow:"0 4px 14px rgba(39,174,96,.4)"}}>▶ Jouer vs {botCount} bot{botCount>1?"s":""}</button>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,margin:"0 0 14px"}}>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/><div style={{color:"#333",fontSize:11}}>ou multijoueur en ligne</div><div style={{flex:1,height:1,background:"#1a1a2e"}}/>
      </div>

      <button onClick={createRoom} disabled={creating} style={{width:"100%",padding:14,marginBottom:10,background:creating?"#1a1a2e":"linear-gradient(135deg,#e74c3c,#c0392b)",border:"none",borderRadius:14,fontSize:14,fontWeight:900,color:"#fff",cursor:creating?"default":"pointer",boxShadow:"0 4px 20px rgba(231,76,60,.35)"}}>{creating?"Création…":"♠ Créer une table"}</button>

      <div style={{display:"flex",gap:8}}>
        <input value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setError("");}} onKeyDown={e=>e.key==="Enter"&&joinRoom()} placeholder="Code ex: K7X2" maxLength={4} style={{flex:1,background:"#10101e",border:"1.5px solid #1a1a2e",borderRadius:12,padding:"13px 14px",color:"#fff",fontSize:16,fontWeight:700,letterSpacing:3,outline:"none",textAlign:"center"}}/>
        <button onClick={joinRoom} disabled={joining} style={{padding:"13px 18px",background:"#0d1a3a",border:"1.5px solid #1a3a6c",borderRadius:12,fontSize:14,fontWeight:800,color:"#5b8de8",cursor:"pointer"}}>{joining?"…":"Rejoindre"}</button>
      </div>
      {error&&<div style={{color:"#e74c3c",fontSize:13,marginTop:10,textAlign:"center",fontWeight:600}}>⚠ {error}</div>}
    </div>
  );
}

// ── POKER ROOM multijoueur ─────────────────────────────────────────────────────
export function PokerRoom({ user, roomId, onLeave, onUpdateTokens }) {
  const [room,setRoom]=useState(null);
  const [pp,setPP]=useState([]);
  const [myPp,setMyPp]=useState(null);
  const [raiseAmt,setRaiseAmt]=useState("");
  const [winners,setWinners]=useState([]);
  const busy=useRef(false);
  const isHost=room?.host_id===user.id;

  useEffect(()=>{
    load();
    const sub=supabase.channel("pkr-"+roomId)
      .on("postgres_changes",{event:"*",schema:"public",table:"poker_rooms",filter:`id=eq.${roomId}`},p=>{setRoom(p.new);if(p.new.winners?.length)setWinners(p.new.winners);})
      .on("postgres_changes",{event:"*",schema:"public",table:"poker_players",filter:`room_id=eq.${roomId}`},p=>{
        if(p.eventType==="DELETE"){setPP(prev=>prev.filter(x=>x.id!==p.old.id));return;}
        setPP(prev=>{const e=prev.find(x=>x.id===p.new.id);return e?prev.map(x=>x.id===p.new.id?p.new:x):[...prev,p.new];});
        if(p.new.player_id===user.id)setMyPp(p.new);
      }).subscribe();
    return()=>supabase.removeChannel(sub);
  },[roomId]);

  async function load(){
    const{data:r}=await supabase.from("poker_rooms").select("*").eq("id",roomId).single();if(r){setRoom(r);if(r.winners?.length)setWinners(r.winners);}
    const{data:p}=await supabase.from("poker_players").select("*,players(username,tokens)").eq("room_id",roomId).order("seat");if(p){setPP(p);const me=p.find(x=>x.player_id===user.id);if(me)setMyPp(me);}
  }

  async function setReady(){await supabase.from("poker_players").update({is_ready:true}).eq("id",myPp.id);}

  async function startGame(){
    if(!isHost||busy.current)return;busy.current=true;
    const active=pp.filter(p=>p.is_ready);if(active.length<2){busy.current=false;return;}
    const deck=freshDeck(),seats=active.map(p=>p.seat).sort((a,b)=>a-b);
    for(const rp of active){const c1=deck.pop(),c2=deck.pop();const isSB=rp.seat===seats[0],isBB=rp.seat===seats[1%seats.length];const blind=isSB?SMALL_BLIND:isBB?BIG_BLIND:0;await supabase.from("poker_players").update({hole_cards:[c1,c2],status:"active",bet_this_round:blind,total_bet:blind,is_ready:true}).eq("id",rp.id);if(blind>0){const{data:pl}=await supabase.from("players").select("tokens").eq("id",rp.player_id).single();if(pl)await supabase.from("players").update({tokens:Math.max(0,pl.tokens-blind)}).eq("id",rp.player_id);}}
    await supabase.from("poker_rooms").update({status:"preflop",deck,community_cards:[],pot:SMALL_BLIND+BIG_BLIND,current_bet:BIG_BLIND,action_seat:seats[(2)%seats.length]}).eq("id",roomId);
    busy.current=false;
  }

  function canAct(){return room?.action_seat===myPp?.seat&&myPp?.status==="active"&&["preflop","flop","turn","river"].includes(room?.status);}

  async function fold(){if(!canAct()||busy.current)return;busy.current=true;await supabase.from("poker_players").update({status:"folded"}).eq("id",myPp.id);await adv();busy.current=false;}
  async function call(){
    if(!canAct()||busy.current)return;busy.current=true;
    const tc=Math.max(0,(room.current_bet||0)-(myPp.bet_this_round||0));
    const{data:pl}=await supabase.from("players").select("tokens").eq("id",user.id).single();
    const c=Math.min(tc,pl.tokens);
    await supabase.from("players").update({tokens:pl.tokens-c}).eq("id",user.id);
    await supabase.from("poker_players").update({bet_this_round:(myPp.bet_this_round||0)+c,total_bet:(myPp.total_bet||0)+c,status:pl.tokens-c<=0?"allin":"active"}).eq("id",myPp.id);
    await supabase.from("poker_rooms").update({pot:(room.pot||0)+c}).eq("id",roomId);
    await adv();busy.current=false;
  }
  async function check(){if(!canAct()||busy.current)return;busy.current=true;await adv();busy.current=false;}
  async function doRaise(){
    if(!canAct()||busy.current)return;const a=parseInt(raiseAmt)||0;if(a<BIG_BLIND)return;busy.current=true;
    const tc=Math.max(0,(room.current_bet||0)-(myPp.bet_this_round||0));
    const{data:pl}=await supabase.from("players").select("tokens").eq("id",user.id).single();
    const tot=Math.min(tc+a,pl.tokens);
    await supabase.from("players").update({tokens:pl.tokens-tot}).eq("id",user.id);
    await supabase.from("poker_players").update({bet_this_round:(myPp.bet_this_round||0)+tot,total_bet:(myPp.total_bet||0)+tot,status:"active"}).eq("id",myPp.id);
    await supabase.from("poker_rooms").update({pot:(room.pot||0)+tot,current_bet:(myPp.bet_this_round||0)+tot}).eq("id",roomId);
    setRaiseAmt("");await adv(true);busy.current=false;
  }

  async function adv(isRaise=false){
    const{data:fr}=await supabase.from("poker_rooms").select("*").eq("id",roomId).single();
    const{data:fp}=await supabase.from("poker_players").select("*").eq("room_id",roomId);
    if(!fr||!fp)return;
    const active=fp.filter(p=>p.status==="active"||p.status==="allin");
    const stillIn=fp.filter(p=>p.status!=="folded");
    if(stillIn.length===1){await showdown(fr,fp);return;}
    const allOk=active.every(p=>p.bet_this_round===fr.current_bet||p.status==="allin");
    if(allOk&&!isRaise){await nextPhase(fr,fp);return;}
    const seats=active.map(p=>p.seat).sort((a,b)=>a-b);
    const ci=seats.indexOf(fr.action_seat);
    await supabase.from("poker_rooms").update({action_seat:seats[(ci+1)%seats.length]}).eq("id",roomId);
  }

  async function nextPhase(fr,fp){
    await supabase.from("poker_players").update({bet_this_round:0}).eq("room_id",roomId);
    const active=fp.filter(p=>p.status==="active"||p.status==="allin");
    const first=active.map(p=>p.seat).sort((a,b)=>a-b)[0];
    const deck=[...(fr.deck||[])],comm=[...(fr.community_cards||[])];let ns="";
    if(fr.status==="preflop"){comm.push(deck.pop(),deck.pop(),deck.pop());ns="flop";}
    else if(fr.status==="flop"){comm.push(deck.pop());ns="turn";}
    else if(fr.status==="turn"){comm.push(deck.pop());ns="river";}
    else{await showdown(fr,fp);return;}
    await supabase.from("poker_rooms").update({status:ns,deck,community_cards:comm,current_bet:0,action_seat:first}).eq("id",roomId);
  }

  async function showdown(fr,fp){
    const comm=fr.community_cards||[],stillIn=fp.filter(p=>p.status!=="folded");
    const evl=stillIn.map(p=>{const h=evaluateHand([...(p.hole_cards||[]),...comm]);return{p,h};}).sort((a,b)=>b.h.score-a.h.score);
    const top=evl[0].h.score,ws=evl.filter(e=>e.h.score===top),share=Math.floor((fr.pot||0)/ws.length);
    const wi=[];
    for(const{p,h}of ws){const{data:pl}=await supabase.from("players").select("tokens").eq("id",p.player_id).single();if(pl){const nt=pl.tokens+share;await supabase.from("players").update({tokens:nt}).eq("id",p.player_id);await logTransaction(p.player_id,"game",share,"Poker: "+h.name,nt);}wi.push({player_id:p.player_id,username:p.players?.username,hand:h.name,amount:share});}
    for(const{p,h}of evl){if(!ws.find(w=>w.p.id===p.id)){const{data:pl}=await supabase.from("players").select("tokens").eq("id",p.player_id).single();if(pl)await logTransaction(p.player_id,"game",-p.total_bet,"Poker: "+h.name+" (perdu)",pl.tokens);}}
    await supabase.from("poker_rooms").update({status:"showdown",winners:wi}).eq("id",roomId);
  }

  async function newGame(){
    await supabase.from("poker_players").update({hole_cards:[],bet_this_round:0,total_bet:0,status:"waiting",is_ready:false}).eq("room_id",roomId);
    await supabase.from("poker_rooms").update({status:"waiting",deck:freshDeck(),community_cards:[],pot:0,current_bet:0,winners:[]}).eq("id",roomId);
    setWinners([]);
  }
  async function leaveRoom(){await supabase.from("poker_players").delete().eq("room_id",roomId).eq("player_id",user.id);if(isHost)await supabase.from("poker_rooms").delete().eq("id",roomId);onLeave();}

  if(!room)return <div style={{color:"#555",textAlign:"center",marginTop:100,background:"#080812",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>Chargement…</div>;

  const rs=room.status,comm=room.community_cards||[],myHole=myPp?.hole_cards||[];
  const isMyTurn=canAct(),tc=Math.max(0,(room.current_bet||0)-(myPp?.bet_this_round||0));
  const allReady=pp.length>=2&&pp.every(p=>p.is_ready);
  const PHASE={waiting:"Attente",preflop:"Preflop",flop:"Flop",turn:"Turn",river:"River",showdown:"Showdown"};
  const total=pp.length,myIdx=pp.findIndex(p=>p.player_id===user.id);
  const ordered=[...pp.slice(myIdx),...pp.slice(0,myIdx)];
  const positions=getSeatPos(total);
  const myHandName=myHole.length===2&&comm.length>=3?evaluateHand([...myHole,...comm]).name:null;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#080812",color:"#fff",fontFamily:"'SF Pro Display',-apple-system,sans-serif"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px 4px",flexShrink:0}}>
        <div><div style={{color:"#e74c3c",fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>♠ Table #{room.code} — {PHASE[rs]}</div><div style={{color:"#ffd700",fontSize:16,fontWeight:800}}>🪙 {user.tokens.toLocaleString()}</div></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{textAlign:"right"}}><div style={{color:"#555",fontSize:9}}>POT</div><div style={{color:"#ffd700",fontWeight:800,fontSize:15}}>🪙{room.pot||0}</div></div>
          <button onClick={leaveRoom} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
        </div>
      </div>

      <div style={{flex:1,position:"relative",overflow:"hidden",minHeight:0}}>
        <div style={{position:"absolute",left:"7%",right:"7%",top:"4%",bottom:"4%",background:"radial-gradient(ellipse at 50% 50%,#1d7a30 0%,#0d4a1a 55%,#071808 100%)",borderRadius:"50%",border:"5px solid #0a3010",boxShadow:"inset 0 0 70px rgba(0,0,0,.65)"}}/>
        <div style={{position:"absolute",left:"4%",right:"4%",top:"1%",bottom:"1%",borderRadius:"50%",border:"9px solid #6b3810",pointerEvents:"none"}}/>

        <div style={{position:"absolute",left:"50%",top:"40%",transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:4}}>
            {[0,1,2,3,4].map(i=>(comm[i]?<PCard key={i} card={comm[i]} hidden={false} size="lg"/>:<div key={i} style={{width:58,height:82,borderRadius:7,border:"1.5px dashed rgba(255,255,255,.1)",background:"rgba(0,0,0,.12)"}}/>))}
          </div>
          {(room.pot||0)>0&&(
            <div style={{
              background:"rgba(0,0,0,.75)",borderRadius:20,
              padding:"5px 18px",
              border:"1.5px solid rgba(255,215,0,.35)",
              display:"flex",alignItems:"center",gap:6,
            }}>
              <span style={{color:"#aaa",fontSize:11,textTransform:"uppercase",letterSpacing:1}}>Pot</span>
              <span style={{color:"#ffd700",fontSize:22,fontWeight:900,lineHeight:1}}>{(room.pot||0).toLocaleString()}</span>
              <span style={{color:"#ffd700",fontSize:14}}>🪙</span>
            </div>
          )}
        </div>
        {myHandName&&rs!=="showdown"&&<div style={{position:"absolute",left:"50%",top:"56%",transform:"translateX(-50%)",background:"rgba(0,0,0,.7)",borderRadius:6,padding:"2px 12px",color:"#ffd700",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{myHandName}</div>}
        {rs==="showdown"&&winners.length>0&&<div style={{position:"absolute",left:"50%",top:"26%",transform:"translateX(-50%)",background:"rgba(0,0,0,.88)",borderRadius:10,padding:"5px 14px",color:"#ffd700",fontSize:12,fontWeight:800,whiteSpace:"nowrap",textAlign:"center",animation:"tableGlow 1s ease-in-out infinite"}}>🏆 {winners.map(w=>"@"+w.username).join(" & ")} — {winners[0]?.hand}</div>}

        {ordered.map((player,i)=>{
          const isMe=player.player_id===user.id;
          const isActive=room.action_seat===player.seat&&["preflop","flop","turn","river"].includes(rs);
          const holeCards=isMe?myHole:(player.hole_cards||[]);
          const showCards=rs==="showdown"&&player.status!=="folded";
          return(
            <Seat key={player.id}
              name={player.players?.username||"?"} icon="👤" tokens={player.players?.tokens||0}
              betThisRound={player.bet_this_round} status={player.status}
              holeCards={holeCards} isMe={isMe} isActive={isActive}
              isDealer={false} isSB={false} isBB={false}
              showCards={showCards} winner={!!winners.find(w=>w.player_id===player.player_id)}
              posStyle={{left:`${positions[i].x}%`,top:`${positions[i].y}%`}}
            />
          );
        })}
      </div>

      <div style={{padding:"8px 12px 14px",flexShrink:0}}>
        {rs==="waiting"&&(<div>
          {!myPp?.is_ready&&<button onClick={setReady} style={{width:"100%",padding:12,background:"linear-gradient(135deg,#ffd700,#ffaa00)",border:"none",borderRadius:12,fontSize:14,fontWeight:900,color:"#111",cursor:"pointer",marginBottom:8}}>✓ Je suis prêt</button>}
          {myPp?.is_ready&&!isHost&&<div style={{color:"#4caf50",textAlign:"center",fontSize:13,fontWeight:600,marginBottom:8}}>✓ En attente du créateur…</div>}
          {isHost&&<button onClick={startGame} disabled={!allReady} style={{width:"100%",padding:12,background:allReady?"linear-gradient(135deg,#27ae60,#1e8449)":"#1a2a1a",border:"none",borderRadius:12,fontSize:14,fontWeight:900,color:allReady?"#fff":"#2a4a2a",cursor:allReady?"pointer":"default"}}>▶ Lancer ({pp.filter(p=>p.is_ready).length}/{pp.length} prêts)</button>}
        </div>)}
        {["preflop","flop","turn","river"].includes(rs)&&isMyTurn&&myPp?.status==="active"&&(<div>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            <button onClick={fold} style={{flex:1,padding:"11px 0",borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#5c1010,#3a0808)",color:"#e74c3c",cursor:"pointer"}}>FOLD</button>
            {tc===0?<button onClick={check} style={{flex:2,padding:"11px 0",borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#1a5a9a,#0d3a6a)",color:"#fff",cursor:"pointer"}}>CHECK</button>
            :<button onClick={call} style={{flex:2,padding:"11px 0",borderRadius:11,fontSize:14,fontWeight:800,border:"none",background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",cursor:"pointer"}}>CALL {tc}🪙</button>}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input type="number" value={raiseAmt} onChange={e=>setRaiseAmt(e.target.value)} placeholder={"Raise min "+BIG_BLIND+"🪙"} style={{flex:1,background:"#0e0e1e",border:"1.5px solid #2a2a3e",borderRadius:10,padding:"10px 10px",color:"#ffd700",fontSize:13,fontWeight:700,outline:"none"}}/>
            <button onClick={doRaise} style={{padding:"10px 16px",background:"linear-gradient(135deg,#8e44ad,#6c3483)",border:"none",borderRadius:10,fontSize:13,fontWeight:800,color:"#fff",cursor:"pointer"}}>RAISE</button>
          </div>
        </div>)}
        {["preflop","flop","turn","river"].includes(rs)&&!isMyTurn&&myPp?.status!=="folded"&&<div style={{color:"#555",textAlign:"center",fontSize:12,padding:6}}>Attente de votre tour…</div>}
        {["preflop","flop","turn","river"].includes(rs)&&myPp?.status==="folded"&&<div style={{color:"#e74c3c",textAlign:"center",fontSize:12,padding:6}}>Vous avez passé</div>}
        {rs==="showdown"&&(<div style={{display:"flex",gap:8}}>
          {isHost&&<button onClick={newGame} style={{flex:1,padding:12,borderRadius:12,fontSize:14,fontWeight:800,border:"none",background:"linear-gradient(135deg,#ffd700,#ffaa00)",color:"#111",cursor:"pointer"}}>↺ Nouvelle main</button>}
          <button onClick={leaveRoom} style={{flex:1,padding:12,borderRadius:12,fontSize:14,fontWeight:800,border:"1px solid #333",background:"transparent",color:"#888",cursor:"pointer"}}>Quitter</button>
        </div>)}
      </div>
      <style>{"@keyframes tableGlow{0%,100%{opacity:1}50%{opacity:.82}}"}</style>
    </div>
  );
}
