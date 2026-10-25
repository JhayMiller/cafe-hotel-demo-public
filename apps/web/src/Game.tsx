import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ENGINE_VERSION,TICK_MS,advanceFlight,createFlight,type FlightState} from '@cafe-hotel/game-core';

type Session={id:string,sessionToken:string,playerCount:number,currentPlayer:number,needsPractice:boolean,gamesUsed:number,gamesRemaining:number|null,nextAvailableAt:string|null,unrestricted?:boolean,confidence:'exact'|'high'|'supported'|'unrestricted',validationMessage:string};
type Attempt={id:string,attemptToken:string,playerNumber:number,seed:number,engineVersion:number};
type Reward={id:string,title:string,description:string,redemptionCode:string,scope:'customer'|'table',expiresAt:string,status:string,discountPercent?:number,maxDiscountCop?:number};
type Finish={score:number,totalScore:number,bestScore:number,personalBestScore:number|null,recordBroken:boolean,complete:boolean,nextPlayer:number|null,rewards:Reward[],verificationStatus:'confirmed',verificationMessage:string,rewardLimitMessage?:string|null};
type ConsumptionCounts={beverage:number,pastry:number,meal:number,packaged:number,other:number};
type CustomerGameProfile={name:string,phoneEnding:string,bestScore:number,gamesPlayed:number};
type Eligibility={maxPlayers:number,totalUnits:number,counts:ConsumptionCounts,hasTable:boolean,gamesUsed:number,gamesRemaining:number|null,nextAvailableAt:string|null,unrestricted?:boolean,profile:CustomerGameProfile};
type FlightAttempt={id:string,seed:number,engineVersion?:number};
type FinishPayload={attemptToken:string;engineVersion:number;terminalTick:number;flapTicks:number[];clientScore:number;finishReason:'obstacle'|'boundary'};
type PendingFinish={attemptId:string;orderId:string;payload:FinishPayload};
type RewardRules={individual:{points:number;percent:number}[];friends:{points:number;percent:number}[];recordBonusPercent:number;maxDiscountPercent:number;maxDiscountCop:number;expiryDays:number;maxActiveRewards:number};
const scenes=['Cordilleras del Quindío','Filandia','Valle de Cocora','Salento','Parque del Café','Paisaje cafetero'] as const;

async function request<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...(options?.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'No fue posible continuar');
  return body as T;
}
function deviceId(){let id=localStorage.getItem('pp-game-device');if(!id){id=crypto.randomUUID();localStorage.setItem('pp-game-device',id);}return id;}
const unlockLabel=(value:string|null)=>value?new Date(value).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'';

