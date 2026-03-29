import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { evaluateHand } from "./poker-eval.js";
import { AnimatedCard, freshDeck, logTransaction } from "./App.jsx";

const RED = new Set(["♥","♦"]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── POKER CARD (plus grande que blackjack) ────────────────────────────────────
function PokerCard({ card, hidden, small }) {
  const [flipped, setFlipped] = useState(false);
  const red = card && RED.has(card.suit);
  const w = small ? 38 : 52, h = small ? 54 : 74;

  useEffect(() => {
    if (!hidden) setTimeout(() => setFlipped(true), 80);
  }, [hidden]);

  return (
    <div style={{ width:w, height:h, flexShrink:0, perspective:600 }}>
      <div style={{
        width:"100%", height:"100%",
        position:"relative", transformStyle:"preserve-3d",
        transform: flipped ? "rotateY(0deg)" : "rotateY(180deg)",
        transition: "transform .4s cubic-bezier(.4,0,.2,1)",
      }}>
        {/* FRONT */}
        <div style={{
          position:"absolute", inset:0, backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
          background:"#fff", borderRadius:7, border:"1.5px solid #ddd",
          display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"2px 3px",
          boxShadow:"2px 3px 10px rgba(0,0,0,.5)",
        }}>
          <div style={{fontSize:small?10:12,fontWeight:700,color:red?"#c0392b":"#1a1a1a",lineHeight:1.1}}>
            {card?.rank}<br/>{card?.suit}
          </div>
          <div style={{fontSize:small?10:12,fontWeight:700,color:red?"#c0392b":"#1a1a1a",lineHeight:1.1,alignSelf:"flex-end",transform:"rotate(180deg)"}}>
            {card?.rank}<br/>{card?.suit}
          </div>
        </div>
        {/* BACK */}
        <div style={{
          position:"absolute", inset:0, backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
          transform:"rotateY(180deg)",
          background:"linear-gradient(135deg,#1a1a2e,#16213e)",
          borderRadius:7, border:"1.5px solid #3a3a5c",
          boxShadow:"2px 3px 10px rgba(0,0,0,.5)", overflow:"hidden",
        }}>
          <div style={{position:"absolute",inset:4,border:"1.5px solid rgba(255,215,0,.2)",borderRadius:4,
            backgroundImage:"repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,215,0,.04) 4px,rgba(255,215,0,.04) 8px)"}}/>
        </div>
      </div>
    </div>
  );
}


// ── BOT NAMES ─────────────────────────────────────────────────────────────────
const BOT_NAMES = ["Carlos","Yuki","Marco","Sofia","Luca","Ines","Theo"];
const BOT_STYLES = ["🤠","🧠","😎","🦊","🐻","🎩","🤖"];

// ── BOT AI ────────────────────────────────────────────────────────────────────
// Évalue la force de la main du bot (0-1)
function botHandStrength(holeCards, community) {
  const all = [...holeCards, ...community];
  if (all.length < 2) return 0.3;
  const eval_ = evaluateHand(all);
  // rank 0-9 → force 0-1
  if (community.length === 0) {
    // preflop: paire en main = fort, cartes hautes = moyen
    const vals = holeCards.map(c => { const v={A:14,K:13,Q:12,J:11}; return v[c.rank]||parseInt(c.rank)||0; });
    const isPair = vals[0]===vals[1];
    const highCard = Math.max(...vals);
    if (isPair) return 0.75 + (highCard/14)*0.25;
    if (highCard >= 13) return 0.55;
    if (highCard >= 11) return 0.45;
    return 0.25 + Math.random()*0.15;
  }
  return Math.min(1, eval_.rank/9 * 0.8 + Math.random()*0.2);
}

// Décision du bot: "fold"|"check"|"call"|"raise"
function botDecide(bot, room) {
  const strength = botHandStrength(bot.holeCards, room.community);
  const toCall = Math.max(0, room.currentBet - (bot.betThisRound||0));
  const pot = room.pot;
  const r = Math.random();

  // Bot agressif vs conservateur selon son "style" (basé sur seat)
  const aggression = 0.3 + (bot.seat % 3) * 0.2; // 0.3, 0.5, 0.7

  if (strength > 0.75) {
    // Main forte → raise souvent
    if (r < aggression) return "raise";
    return "call";
  } else if (strength > 0.5) {
    // Main correcte → call ou check
    if (toCall === 0) return r < 0.3 ? "raise" : "check";
    if (toCall < pot * 0.3) return "call";
    return r < 0.4 ? "fold" : "call";
  } else if (strength > 0.3) {
    // Main faible → check ou fold
    if (toCall === 0) return "check";
    if (toCall < 20) return r < 0.5 ? "call" : "fold";
    return "fold";
  } else {
    // Main très faible
    if (toCall === 0) return "check";
    return r < 0.2 ? "call" : "fold";
  }
}

// ── POKER SOLO VS BOTS ────────────────────────────────────────────────────────
export function PokerSoloBots({ user, botCount, onBack, onUpdateTokens }) {
  const BB = 10, SB = 5;

  function mkBots(existing) {
    if (existing) return existing.map((b,i)=>({...b,seat:i+1,betThisRound:0,totalBet:0,status:"active",holeCards:[]}));
    return Array.from({length:botCount},(_,i)=>({
      id:"b"+i, name:BOT_NAMES[i], icon:BOT_STYLES[i],
      tokens:1000, seat:i+1, holeCards:[], betThisRound:0, totalBet:0, status:"active",
    }));
  }

  function newHand(pTokens, existBots) {
    const dk = freshDeck();
    const bots = mkBots(existBots ? existBots.filter(b=>b.tokens>0) : null);
    // player = seat 0, bots = seat 1..n
    const allActive = [0,...bots.map(b=>b.seat)];
    // blinds: seat1=SB, seat2=BB
    bots.forEach((b,i)=>{
      b.holeCards=[dk.pop(),dk.pop()];
      if(i===0){b.betThisRound=SB;b.totalBet=SB;b.tokens-=SB;}
      if(i===1){b.betThisRound=BB;b.totalBet=BB;b.tokens-=BB;}
    });
    const pCards=[dk.pop(),dk.pop()];
    // first to act after BB = seat after BB
    const firstAct = bots[2]?.seat ?? 0;
    return {
      dk, community:[], pot:SB+BB, currentBet:BB,
      phase:"preflop", actionSeat:firstAct,
      pCards, pBet:0, pTotal:0, pStatus:"active",
      pTokens, bots, msg:"", winners:[], lastAct:"",
    };
  }

  const [G, setG] = useState(()=>newHand(user.tokens));
  const [rInput, setRInput] = useState("");
  const timerRef = useRef(null);

  const isMyTurn = G.actionSeat===0 && G.pStatus==="active" && ["preflop","flop","turn","river"].includes(G.phase);
  const toCall = Math.max(0,(G.currentBet||0)-(G.pBet||0));
  const canCheck = toCall===0;

  // ─── POSITIONS TABLE OVALE ───────────────────────────────────────────────────
  function pos(seat) {
    const seats = [0,...G.bots.map(b=>b.seat)];
    const idx = seats.indexOf(seat);
    const n = seats.length;
    const angle = (Math.PI/2) - (idx/n)*2*Math.PI;
    return { x: 50 + 43*Math.cos(angle), y: 50 - 37*Math.sin(angle) };
  }

  // ─── LOGIQUE AVANCEMENT ──────────────────────────────────────────────────────
  function cp(g){ return JSON.parse(JSON.stringify(g)); }

  function activeSeats(g){
    const s=[];
    if(g.pStatus==="active") s.push(0);
    g.bots.forEach(b=>{ if(b.status==="active") s.push(b.seat); });
    return s.sort((a,b)=>a-b);
  }
  function stillIn(g){
    const s=[];
    if(g.pStatus!=="folded") s.push(0);
    g.bots.forEach(b=>{ if(b.status!=="folded") s.push(b.seat); });
    return s;
  }
  function allEqual(g){
    const pOk = g.pStatus!=="active" || g.pBet===g.currentBet;
    const bOk = g.bots.every(b=>b.status!=="active"||b.betThisRound===g.currentBet);
    return pOk && bOk;
  }

  function advance(g, raised=false){
    if(stillIn(g).length<=1) return showdown(g);
    if(allEqual(g)&&!raised) return nextPhase(g);
    const seats=activeSeats(g);
    if(seats.length===0) return nextPhase(g);
    const ci=seats.indexOf(g.actionSeat);
    g.actionSeat=seats[(ci+1)%seats.length];
    return g;
  }

  function nextPhase(g){
    g.pBet=0; g.currentBet=0;
    g.bots.forEach(b=>b.betThisRound=0);
    const seats=activeSeats(g);
    g.actionSeat=seats[0]??0;
    if(g.phase==="preflop"){g.community=[g.dk.pop(),g.dk.pop(),g.dk.pop()];g.phase="flop";}
    else if(g.phase==="flop"){g.community.push(g.dk.pop());g.phase="turn";}
    else if(g.phase==="turn"){g.community.push(g.dk.pop());g.phase="river";}
    else return showdown(g);
    return g;
  }

  function showdown(g){
    g.phase="showdown";
    const res=[];
    if(g.pStatus!=="folded"){
      const h=evaluateHand([...g.pCards,...g.community]);
      res.push({seat:0,name:"Vous",score:h.score,hand:h.name,total:g.pTotal});
    }
    g.bots.filter(b=>b.status!=="folded").forEach(b=>{
      const h=evaluateHand([...b.holeCards,...g.community]);
      res.push({seat:b.seat,name:b.icon+b.name,score:h.score,hand:h.name,total:b.totalBet});
    });
    if(!res.length){g.msg="Tous ont foldé !";return g;}
    res.sort((a,b)=>b.score-a.score);
    const top=res[0].score;
    const winners=res.filter(r=>r.score===top);
    const share=Math.floor(g.pot/winners.length);
    winners.forEach(w=>{
      if(w.seat===0)g.pTokens+=share;
      else{const b=g.bots.find(x=>x.seat===w.seat);if(b)b.tokens+=share;}
    });
    g.winners=winners;
    g.msg=winners.map(w=>`${w.name} (${w.hand})`).join(" & ")+" gagne"+( winners.length>1?"nt":"")+` ${share}🪙 !`;
    return g;
  }

  // ─── BOT TRIGGER ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!["preflop","flop","turn","river"].includes(G.phase)) return;
    if(G.actionSeat===0) return;
    clearTimeout(timerRef.current);
    timerRef.current=setTimeout(()=>{
      setG(prev=>{
        if(prev.actionSeat===0||!["preflop","flop","turn","river"].includes(prev.phase)) return prev;
        const g=cp(prev);
        const bot=g.bots.find(b=>b.seat===g.actionSeat);
        if(!bot||bot.status!=="active") return advance(g,false);
        // IA
        const strength=botHandStrength(bot.holeCards,g.community);
        const tc=Math.max(0,g.currentBet-(bot.betThisRound||0));
        const r=Math.random();
        const agg=0.3+(bot.seat%3)*0.15;
        let decision="check";
        if(strength>0.75){ decision=r<agg?"raise":"call"; }
        else if(strength>0.5){ decision=tc===0?(r<0.25?"raise":"check"):(tc<g.pot*0.35?"call":(r<0.45?"fold":"call")); }
        else if(strength>0.3){ decision=tc===0?"check":(tc<BB*2?(r<0.5?"call":"fold"):"fold"); }
        else { decision=tc===0?"check":(r<0.15?"call":"fold"); }
        const actualTc=Math.min(tc,bot.tokens);
        if(decision==="fold"){ bot.status="folded"; g.lastAct=`${bot.icon} ${bot.name} fold`; }
        else if(decision==="call"){ bot.tokens-=actualTc;bot.betThisRound+=actualTc;bot.totalBet+=actualTc;g.pot+=actualTc; g.lastAct=`${bot.icon} ${bot.name} call ${actualTc}🪙`; }
        else if(decision==="check"){ g.lastAct=`${bot.icon} ${bot.name} check`; }
        else{
          const extra=Math.max(BB,Math.floor(g.pot*(0.3+r*0.5)));
          const tot=Math.min(actualTc+extra,bot.tokens);
          bot.tokens-=tot;bot.betThisRound+=tot;bot.totalBet+=tot;g.pot+=tot;
          g.currentBet=bot.betThisRound;
          g.lastAct=`${bot.icon} ${bot.name} raise ${tot}🪙`;
        }
        return advance(g,decision==="raise");
      });
    }, 500+Math.random()*600);
    return ()=>clearTimeout(timerRef.current);
  },[G.actionSeat,G.phase]);

  // ─── ACTIONS JOUEUR ──────────────────────────────────────────────────────────
  function act(action,raiseAmt=0){
    if(!isMyTurn) return;
    clearTimeout(timerRef.current);
    setG(prev=>{
      const g=cp(prev); g.lastAct="";
      if(action==="fold"){g.pStatus="folded";}
      else if(action==="call"){const c=Math.min(toCall,g.pTokens);g.pTokens-=c;g.pBet+=c;g.pTotal+=c;g.pot+=c;}
      else if(action==="check"){/* nothing */}
      else if(action==="raise"){const c=Math.min(toCall,g.pTokens);const tot=Math.min(c+raiseAmt,g.pTokens);g.pTokens-=tot;g.pBet+=tot;g.pTotal+=tot;g.pot+=tot;g.currentBet=g.pBet;}
      return advance(g,action==="raise");
    });
  }

  function handleNewHand(){
    clearTimeout(timerRef.current);
    onUpdateTokens(G.pTokens-user.tokens,"Poker vs Bots");
    setG(newHand(G.pTokens, G.bots.filter(b=>b.tokens>0)));
    setRInput("");
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  const PHASE={preflop:"Preflop",flop:"Flop",turn:"Turn",river:"River",showdown:"Showdown"};
  const myHandStr = G.pCards.length===2&&G.community.length>=3
    ? evaluateHand([...G.pCards,...G.community]).name : null;
  const allSeats=[0,...G.bots.map(b=>b.seat)];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:"#080812",padding:"0 0 10px"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px 4px"}}>
        <div>
          <div style={{color:"#e74c3c",fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>♠ Poker vs Bots — {PHASE[G.phase]||""}</div>
          <div style={{color:"#ffd700",fontSize:17,fontWeight:800}}>🪙 {G.pTokens.toLocaleString()}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{textAlign:"right"}}>
            <div style={{color:"#555",fontSize:9,textTransform:"uppercase"}}>POT</div>
            <div style={{color:"#ffd700",fontWeight:800,fontSize:16}}>{G.pot}🪙</div>
          </div>
          <button onClick={()=>{clearTimeout(timerRef.current);onUpdateTokens(G.pTokens-user.tokens,"Poker vs Bots");onBack();}}
            style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>✕</button>
        </div>
      </div>

      {/* TABLE OVALE */}
      <div style={{
        flex:1,position:"relative",margin:"4px 8px 6px",
        background:"radial-gradient(ellipse at 50% 50%,#1f6b1f 0%,#0f4010 55%,#072007 100%)",
        borderRadius:"45%",
        border:"8px solid #5a3000",
        boxShadow:"0 0 0 3px #8a5200,inset 0 0 70px rgba(0,0,0,.55),0 10px 40px rgba(0,0,0,.9)",
        overflow:"visible",minHeight:0,
      }}>
        {/* Brillance feutre */}
        <div style={{position:"absolute",inset:0,borderRadius:"45%",background:"radial-gradient(ellipse at 40% 35%,rgba(255,255,255,.06) 0%,transparent 60%)",pointerEvents:"none"}}/>

        {/* Cartes communes CENTRE */}
        <div style={{
          position:"absolute",top:"50%",left:"50%",
          transform:"translate(-50%,-55%)",
          display:"flex",flexDirection:"column",alignItems:"center",gap:5,zIndex:10,
        }}>
          {/* 5 cartes communes */}
          <div style={{display:"flex",gap:4}}>
            {[0,1,2,3,4].map(i=>{
              const c=G.community[i];
              const red=c&&RED.has(c.suit);
              return c ? (
                <div key={i} style={{width:40,height:56,borderRadius:6,background:"#fff",border:"1.5px solid #ddd",
                  display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"2px 3px",
                  boxShadow:"0 3px 12px rgba(0,0,0,.7)",flexShrink:0}}>
                  <div style={{fontSize:11,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1}}>{c.rank}<br/>{c.suit}</div>
                  <div style={{fontSize:11,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1,alignSelf:"flex-end",transform:"rotate(180deg)"}}>{c.rank}<br/>{c.suit}</div>
                </div>
              ) : (
                <div key={i} style={{width:40,height:56,borderRadius:6,border:"1.5px dashed rgba(255,255,255,.12)",background:"rgba(0,0,0,.18)",flexShrink:0}}/>
              );
            })}
          </div>
          {/* Pot + dernière action */}
          {G.lastAct&&G.phase!=="showdown"&&<div style={{color:"rgba(255,255,255,.55)",fontSize:10,textAlign:"center",maxWidth:160,lineHeight:1.3}}>{G.lastAct}</div>}
          {G.phase==="showdown"&&G.msg&&<div style={{color:"#ffd700",fontSize:11,fontWeight:800,textAlign:"center",maxWidth:160,lineHeight:1.4,textShadow:"0 0 12px rgba(255,215,0,.6)",animation:"pulse 1s ease-in-out infinite"}}>{G.msg}</div>}
          {/* Combo joueur */}
          {myHandStr&&G.phase!=="showdown"&&<div style={{color:"#ffd700",fontSize:10,fontWeight:700,opacity:.9}}>{myHandStr}</div>}
        </div>

        {/* JOUEURS autour */}
        {allSeats.map(seat=>{
          const p=pos(seat);
          const isMe=seat===0;
          const bot=isMe?null:G.bots.find(b=>b.seat===seat);
          const acting=G.actionSeat===seat&&["preflop","flop","turn","river"].includes(G.phase);
          const st=isMe?G.pStatus:bot?.status;
          const folded=st==="folded";
          const tkns=isMe?G.pTokens:bot?.tokens??0;
          const cards=isMe?G.pCards:bot?.holeCards??[];
          const bet=isMe?G.pBet:bot?.betThisRound??0;
          const winner=G.winners?.find(w=>w.seat===seat);
          const revealBot=G.phase==="showdown"&&!folded&&!isMe;
          return (
            <div key={seat} style={{
              position:"absolute",left:`${p.x}%`,top:`${p.y}%`,
              transform:"translate(-50%,-50%)",zIndex:acting?20:5,
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,
              opacity:folded?.3:1,transition:"opacity .3s",
            }}>
              {/* Avatar */}
              <div style={{
                width:38,height:38,borderRadius:"50%",
                background:isMe?"linear-gradient(135deg,#ffd700,#e67e00)":"linear-gradient(135deg,#2a2a3e,#1a1a2e)",
                border:`2.5px solid ${acting?"#ffd700":winner?"#ffd700":"#2a2a3e"}`,
                boxShadow:acting?"0 0 14px rgba(255,215,0,.9),0 0 4px rgba(255,215,0,.5)":winner?"0 0 8px rgba(255,215,0,.5)":"none",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:isMe?12:17,fontWeight:900,color:isMe?"#111":"#fff",
                transition:"box-shadow .3s,border-color .3s",
              }}>
                {isMe?"YOU":bot?.icon}
              </div>
              {/* Info */}
              <div style={{
                background:"rgba(0,0,0,.8)",borderRadius:6,padding:"2px 6px",
                border:`1px solid ${acting?"rgba(255,215,0,.5)":"rgba(255,255,255,.06)"}`,
                textAlign:"center",minWidth:52,
              }}>
                <div style={{color:isMe?"#ffd700":"#ccc",fontSize:9,fontWeight:700,whiteSpace:"nowrap"}}>
                  {isMe?"Vous":bot?.name}{winner?" 🏆":""}
                </div>
                <div style={{color:"#666",fontSize:8}}>🪙{tkns}</div>
                {bet>0&&<div style={{color:"rgba(255,215,0,.7)",fontSize:8}}>↑{bet}</div>}
              </div>
              {/* Cartes */}
              <div style={{display:"flex",gap:2}}>
                {isMe && cards.map((c,i)=>{
                  const red=RED.has(c.suit);
                  return(
                    <div key={i} style={{width:30,height:42,borderRadius:4,background:"#fff",border:"1px solid #ddd",
                      display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"1px 2px",
                      boxShadow:"0 2px 8px rgba(0,0,0,.7)",fontSize:9,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1}}>
                      <div>{c.rank}<br/>{c.suit}</div>
                      <div style={{alignSelf:"flex-end",transform:"rotate(180deg)"}}>{c.rank}<br/>{c.suit}</div>
                    </div>
                  );
                })}
                {!isMe&&!folded&&revealBot&&cards.map((c,i)=>{
                  const red=RED.has(c.suit);
                  return(
                    <div key={i} style={{width:26,height:36,borderRadius:4,background:"#fff",border:"1px solid #ddd",
                      display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"1px 2px",
                      boxShadow:"0 2px 6px rgba(0,0,0,.7)",fontSize:8,fontWeight:800,color:red?"#c0392b":"#111",lineHeight:1.1}}>
                      <div>{c.rank}<br/>{c.suit}</div>
                      <div style={{alignSelf:"flex-end",transform:"rotate(180deg)"}}>{c.rank}<br/>{c.suit}</div>
                    </div>
                  );
                })}
                {!isMe&&!folded&&!revealBot&&cards.length>0&&(
                  <>
                    <div style={{width:22,height:30,borderRadius:3,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1px solid #3a3a5c"}}/>
                    <div style={{width:22,height:30,borderRadius:3,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1px solid #3a3a5c"}}/>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Contrôles */}
      <div style={{padding:"0 12px"}}>
        {isMyTurn&&(
          <div>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <button onClick={()=>act("fold")} style={{flex:1,padding:11,borderRadius:10,fontSize:13,fontWeight:800,border:"none",background:"#2e1414",color:"#e74c3c",cursor:"pointer"}}>FOLD</button>
              {canCheck
                ?<button onClick={()=>act("check")} style={{flex:1,padding:11,borderRadius:10,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#2980b9,#1a6a9a)",color:"#fff",cursor:"pointer"}}>CHECK</button>
                :<button onClick={()=>act("call")} style={{flex:1,padding:11,borderRadius:10,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",cursor:"pointer"}}>CALL {toCall}🪙</button>
              }
            </div>
            <div style={{display:"flex",gap:6}}>
              <input type="number" value={rInput} onChange={e=>setRInput(e.target.value)}
                placeholder={`Raise min ${BB}…`}
                style={{flex:1,background:"#0e0e1e",border:"1.5px solid #2a2a3e",borderRadius:9,padding:"8px 10px",color:"#ffd700",fontSize:13,fontWeight:700,outline:"none"}}/>
              <button onClick={()=>{const a=parseInt(rInput)||0;if(a>=BB){act("raise",a);setRInput("");}}}
                style={{padding:"8px 14px",background:"linear-gradient(135deg,#8e44ad,#6c3483)",border:"none",borderRadius:9,fontSize:13,fontWeight:800,color:"#fff",cursor:"pointer"}}>RAISE</button>
            </div>
          </div>
        )}
        {!isMyTurn&&G.phase!=="showdown"&&(
          <div style={{color:"#555",textAlign:"center",fontSize:12,padding:6}}>
            {G.pStatus==="folded"?"Vous avez foldé — observez…":"⏳ Les bots jouent…"}
          </div>
        )}
        {G.phase==="showdown"&&(
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleNewHand} style={{flex:1,padding:12,borderRadius:11,fontSize:14,fontWeight:800,border:"none",background:"linear-gradient(135deg,#ffd700,#ffaa00)",color:"#111",cursor:"pointer"}}>↺ Main suivante</button>
            <button onClick={()=>{clearTimeout(timerRef.current);onUpdateTokens(G.pTokens-user.tokens,"Poker vs Bots");onBack();}}
              style={{padding:12,borderRadius:11,fontSize:13,fontWeight:800,border:"1px solid #333",background:"transparent",color:"#888",cursor:"pointer"}}>Quitter</button>
          </div>
        )}
      </div>
    </div>
  );
}


// ── POKER LOBBY ───────────────────────────────────────────────────────────────
export function PokerLobby({ user, onEnterRoom, onSoloBots, onBack }) {
  const [code,     setCode]     = useState("");
  const [creating, setCreating] = useState(false);
  const [joining,  setJoining]  = useState(false);
  const [error,    setError]    = useState("");
  const [botCount, setBotCount] = useState(3);
  const [showBotPicker, setShowBotPicker] = useState(false);

  async function createRoom() {
    setCreating(true); setError("");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let roomCode = "";
    for (let i=0;i<4;i++) roomCode += chars[Math.floor(Math.random()*chars.length)];

    const { data, error: err } = await supabase.from("poker_rooms").insert({
      code: roomCode, host_id: user.id, status:"waiting",
      deck: freshDeck(), community_cards: [], pot:0, current_bet:0,
    }).select().single();
    if (err) { setError("Erreur création"); setCreating(false); return; }

    await supabase.from("poker_players").insert({
      room_id:data.id, player_id:user.id, seat:0, status:"waiting", is_ready:false, hole_cards:[]
    });
    setCreating(false);
    onEnterRoom(data.id);
  }

  async function joinRoom() {
    if (!code.trim()) return;
    setJoining(true); setError("");
    const { data: room } = await supabase.from("poker_rooms").select("*").eq("code",code.trim().toUpperCase()).single();
    if (!room) { setError("Salle introuvable"); setJoining(false); return; }
    if (room.status !== "waiting") { setError("Partie déjà en cours"); setJoining(false); return; }
    const { data: pp } = await supabase.from("poker_players").select("seat,player_id").eq("room_id",room.id);
    if (pp && pp.length >= 6) { setError("Table complète"); setJoining(false); return; }
    const already = pp?.find(p=>p.player_id===user.id);
    if (!already) {
      await supabase.from("poker_players").insert({
        room_id:room.id, player_id:user.id, seat:pp?.length||0, status:"waiting", is_ready:false, hole_cards:[]
      });
    }
    setJoining(false);
    onEnterRoom(room.id);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 20px 20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0 20px"}}>
        <div>
          <div style={{color:"#e74c3c",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Poker</div>
          <div style={{color:"#fff",fontSize:22,fontWeight:900}}>Texas Hold'em</div>
        </div>
        <button onClick={onBack} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#666",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>← Retour</button>
      </div>

      <div style={{color:"#555",fontSize:12,textAlign:"center",marginBottom:20}}>🪙 {user.tokens.toLocaleString()} jetons</div>

      {/* Mode solo vs bots */}
      <div style={{background:"#0d1a0d",border:"1.5px solid #1a4a1a",borderRadius:14,padding:14,marginBottom:14}}>
        <div style={{color:"#4caf50",fontSize:12,fontWeight:700,marginBottom:10}}>🤖 Solo vs Bots</div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {[2,3,4,5,6].map(n=>(
            <button key={n} onClick={()=>setBotCount(n)} style={{
              flex:1,padding:"7px 0",borderRadius:8,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",
              background:botCount===n?"#4caf50":"#0a200a",
              color:botCount===n?"#111":"#4caf50",
            }}>{n}</button>
          ))}
        </div>
        <div style={{color:"#555",fontSize:10,textAlign:"center",marginBottom:8}}>{botCount} adversaire{botCount>1?"s":""} IA</div>
        <button onClick={()=>onSoloBots(botCount)} style={{
          width:"100%",padding:12,background:"linear-gradient(135deg,#27ae60,#1e8449)",
          border:"none",borderRadius:10,fontSize:14,fontWeight:900,color:"#fff",cursor:"pointer",
        }}>▶ Jouer vs {botCount} bot{botCount>1?"s":""}</button>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,margin:"0 0 14px"}}>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/>
        <div style={{color:"#333",fontSize:11}}>ou multijoueur</div>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/>
      </div>

      <button onClick={createRoom} disabled={creating} style={{
        width:"100%",padding:15,marginBottom:10,
        background:creating?"#1a1a2e":"linear-gradient(135deg,#e74c3c,#c0392b)",
        border:"none",borderRadius:14,fontSize:15,fontWeight:900,
        color:"#fff",cursor:creating?"default":"pointer",
        boxShadow:"0 5px 24px rgba(231,76,60,.4)",
      }}>{creating?"Création…":"♠ Créer une table"}</button>

      <div style={{display:"flex",alignItems:"center",gap:10,margin:"8px 0 16px"}}>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/>
        <div style={{color:"#333",fontSize:12}}>ou rejoindre</div>
        <div style={{flex:1,height:1,background:"#1a1a2e"}}/>
      </div>

      <div style={{display:"flex",gap:8}}>
        <input value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setError("");}}
          onKeyDown={e=>e.key==="Enter"&&joinRoom()}
          placeholder="Code ex: K7X2" maxLength={4}
          style={{flex:1,background:"#10101e",border:"1.5px solid #1a1a2e",borderRadius:12,padding:"13px 14px",color:"#fff",fontSize:16,fontWeight:700,letterSpacing:3,outline:"none",textAlign:"center"}}/>
        <button onClick={joinRoom} disabled={joining} style={{
          padding:"13px 18px",background:"#0d1a3a",border:"1.5px solid #1a3a6c",
          borderRadius:12,fontSize:15,fontWeight:800,color:"#5b8de8",cursor:"pointer",
        }}>{joining?"…":"Rejoindre"}</button>
      </div>
      {error && <div style={{color:"#e74c3c",fontSize:13,marginTop:10,textAlign:"center",fontWeight:600}}>⚠ {error}</div>}
    </div>
  );
}

// ── POKER ROOM ─────────────────────────────────────────────────────────────────
export function PokerRoom({ user, roomId, onLeave, onUpdateTokens }) {
  const [room,         setRoom]         = useState(null);
  const [pokerPlayers, setPokerPlayers] = useState([]);
  const [myPp,         setMyPp]         = useState(null);
  const [raiseAmount,  setRaiseAmount]  = useState("");
  const [msg,          setMsg]          = useState("");
  const [winners,      setWinners]      = useState([]);
  const busy = useRef(false);

  const isHost = room?.host_id === user.id;

  useEffect(() => {
    loadRoom(); loadPlayers();

    const sub = supabase.channel("poker-"+roomId)
      .on("postgres_changes",{event:"*",schema:"public",table:"poker_rooms",filter:`id=eq.${roomId}`}, p => {
        setRoom(p.new);
        if (p.new.winners?.length) setWinners(p.new.winners);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"poker_players",filter:`room_id=eq.${roomId}`}, p => {
        if (p.eventType==="DELETE") { setPokerPlayers(prev=>prev.filter(x=>x.id!==p.old.id)); return; }
        setPokerPlayers(prev => {
          const exists = prev.find(x=>x.id===p.new.id);
          const updated = exists ? prev.map(x=>x.id===p.new.id?p.new:x) : [...prev, p.new];
          return updated;
        });
        if (p.new.player_id===user.id) setMyPp(p.new);
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [roomId]);

  async function loadRoom() {
    const { data } = await supabase.from("poker_rooms").select("*").eq("id",roomId).single();
    if (data) { setRoom(data); if (data.winners?.length) setWinners(data.winners); }
  }
  async function loadPlayers() {
    const { data } = await supabase.from("poker_players").select("*,players(username,tokens)").eq("room_id",roomId).order("seat");
    if (data) { setPokerPlayers(data); const me=data.find(p=>p.player_id===user.id); if(me) setMyPp(me); }
  }

  async function setReady() {
    await supabase.from("poker_players").update({is_ready:true}).eq("id",myPp.id);
  }

  async function startGame() {
    if (!isHost || busy.current) return;
    busy.current = true;
    const activePlayers = pokerPlayers.filter(p=>p.is_ready);
    if (activePlayers.length < 2) { busy.current=false; return; }

    const deck = freshDeck();
    const dealerSeat = room.dealer_seat;
    const seats = activePlayers.map(p=>p.seat).sort((a,b)=>a-b);
    // small blind = siège suivant le dealer, big blind = suivant
    const sbIdx = (seats.indexOf(dealerSeat)+1) % seats.length;
    const bbIdx = (sbIdx+1) % seats.length;
    const actionIdx = (bbIdx+1) % seats.length;

    const SB = room.small_blind, BB = room.big_blind;

    // Distribuer 2 cartes à chaque joueur
    for (const pp of activePlayers) {
      const c1=deck.pop(), c2=deck.pop();
      const isSB = pp.seat===seats[sbIdx];
      const isBB = pp.seat===seats[bbIdx];
      const blindBet = isSB ? SB : isBB ? BB : 0;
      await supabase.from("poker_players").update({
        hole_cards:[c1,c2], status:"active",
        bet_this_round: blindBet, total_bet: blindBet,
        is_ready:true,
      }).eq("id",pp.id);
      if (blindBet>0) {
        const { data:pl } = await supabase.from("players").select("tokens").eq("id",pp.player_id).single();
        if (pl) await supabase.from("players").update({tokens:Math.max(0,pl.tokens-blindBet)}).eq("id",pp.player_id);
      }
    }

    await supabase.from("poker_rooms").update({
      status:"preflop", deck, community_cards:[],
      pot: SB+BB, current_bet: BB,
      action_seat: seats[actionIdx],
    }).eq("id",roomId);

    busy.current=false;
  }

  // ── Actions joueur ──
  async function fold() {
    if (!canAct() || busy.current) return;
    busy.current=true;
    await supabase.from("poker_players").update({status:"folded"}).eq("id",myPp.id);
    await advanceAction();
    busy.current=false;
  }

  async function call() {
    if (!canAct() || busy.current) return;
    busy.current=true;
    const toCall = (room.current_bet||0) - (myPp.bet_this_round||0);
    const { data:pl } = await supabase.from("players").select("tokens").eq("id",user.id).single();
    const actualCall = Math.min(toCall, pl.tokens);
    await supabase.from("players").update({tokens:pl.tokens-actualCall}).eq("id",user.id);
    await supabase.from("poker_players").update({
      bet_this_round:(myPp.bet_this_round||0)+actualCall,
      total_bet:(myPp.total_bet||0)+actualCall,
      status: pl.tokens-actualCall<=0 ? "allin":"active"
    }).eq("id",myPp.id);
    await supabase.from("poker_rooms").update({pot:(room.pot||0)+actualCall}).eq("id",roomId);
    await advanceAction();
    busy.current=false;
  }

  async function check() {
    if (!canAct() || busy.current) return;
    busy.current=true;
    await advanceAction();
    busy.current=false;
  }

  async function raise() {
    if (!canAct() || busy.current) return;
    const amount = parseInt(raiseAmount)||0;
    if (amount < room.big_blind) return;
    busy.current=true;
    const toCall = (room.current_bet||0)-(myPp.bet_this_round||0);
    const total = toCall+amount;
    const { data:pl } = await supabase.from("players").select("tokens").eq("id",user.id).single();
    const actual = Math.min(total, pl.tokens);
    await supabase.from("players").update({tokens:pl.tokens-actual}).eq("id",user.id);
    await supabase.from("poker_players").update({
      bet_this_round:(myPp.bet_this_round||0)+actual,
      total_bet:(myPp.total_bet||0)+actual,
      status:"active"
    }).eq("id",myPp.id);
    const newBet = (myPp.bet_this_round||0)+actual;
    await supabase.from("poker_rooms").update({pot:(room.pot||0)+actual, current_bet:newBet}).eq("id",roomId);
    setRaiseAmount("");
    await advanceAction(true);
    busy.current=false;
  }

  function canAct() {
    return room?.action_seat===myPp?.seat && myPp?.status==="active" &&
      ["preflop","flop","turn","river"].includes(room?.status);
  }

  async function advanceAction(isRaise=false) {
    const { data:freshRoom } = await supabase.from("poker_rooms").select("*").eq("id",roomId).single();
    const { data:freshPP } = await supabase.from("poker_players").select("*").eq("room_id",roomId);
    if (!freshRoom||!freshPP) return;

    const active = freshPP.filter(p=>p.status==="active"||p.status==="allin");
    const stillIn = freshPP.filter(p=>p.status!=="folded");

    // Un seul joueur restant → il gagne
    if (stillIn.length===1) { await showdown(freshRoom, freshPP); return; }

    // Tous égalisé ?
    const allCalled = active.every(p=>p.bet_this_round===freshRoom.current_bet||p.status==="allin");

    if (allCalled && !isRaise) {
      await nextPhase(freshRoom, freshPP);
      return;
    }

    // Prochain joueur actif
    const seats = active.map(p=>p.seat).sort((a,b)=>a-b);
    const curIdx = seats.indexOf(freshRoom.action_seat);
    const nextIdx = (curIdx+1)%seats.length;
    await supabase.from("poker_rooms").update({action_seat:seats[nextIdx]}).eq("id",roomId);
  }

  async function nextPhase(freshRoom, freshPP) {
    // Reset mises du tour
    await supabase.from("poker_players").update({bet_this_round:0}).eq("room_id",roomId);
    const active = freshPP.filter(p=>p.status==="active"||p.status==="allin");
    const firstSeat = active.map(p=>p.seat).sort((a,b)=>a-b)[0];

    const deck = [...(freshRoom.deck||[])];
    const community = [...(freshRoom.community_cards||[])];
    let nextStatus = "";

    if (freshRoom.status==="preflop") {
      community.push(deck.pop(),deck.pop(),deck.pop()); // flop
      nextStatus="flop";
    } else if (freshRoom.status==="flop") {
      community.push(deck.pop()); // turn
      nextStatus="turn";
    } else if (freshRoom.status==="turn") {
      community.push(deck.pop()); // river
      nextStatus="river";
    } else if (freshRoom.status==="river") {
      await showdown(freshRoom, freshPP); return;
    }

    await supabase.from("poker_rooms").update({
      status:nextStatus, deck, community_cards:community,
      current_bet:0, action_seat:firstSeat,
    }).eq("id",roomId);
  }

  async function showdown(freshRoom, freshPP) {
    const community = freshRoom.community_cards||[];
    const stillIn = freshPP.filter(p=>p.status!=="folded");

    // Évaluer chaque main
    const evaluated = stillIn.map(pp => {
      const allCards = [...(pp.hole_cards||[]),...community];
      const hand = evaluateHand(allCards);
      return { pp, hand };
    }).sort((a,b)=>b.hand.score-a.hand.score);

    const pot = freshRoom.pot||0;
    const winnerScore = evaluated[0].hand.score;
    const winners = evaluated.filter(e=>e.hand.score===winnerScore);
    const share = Math.floor(pot/winners.length);

    const winnerInfo = [];
    for (const { pp, hand } of winners) {
      const { data:pl } = await supabase.from("players").select("tokens").eq("id",pp.player_id).single();
      if (pl) {
        const newTokens = pl.tokens+share;
        await supabase.from("players").update({tokens:newTokens}).eq("id",pp.player_id);
        await logTransaction(pp.player_id,"game",share,`Poker: ${hand.name}`,newTokens);
      }
      winnerInfo.push({ player_id:pp.player_id, username:pp.players?.username, hand:hand.name, amount:share });
    }

    // Losers — log transaction négative
    for (const { pp, hand } of evaluated) {
      const isWinner = winners.find(w=>w.pp.id===pp.id);
      if (!isWinner) {
        const { data:pl } = await supabase.from("players").select("tokens").eq("id",pp.player_id).single();
        if (pl) await logTransaction(pp.player_id,"game",-pp.total_bet,`Poker: ${hand.name} (perdu)`,pl.tokens);
      }
    }

    await supabase.from("poker_rooms").update({status:"showdown", winners:winnerInfo}).eq("id",roomId);
  }

  async function newGame() {
    await supabase.from("poker_players").update({
      hole_cards:[], bet_this_round:0, total_bet:0, status:"waiting", is_ready:false
    }).eq("room_id",roomId);
    const nextDealer = (room.dealer_seat+1)%Math.max(pokerPlayers.length,1);
    await supabase.from("poker_rooms").update({
      status:"waiting", deck:freshDeck(), community_cards:[], pot:0,
      current_bet:0, dealer_seat:nextDealer, winners:[],
    }).eq("id",roomId);
    setWinners([]); setMsg("");
  }

  async function leaveRoom() {
    await supabase.from("poker_players").delete().eq("room_id",roomId).eq("player_id",user.id);
    if (isHost) await supabase.from("poker_rooms").delete().eq("id",roomId);
    onLeave();
  }

  if (!room) return <div style={{color:"#555",textAlign:"center",marginTop:100,fontSize:14}}>Chargement…</div>;

  const myIsHost = room.host_id===user.id;
  const roomStatus = room.status;
  const community = room.community_cards||[];
  const pot = room.pot||0;
  const myHole = myPp?.hole_cards||[];
  const myHandEval = myHole.length===2 && community.length>=3
    ? evaluateHand([...myHole,...community]) : null;
  const isMyTurn = canAct();
  const currentBet = room.current_bet||0;
  const myBet = myPp?.bet_this_round||0;
  const toCall = Math.max(0, currentBet-myBet);
  const canCheck = toCall===0;
  const allReady = pokerPlayers.length>=2 && pokerPlayers.every(p=>p.is_ready);

  const PHASE_LABEL = {waiting:"En attente",preflop:"Preflop",flop:"Flop",turn:"Turn",river:"River",showdown:"Showdown"};

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 12px 12px"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0 6px"}}>
        <div>
          <div style={{color:"#e74c3c",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>♠ Table #{room.code} — {PHASE_LABEL[roomStatus]||roomStatus}</div>
          <div style={{color:"#ffd700",fontSize:18,fontWeight:800}}>🪙 {user.tokens.toLocaleString()}</div>
        </div>
        <button onClick={leaveRoom} style={{background:"transparent",border:"1px solid #2a2a3e",color:"#555",borderRadius:8,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>Quitter</button>
      </div>

      {/* Table */}
      <div style={{
        flex:1,
        background:"radial-gradient(ellipse at 50% 40%,#1a4a1a 0%,#0d3010 60%,#061808 100%)",
        borderRadius:16,padding:"10px 10px 8px",
        border:"2px solid #2a6b2a",
        boxShadow:"inset 0 0 40px rgba(0,0,0,.6)",
        display:"flex",flexDirection:"column",justifyContent:"space-between",overflow:"hidden",
      }}>
        {/* Pot */}
        {pot>0 && (
          <div style={{textAlign:"center",marginBottom:6}}>
            <div style={{color:"#ffd700",fontSize:14,fontWeight:800}}>POT: 🪙 {pot}</div>
          </div>
        )}

        {/* Cartes communes */}
        <div style={{display:"flex",justifyContent:"center",gap:5,marginBottom:8,minHeight:54}}>
          {[0,1,2,3,4].map(i=>(
            community[i]
              ? <PokerCard key={i} card={community[i]} hidden={false}/>
              : <div key={i} style={{width:52,height:74,borderRadius:7,border:"1.5px dashed rgba(255,255,255,.08)",background:"rgba(0,0,0,.2)"}}/>
          ))}
        </div>

        {/* Combinaison du joueur */}
        {myHandEval && (
          <div style={{textAlign:"center",color:"#ffd700",fontSize:11,fontWeight:700,marginBottom:4,opacity:.9}}>
            {myHandEval.name}
          </div>
        )}

        {/* Winners */}
        {roomStatus==="showdown" && winners.length>0 && (
          <div style={{textAlign:"center",padding:"6px 0",animation:"pulse 1s ease-in-out infinite"}}>
            <div style={{fontSize:16,fontWeight:900,color:"#ffd700",textShadow:"0 0 20px rgba(255,215,0,.7)"}}>
              🏆 {winners.map(w=>`@${w.username}`).join(" & ")} gagne{winners.length>1?"nt":""} !
            </div>
            <div style={{color:"#aaa",fontSize:12,marginTop:2}}>
              {winners[0]?.hand} — +{winners[0]?.amount} 🪙
            </div>
          </div>
        )}

        {/* Joueurs */}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {pokerPlayers.map(pp=>{
            const isMe = pp.player_id===user.id;
            const isActing = room.action_seat===pp.seat && ["preflop","flop","turn","river"].includes(roomStatus);
            const isFolded = pp.status==="folded";
            const isDealer = pp.seat===room.dealer_seat;
            const cards = pp.hole_cards||[];
            return (
              <div key={pp.id} style={{
                padding:"5px 8px",borderRadius:8,
                background:isMe?"rgba(255,215,0,.06)":"rgba(0,0,0,.25)",
                border:`1px solid ${isActing?"#ffd700":isMe?"#2a2a1e":"#111"}`,
                opacity:isFolded?.5:1,transition:"opacity .3s",
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    {isDealer && <span style={{fontSize:9,background:"#ffd700",color:"#111",borderRadius:4,padding:"1px 4px",fontWeight:900}}>D</span>}
                    {isActing && <span style={{fontSize:9}}>▶</span>}
                    <span style={{color:isMe?"#ffd700":"#888",fontSize:11,fontWeight:700}}>
                      @{pp.players?.username||"?"}{isMe?" (moi)":""}
                    </span>
                    {isFolded && <span style={{color:"#e74c3c",fontSize:10}}>FOLD</span>}
                    {pp.status==="allin" && <span style={{color:"#8e44ad",fontSize:10,fontWeight:700}}>ALL-IN</span>}
                  </div>
                  <span style={{color:"#555",fontSize:10}}>
                    {pp.bet_this_round>0?`🪙${pp.bet_this_round}`:""}
                  </span>
                </div>
                <div style={{display:"flex",gap:4}}>
                  {isMe && cards.map((c,i)=><PokerCard key={i} card={c} hidden={false} small/>)}
                  {!isMe && cards.length>0 && cards.map((_,i)=>(
                    <div key={i} style={{width:38,height:54,borderRadius:5,background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1.5px solid #3a3a5c"}}/>
                  ))}
                  {cards.length===0 && roomStatus!=="waiting" && (
                    <div style={{color:"#333",fontSize:10}}>—</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contrôles */}
      <div style={{marginTop:10}}>
        {/* Attente */}
        {roomStatus==="waiting" && (
          <div>
            {!myPp?.is_ready && (
              <button onClick={setReady} style={{width:"100%",padding:13,background:"linear-gradient(135deg,#ffd700,#ffaa00)",border:"none",borderRadius:12,fontSize:15,fontWeight:900,color:"#111",cursor:"pointer",marginBottom:8}}>
                ✓ Je suis prêt
              </button>
            )}
            {myPp?.is_ready && !myIsHost && (
              <div style={{color:"#4caf50",textAlign:"center",fontSize:13,fontWeight:600,marginBottom:8}}>✓ Prêt — En attente du créateur…</div>
            )}
            {myIsHost && (
              <button onClick={startGame} disabled={!allReady} style={{
                width:"100%",padding:13,
                background:allReady?"linear-gradient(135deg,#27ae60,#1e8449)":"#1a2a1a",
                border:"none",borderRadius:12,fontSize:15,fontWeight:900,
                color:allReady?"#fff":"#2a4a2a",cursor:allReady?"pointer":"default",
                boxShadow:allReady?"0 4px 16px rgba(39,174,96,.4)":"none",
              }}>
                ▶ Lancer ({pokerPlayers.filter(p=>p.is_ready).length}/{pokerPlayers.length} prêts)
              </button>
            )}
          </div>
        )}

        {/* Actions en jeu */}
        {["preflop","flop","turn","river"].includes(roomStatus) && isMyTurn && myPp?.status==="active" && (
          <div>
            <div style={{display:"flex",gap:6,marginBottom:7}}>
              <button onClick={fold} style={{flex:1,padding:11,borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"#2e1414",color:"#e74c3c",cursor:"pointer"}}>
                FOLD
              </button>
              {canCheck
                ? <button onClick={check} style={{flex:1,padding:11,borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#2980b9,#1a6a9a)",color:"#fff",cursor:"pointer"}}>CHECK</button>
                : <button onClick={call} style={{flex:1,padding:11,borderRadius:11,fontSize:13,fontWeight:800,border:"none",background:"linear-gradient(135deg,#27ae60,#1e8449)",color:"#fff",cursor:"pointer"}}>CALL {toCall}🪙</button>
              }
            </div>
            <div style={{display:"flex",gap:6}}>
              <input type="number" value={raiseAmount} onChange={e=>setRaiseAmount(e.target.value)}
                placeholder={`Raise (min ${room.big_blind})`}
                style={{flex:1,background:"#0e0e1e",border:"1.5px solid #2a2a3e",borderRadius:10,padding:"9px 10px",color:"#ffd700",fontSize:14,fontWeight:700,outline:"none"}}/>
              <button onClick={raise} style={{padding:"9px 14px",background:"linear-gradient(135deg,#8e44ad,#6c3483)",border:"none",borderRadius:10,fontSize:13,fontWeight:800,color:"#fff",cursor:"pointer"}}>
                RAISE
              </button>
            </div>
          </div>
        )}
        {["preflop","flop","turn","river"].includes(roomStatus) && !isMyTurn && myPp?.status==="active" && (
          <div style={{color:"#555",textAlign:"center",fontSize:13,padding:8}}>En attente de votre tour…</div>
        )}
        {["preflop","flop","turn","river"].includes(roomStatus) && myPp?.status==="folded" && (
          <div style={{color:"#e74c3c",textAlign:"center",fontSize:13,padding:8,fontWeight:600}}>Vous avez passé (fold)</div>
        )}

        {/* Fin de partie */}
        {roomStatus==="showdown" && (
          <div style={{display:"flex",gap:8}}>
            {myIsHost && (
              <button onClick={newGame} style={{flex:1,padding:13,borderRadius:12,fontSize:14,fontWeight:800,border:"none",background:"linear-gradient(135deg,#ffd700,#ffaa00)",color:"#111",cursor:"pointer"}}>↺ Nouvelle main</button>
            )}
            <button onClick={leaveRoom} style={{flex:1,padding:13,borderRadius:12,fontSize:14,fontWeight:800,border:"1px solid #333",background:"transparent",color:"#888",cursor:"pointer"}}>Quitter</button>
          </div>
        )}
      </div>
    </div>
  );
}