function ridge(ctx:CanvasRenderingContext2D,w:number,h:number,base:number,color:string,amp:number,step:number,offset=0){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,h);ctx.lineTo(0,base);
  for(let x=0;x<=w;x+=step)ctx.lineTo(x,base-Math.sin(x*.025+offset)*amp-Math.sin(x*.011+1.4+offset)*amp*.7);
  ctx.lineTo(w,h);ctx.closePath();ctx.fill();
}
function clouds(ctx:CanvasRenderingContext2D){
  ctx.fillStyle='#ffffff88';for(const [x,y,s] of [[40,90,1],[245,145,.7],[150,55,.55]] as number[][]){ctx.beginPath();ctx.ellipse(x!,y!,42*s!,18*s!,0,0,Math.PI*2);ctx.ellipse(x!+35*s!,y!+3*s!,35*s!,15*s!,0,0,Math.PI*2);ctx.fill();}
}
function drawScene(ctx:CanvasRenderingContext2D,w:number,h:number,index:number){
  const palette=[['#84c8da','#e8d8a5','#31533f'],['#79bfd0','#f1c27d','#47734f'],['#91d0df','#e9e0b9','#376646'],['#7ec3d7','#f2c585','#405f46'],['#86bfd2','#f5cf8c','#355642'],['#7abdd0','#e8ba72','#3c6548']][index]!;
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,palette[0]!);sky.addColorStop(.58,palette[1]!);sky.addColorStop(1,'#9bb36d');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);clouds(ctx);
  ridge(ctx,w,h,h*.54,index===2?'#78966e':'#6e8c70',44,12,index*.4);ridge(ctx,w,h,h*.68,index===5?'#527c55':'#4f765a',31,10,index*.25);ridge(ctx,w,h,h*.81,palette[2]!,21,8,index*.18);
  if(index===1){
    const colors=['#d9593f','#efb84f','#3c8f82','#c84c5d','#f4ddaa'];
    for(let i=0;i<5;i++){const x=i*76-8;ctx.fillStyle=colors[i]!;ctx.fillRect(x,h-108,68,74);ctx.fillStyle='#f7ead5';ctx.fillRect(x+12,h-79,15,45);ctx.fillRect(x+39,h-79,17,18);ctx.fillStyle='#793f32';ctx.beginPath();ctx.moveTo(x-4,h-108);ctx.lineTo(x+34,h-137);ctx.lineTo(x+72,h-108);ctx.fill();}
  }else if(index===2){
    ctx.strokeStyle='#3a6542';ctx.lineWidth=5;for(const x of [35,105,190,282,335]){ctx.beginPath();ctx.moveTo(x,h-34);ctx.quadraticCurveTo(x+9,h*.55,x-2,h*.25);ctx.stroke();ctx.fillStyle='#4f7c50';for(let r=0;r<8;r++){ctx.save();ctx.translate(x-2,h*.25);ctx.rotate(r*Math.PI/4);ctx.beginPath();ctx.ellipse(0,-21,5,27,0,0,Math.PI*2);ctx.fill();ctx.restore();}}
  }else if(index===3){
    const colors=['#e8a642','#4a9b8f','#d45a45','#f1d274'];for(let i=0;i<4;i++){const x=i*92-3;ctx.fillStyle=colors[i]!;ctx.fillRect(x,h-111,84,77);ctx.fillStyle='#fbefd9';ctx.fillRect(x+10,h-83,18,49);ctx.fillRect(x+48,h-84,22,20);ctx.fillStyle='#6e3d32';ctx.fillRect(x-3,h-118,90,10);}ctx.fillStyle='#f3ead8';ctx.fillRect(280,h-170,55,136);ctx.beginPath();ctx.moveTo(274,h-170);ctx.lineTo(307,h-215);ctx.lineTo(341,h-170);ctx.fill();ctx.fillStyle='#7c4337';ctx.fillRect(300,h-145,14,32);
  }else if(index===4){
    ctx.strokeStyle='#7b352f';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-15,h-85);ctx.bezierCurveTo(65,h-235,125,h-20,200,h-155);ctx.bezierCurveTo(250,h-230,300,h-30,385,h-150);ctx.stroke();ctx.strokeStyle='#ead8b9';ctx.lineWidth=3;for(let x=10;x<w;x+=24){ctx.beginPath();ctx.moveTo(x,h-35);ctx.lineTo(x,h-145+Math.sin(x*.04)*55);ctx.stroke();}
  }else if(index===5){
    ctx.fillStyle='#315f39';for(let x=8;x<w;x+=32){ctx.beginPath();ctx.arc(x,h-58-(x%3)*5,22,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c84436';ctx.beginPath();ctx.arc(x+4,h-61,3,0,Math.PI*2);ctx.arc(x-6,h-52,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#315f39';}
  }
  ctx.fillStyle='#d5a15b';ctx.fillRect(0,h-34,w,34);ctx.fillStyle='#674435';ctx.fillRect(0,h-34,w,7);
}
function drawPalm(ctx:CanvasRenderingContext2D,x:number,gapY:number,gap:number,w:number,h:number){
  const trunk=(top:number,height:number,flip=false)=>{ctx.fillStyle='#d8c6a5';ctx.strokeStyle='#725244';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(x,top,w,height,10);ctx.fill();ctx.stroke();ctx.strokeStyle='#a88462';ctx.lineWidth=2;for(let y=top+16;y<top+height;y+=18){ctx.beginPath();ctx.moveTo(x+3,y);ctx.lineTo(x+w-3,y);ctx.stroke();}const crownY=flip?top+height:top;ctx.fillStyle='#4d7553';for(let i=0;i<7;i++){ctx.save();ctx.translate(x+w/2,crownY);ctx.rotate((i-3)*.3+(flip?Math.PI:0));ctx.beginPath();ctx.ellipse(0,-20,8,34,0,0,Math.PI*2);ctx.fill();ctx.restore();}};
  const topH=gapY-gap/2,bottomY=gapY+gap/2;trunk(0,Math.max(10,topH),true);trunk(bottomY,Math.max(10,h-34-bottomY));
}
const condorSprites=[new Image(),new Image()];
condorSprites[0]!.src='/condor-game.png';
condorSprites[1]!.src='/condor-game-down.png';
function drawCondor(ctx:CanvasRenderingContext2D,x:number,y:number,wingFrame:0|1){
  const sprite=condorSprites[wingFrame];
  ctx.save();ctx.translate(x,y);
  if(sprite?.complete&&sprite.naturalWidth){
    if(wingFrame===0)ctx.drawImage(sprite,300,55,1010,880,-35,-50,78,68);
    else ctx.drawImage(sprite,220,160,1180,810,-36,-29,78,68);
  }else{
    ctx.fillStyle='#29262f';ctx.beginPath();ctx.ellipse(0,0,27,15,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f4ead8';ctx.beginPath();ctx.arc(16,-2,7,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function CondorCanvas({attempt,practice,onFinish}:{attempt:FlightAttempt,practice?:boolean,onFinish:(terminalTick:number,flapTicks:number[],score:number,finishReason:'obstacle'|'boundary')=>void}){
  const canvasRef=useRef<HTMLCanvasElement>(null),stageRef=useRef<HTMLDivElement>(null),finishRef=useRef(onFinish),sceneNameRef=useRef<(typeof scenes)[number]>(scenes[0]);
  const [shownScore,setShownScore]=useState(0),[started,setStarted]=useState(false),[countdown,setCountdown]=useState<number|'¡Vuela!'>(3),[sceneName,setSceneName]=useState<(typeof scenes)[number]>(scenes[0]);
  useEffect(()=>{finishRef.current=onFinish;},[onFinish]);
  useEffect(()=>{sceneNameRef.current=sceneName;},[sceneName]);
  useEffect(()=>{
    setShownScore(0);setStarted(false);setCountdown(3);setSceneName(scenes[0]);
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(canvas&&ctx){drawScene(ctx,canvas.width,canvas.height,0);drawCondor(ctx,82,285,0);}
    const scrollTimer=window.setTimeout(()=>stageRef.current?.scrollIntoView({behavior:'smooth',block:'center'}),30);
    const timers=[window.setTimeout(()=>setCountdown(2),1600),window.setTimeout(()=>setCountdown(1),2600),window.setTimeout(()=>setCountdown('¡Vuela!'),3600),window.setTimeout(()=>setStarted(true),4050)];
    return()=>{window.clearTimeout(scrollTimer);timers.forEach(window.clearTimeout);};
  },[attempt.id]);
  useEffect(()=>{
    if(!started)return;
    const canvas=canvasRef.current!,ctx=canvas.getContext('2d')!;let finished=false,frame=0,last=performance.now(),accumulator=0,flapPending=false,sceneFrom=0,sceneTo=0,sceneBlendTick=0;
    const flight:FlightState=createFlight(attempt.seed),flapTicks:number[]=[];
    const flap=()=>{if(!finished)flapPending=true;};
    const key=(event:KeyboardEvent)=>{if(event.code==='Space'||event.code==='ArrowUp'){event.preventDefault();flap();}};
    const stop=()=>{if(finished)return;finished=true;finishRef.current(flight.tick,flapTicks,flight.score,flight.finishReason??'boundary');};
    canvas.addEventListener('pointerdown',flap);window.addEventListener('keydown',key);
    const step=()=>{const applyFlap=flapPending;flapPending=false;if(applyFlap)flapTicks.push(flight.tick+1);const previousScore=flight.score;advanceFlight(flight,applyFlap);if(flight.score!==previousScore){setShownScore(flight.score);if(flight.score%5===0){sceneFrom=sceneTo;sceneTo=(sceneTo+1)%scenes.length;sceneBlendTick=flight.tick;const nextName=scenes[sceneTo]!;sceneNameRef.current=nextName;setSceneName(nextName);}}if(flight.finished)stop();};
    const loop=(now:number)=>{accumulator+=Math.min(50,now-last);last=now;while(accumulator>=TICK_MS&&!finished){step();accumulator-=TICK_MS;}drawScene(ctx,canvas.width,canvas.height,sceneFrom);if(sceneTo!==sceneFrom){const blend=Math.min(1,((flight.tick-sceneBlendTick)*TICK_MS)/1200);ctx.save();ctx.globalAlpha=blend;drawScene(ctx,canvas.width,canvas.height,sceneTo);ctx.restore();if(blend>=1)sceneFrom=sceneTo;}for(const palm of flight.obstacles)drawPalm(ctx,palm.x,palm.gapY,165,58,canvas.height);drawCondor(ctx,82,flight.y,(Math.floor(flight.tick/7)%2) as 0|1);ctx.fillStyle='#fff';ctx.font='700 34px system-ui';ctx.textAlign='center';ctx.shadowColor='#0008';ctx.shadowBlur=6;ctx.fillText(String(flight.score),canvas.width/2,55);ctx.font='700 13px system-ui';ctx.fillText(sceneNameRef.current,canvas.width/2,82);ctx.shadowBlur=0;if(!finished)frame=requestAnimationFrame(loop);};
    frame=requestAnimationFrame(loop);return()=>{cancelAnimationFrame(frame);canvas.removeEventListener('pointerdown',flap);window.removeEventListener('keydown',key);};
  },[attempt.id,attempt.seed,started]);
  return <div className={`game-stage${practice?' practice-stage':''}`} ref={stageRef}><canvas ref={canvasRef} width={360} height={640} aria-label={practice?'Práctica del Cóndor del Quindío':'Juego Cóndor del Quindío'}/>{!started&&<div className="game-countdown"><small>{practice?'PRÁCTICA':'INTENTO OFICIAL'}</small><strong>{countdown}</strong></div>}<div className="game-hint">{practice?'Práctica':'Toca para volar'} · {shownScore} puntos · {sceneName}</div></div>;
}

export function Game(){
  const params=new URLSearchParams(location.search),orderId=params.get('pedido')||'',trackingToken=params.get('token')||'';
  const pendingStorageKey=`pp-pending-game-result:${orderId}`;
  const [session,setSession]=useState<Session|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null),[finish,setFinish]=useState<Finish|null>(null),[practiceAttempt,setPracticeAttempt]=useState<FlightAttempt|null>(null),[practiceScore,setPracticeScore]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[rewards,setRewards]=useState<Reward[]>([]),[eligibility,setEligibility]=useState<Eligibility|null>(null),[loadingEligibility,setLoadingEligibility]=useState(true),[playerCount,setPlayerCount]=useState(1),[rules,setRules]=useState<RewardRules|null>(null),[pendingFinish,setPendingFinish]=useState<PendingFinish|null>(null);
  useEffect(()=>{if(orderId&&trackingToken)request<Reward[]>(`/game/rewards?orderId=${encodeURIComponent(orderId)}&trackingToken=${encodeURIComponent(trackingToken)}`).then(setRewards).catch(()=>undefined);},[]);
  useEffect(()=>{request<RewardRules>('/game/reward-rules').then(setRules).catch(()=>undefined);try{const saved=localStorage.getItem(pendingStorageKey);if(saved){const parsed=JSON.parse(saved) as PendingFinish;if(parsed.orderId===orderId)setPendingFinish(parsed);}}catch{localStorage.removeItem(pendingStorageKey);}},[orderId,pendingStorageKey]);
  useEffect(()=>{if(!orderId||!trackingToken){setLoadingEligibility(false);return;}request<Eligibility>(`/game/eligibility?orderId=${encodeURIComponent(orderId)}&trackingToken=${encodeURIComponent(trackingToken)}`).then(setEligibility).catch(error=>setError((error as Error).message)).finally(()=>setLoadingEligibility(false));},[]);
  async function createSession(){setBusy(true);setError('');try{const created=await request<Session>('/game/sessions',{method:'POST',body:JSON.stringify({orderId,trackingToken,deviceId:deviceId(),playerCount})});setSession(created);setEligibility(current=>current?{...current,gamesUsed:created.gamesUsed,gamesRemaining:created.gamesRemaining,nextAvailableAt:created.nextAvailableAt}:current);setFinish(null);setPracticeScore(null);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function begin(){if(!session||pendingFinish)return;setBusy(true);setError('');try{setAttempt(await request<Attempt>('/game/attempts',{method:'POST',body:JSON.stringify({sessionId:session.id,sessionToken:session.sessionToken})}));setFinish(null);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  function beginPractice(){if(!session)return;setError('');setPracticeScore(null);setPracticeAttempt({id:`practice-${session.id}-${Date.now()}`,seed:(Date.now()^0x51f15e)|0});}
  async function finishPractice(){if(!session)return;setBusy(true);setError('');try{await request('/game/practice/complete',{method:'POST',body:JSON.stringify({sessionId:session.id,sessionToken:session.sessionToken})});setSession({...session,needsPractice:false});setPracticeScore(null);await begin();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function submitFinish(pending:PendingFinish){setBusy(true);setError('');try{const result=await request<Finish>(`/game/attempts/${pending.attemptId}/finish`,{method:'POST',body:JSON.stringify(pending.payload)});localStorage.removeItem(pendingStorageKey);setPendingFinish(null);setFinish(result);setAttempt(null);if(result.complete&&result.personalBestScore!==null)setEligibility(current=>current?{...current,profile:{...current.profile,bestScore:result.personalBestScore!,gamesPlayed:current.profile.gamesPlayed+1}}:current);if(result.rewards.length)setRewards(current=>[...result.rewards,...current]);}catch(error){const message=(error as Error).message;if(message.includes('no coincidieron')||message.includes('versión del juego')){localStorage.removeItem(pendingStorageKey);setPendingFinish(null);}setError(`El resultado no se guardó ni consumió la partida: ${message}`);setAttempt(null);}finally{setBusy(false);}}
  async function end(terminalTick:number,flapTicks:number[],clientScore:number,finishReason:'obstacle'|'boundary'){if(!attempt)return;const pending:PendingFinish={attemptId:attempt.id,orderId,payload:{attemptToken:attempt.attemptToken,engineVersion:attempt.engineVersion??ENGINE_VERSION,terminalTick,flapTicks,clientScore,finishReason}};localStorage.setItem(pendingStorageKey,JSON.stringify(pending));setPendingFinish(pending);await submitFinish(pending);}
  if(!orderId||!trackingToken)return <main className="game-page"><section className="game-card"><span className="kicker">CÓNDOR DEL QUINDÍO</span><h1>El juego se activa desde un pedido.</h1><p>Abre el enlace “Jugar por beneficios” en el comprobante de un pedido pagado.</p><a className="button" href="/">Volver a la carta</a></section></main>;
  const mismatch=eligibility&&!eligibility.unrestricted&&playerCount>eligibility.maxPlayers;
  const noGamesLeft=Boolean(eligibility&&!eligibility.unrestricted&&eligibility.gamesRemaining===0);
  const waitingForPractice=session?.needsPractice&&!practiceAttempt&&practiceScore===null;
  const waitingForReal=session&&!session.needsPractice&&!attempt&&!finish&&!pendingFinish;
  return <main className="game-page"><section className="game-intro"><div><span className="kicker">POSADA DEL PUERTO PRESENTA</span><h1>El vuelo del cóndor</h1><p>Vuela por el Quindío y gana beneficios.</p></div></section>
    {!session&&eligibility&&<section className="customer-record" aria-label="Récord personal"><div><span>Hola, {eligibility.profile.name}</span><small>Cuenta terminada en {eligibility.profile.phoneEnding}</small></div><div><small>Tu récord</small><strong>{eligibility.profile.bestScore}</strong></div></section>}
    {!session&&rules&&<section className="game-card reward-ladder"><span className="kicker">PREMIOS</span><h2>Puntaje y descuento</h2><div className="reward-tables"><table><caption>Individual</caption><thead><tr><th>Puntos</th><th>Descuento</th></tr></thead><tbody>{rules.individual.map((tier,index)=><tr key={tier.points}><td>{tier.points}{index<rules.individual.length-1?`–${rules.individual[index+1]!.points-1}`:'+'}</td><td>{tier.percent}%</td></tr>)}</tbody></table><table><caption>Amigos · promedio</caption><thead><tr><th>Puntos</th><th>Mesa</th></tr></thead><tbody>{rules.friends.map((tier,index)=><tr key={tier.points}><td>{tier.points}{index<rules.friends.length-1?`–${rules.friends[index+1]!.points-1}`:'+'}</td><td>{tier.percent}%</td></tr>)}</tbody></table></div><p className="reward-terms">Bono de récord: +{rules.recordBonusPercent}%. Beneficios válidos por {rules.expiryDays} días, hasta {new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(rules.maxDiscountCop)}.</p></section>}
    {!session&&loadingEligibility&&<section className="game-card ready-card"><span className="kicker">VALIDANDO PEDIDO</span><h2>Calculando la partida…</h2></section>}
    {!session&&eligibility&&<section className="game-card ready-card"><span className="kicker">{eligibility.unrestricted?'PERFIL DE PRUEBAS':'PEDIDO PAGADO'}</span><h2>{noGamesLeft?'Vuelve pronto':'¿Cuántas personas jugarán?'}</h2>{!eligibility.unrestricted&&<p className={`game-allowance${noGamesLeft?' exhausted':''}`}><strong>{eligibility.gamesRemaining}</strong> partidas disponibles</p>}{noGamesLeft&&<p>Disponible nuevamente el <strong>{unlockLabel(eligibility.nextAvailableAt)}</strong>.</p>}{!noGamesLeft&&<><label className="player-picker">Jugadores<select value={playerCount} onChange={event=>{setPlayerCount(Number(event.target.value));setError('');}}>{Array.from({length:20},(_,index)=>index+1).map(number=><option key={number} value={number}>{number===1?'1 · Individual':`${number} · Amigos`}</option>)}</select></label>{mismatch&&<p className="game-error" role="alert">Este pedido permite hasta {eligibility.maxPlayers} jugadores.</p>}{playerCount>1&&!eligibility.hasTable&&!eligibility.unrestricted&&<p className="game-inline-note">Amigos requiere un pedido de mesa.</p>}<button disabled={busy||Boolean(mismatch)||(playerCount>1&&!eligibility.hasTable&&!eligibility.unrestricted)} onClick={createSession}>{busy?'Validando…':'Comenzar'}</button></>}</section>}
    {waitingForPractice&&<section className="game-card ready-card"><span className="kicker">PRIMERA VISITA</span><h2>Vuelo de práctica</h2><p>No cuenta para récord ni premios.</p><button onClick={beginPractice}>Practicar</button></section>}
    {practiceAttempt&&<CondorCanvas attempt={practiceAttempt} practice onFinish={(_duration,_flaps,score)=>{setPracticeScore(score);setPracticeAttempt(null);}}/>}
    {practiceScore!==null&&session?.needsPractice&&<section className="game-card result-card"><span className="kicker">PRÁCTICA COMPLETADA</span><div className="score-orb practice-orb">{practiceScore}</div><button disabled={busy} onClick={finishPractice}>{busy?'Preparando…':'Jugar ahora'}</button></section>}
    {waitingForReal&&<section className="game-card ready-card"><span className="kicker">{session.playerCount>1?`JUGADOR ${session.currentPlayer} DE ${session.playerCount}`:'INTENTO INDIVIDUAL'}</span><h2>¿Listo para despegar?</h2><button disabled={busy} onClick={begin}>{busy?'Preparando…':'Comenzar'}</button></section>}
    {attempt&&<CondorCanvas attempt={attempt} onFinish={(terminalTick,flapTicks,score,reason)=>void end(terminalTick,flapTicks,score,reason)}/>}
    {finish&&<section className="game-card result-card"><span className="kicker">RESULTADO CONFIRMADO</span><div className="score-orb">{finish.score}</div><h2>{finish.complete?'Vuelo completado':`Sigue el jugador ${finish.nextPlayer}`}</h2><p>{finish.complete?`Total: ${finish.totalScore} · Récord: ${finish.personalBestScore??finish.bestScore}`:'Pasa el dispositivo al siguiente jugador.'}</p><p className="verification-note confirmed">Puntaje guardado y verificado.</p>{finish.recordBroken&&<strong className="record">¡Nuevo récord personal!</strong>}{finish.rewards.map(reward=><article className="reward" key={reward.id}><span>{reward.scope==='table'?'PARA LA MESA':'PREMIO PERSONAL'}</span><h3>{reward.title}</h3><p>{reward.description}</p><code>{reward.redemptionCode}</code></article>)}{finish.rewardLimitMessage&&<p className="verification-note adjusted">{finish.rewardLimitMessage}</p>}{finish.complete&&!finish.rewards.length&&!finish.rewardLimitMessage&&<p>{finish.bestScore<10?'Los premios comienzan en 10 puntos.':'Sin premio adicional.'}</p>}{finish.complete&&(session?.unrestricted||(session?.gamesRemaining??0)>0)&&<button onClick={()=>{setSession(null);setFinish(null);setPlayerCount(1);}}>Jugar otra partida{session?.unrestricted?'':` · quedan ${session?.gamesRemaining}`}</button>}{finish.complete&&!session?.unrestricted&&session?.gamesRemaining===0&&<p className="game-allowance exhausted">Disponible nuevamente el <strong>{unlockLabel(session.nextAvailableAt)}</strong>.</p>}{!finish.complete&&<button onClick={()=>{setSession(current=>current?{...current,currentPlayer:finish.nextPlayer!}:current);setFinish(null);}}>Siguiente jugador</button>}</section>}
    {error&&<p className="game-error" role="alert">{error}</p>}
    {pendingFinish&&<section className="game-card ready-card"><span className="kicker">RESULTADO PENDIENTE</span><h2>Falta guardar tu vuelo</h2><button disabled={busy} onClick={()=>void submitFinish(pendingFinish)}>{busy?'Reenviando…':'Reintentar'}</button></section>}
    {rewards.length>0&&<section className="game-card"><span className="kicker">MIS BENEFICIOS</span><h2>Premios disponibles</h2>{rewards.map(reward=><div className="reward-line" key={reward.id}><div><strong>{reward.title}</strong><small>Vence {new Date(reward.expiresAt).toLocaleDateString('es-CO')}</small></div><code>{reward.redemptionCode}</code></div>)}</section>}<a className="game-back" href="/">← Volver a Posada del Puerto</a></main>;
}

type EligibleOrder={suborderId:string;orderId:string;reference:string;totalCop:string;payableCop:string};
export type RewardAdminRow=Reward&{name:string,phone:string,redeemedAt?:string|null,redeemedByName?:string|null,receiptId?:string|null,eligibleOrders:EligibleOrder[]};
export function RewardsAdmin(){
  const [rows,setRows]=useState<RewardAdminRow[]>([]),[message,setMessage]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null),[pin,setPin]=useState(''),[busy,setBusy]=useState(false),[selectedOrders,setSelectedOrders]=useState<Record<string,string>>({});
  const load=()=>request<RewardAdminRow[]>('/admin/rewards').then(setRows).catch(error=>setMessage(error.message));
  useEffect(()=>{void load();},[]);
  async function requestPin(reward:RewardAdminRow){const suborderId=selectedOrders[reward.id];if(!suborderId){setMessage('Selecciona primero el pedido pendiente al que se aplicará el premio.');return;}setBusy(true);setMessage('');try{const sent=await request<{maskedPhone:string,expiresAt:string}>(`/admin/rewards/${reward.id}/redemption-pin`,{method:'POST',body:JSON.stringify({customerPresent:true,suborderId})});setSelectedId(reward.id);setPin('');setMessage(`PIN enviado a ${sent.maskedPhone}. Vence a las ${new Date(sent.expiresAt).toLocaleTimeString('es-CO',{hour:'numeric',minute:'2-digit'})}.`);}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  async function redeem(event:FormEvent,id:string){event.preventDefault();setBusy(true);setMessage('');try{const receipt=await request<{receiptId:string,redeemedAt:string,discountCop:number,payableCop:number}>(`/admin/rewards/${id}/redeem`,{method:'POST',body:JSON.stringify({pin})});setMessage(`Descuento aplicado: ${new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(receipt.discountCop)}. Total a cobrar: ${new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(receipt.payableCop)}. Comprobante ${receipt.receiptId.slice(0,8).toUpperCase()}.`);setSelectedId(null);setPin('');await load();}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  const available=rows.filter(reward=>reward.status==='available'),redeemed=rows.filter(reward=>reward.status==='redeemed');
  return <section className="settings-card stack"><span className="kicker">BENEFICIOS DEL JUEGO</span><h2>Premios por entregar</h2><p className="reward-help">Selecciona un pedido de café pendiente del mismo cliente. Con el cliente presente, solicita el PIN; el descuento y el comprobante se guardan juntos.</p>{available.map(reward=><article className="reward-admin" key={reward.id}><div><strong>{reward.title}</strong><span>{reward.name} · {reward.phone}</span><small>{reward.scope==='table'?'Mesa completa':'Personal'} · vence {new Date(reward.expiresAt).toLocaleDateString('es-CO')}</small><label className="reward-order">Aplicar al pedido<select value={selectedOrders[reward.id]??''} disabled={selectedId===reward.id} onChange={event=>setSelectedOrders(current=>({...current,[reward.id]:event.target.value}))}><option value="">Seleccionar pedido pendiente</option>{reward.eligibleOrders.map(order=><option key={order.suborderId} value={order.suborderId}>#{order.reference} · {new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(order.payableCop))}</option>)}</select></label>{!reward.eligibleOrders.length&&<small>No hay pedidos de café pendientes para este cliente.</small>}</div><code>{reward.redemptionCode}</code>{selectedId!==reward.id?<button disabled={busy||!selectedOrders[reward.id]} onClick={()=>requestPin(reward)}>Cliente presente · enviar PIN</button>:<form className="reward-pin" onSubmit={event=>redeem(event,reward.id)}><label>PIN del cliente<input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,''))} placeholder="000000"/></label><button disabled={busy||pin.length!==6}>{busy?'Validando…':'Aplicar descuento'}</button><button type="button" className="text-button" onClick={()=>{setSelectedId(null);setPin('');}}>Cancelar</button></form>}</article>)}{!available.length&&<p>No hay premios pendientes.</p>}{message&&<p className="status" role="status">{message}</p>}{redeemed.length>0&&<div className="reward-history"><span className="kicker">COMPROBANTES RECIENTES</span><h3>Entregas confirmadas</h3>{redeemed.map(reward=><article key={reward.id}><div><strong>{reward.title}</strong><span>{reward.name} · {reward.redeemedByName??'Personal autorizado'}</span></div><small>{reward.redeemedAt?new Date(reward.redeemedAt).toLocaleString('es-CO'):''}</small><code>#{reward.receiptId?.slice(0,8).toUpperCase()}</code></article>)}</div>}</section>;
}
