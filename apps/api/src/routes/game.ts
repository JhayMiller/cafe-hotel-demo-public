import {Router} from 'express';
import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {pool,inTransaction,HttpError,type DB} from '../lib/db.js';
import {needStaff} from '../lib/auth.js';
import {sha256} from '../lib/wompi.js';
import {assessParty,consumptionFromRows} from '../lib/game-capacity.js';
import {ENGINE_VERSION,TICK_MS,replayFlight} from '../lib/game-engine.js';
import {applyRecordBonus,earnedReward,earnsRecordBonus,FRIENDS_REWARDS,INDIVIDUAL_REWARDS,MAX_ACTIVE_REWARDS,MAX_DISCOUNT_COP,REWARD_EXPIRY_DAYS,type RewardDefinition} from '../lib/game-rewards.js';
import {gameAllowance} from '../lib/game-access.js';
import {sendRewardPin} from '../lib/notifications.js';
import {createRewardPin,hashRewardPin,maskPhone,REWARD_PIN_MAX_ATTEMPTS,REWARD_PIN_TTL_MINUTES,validRewardPin} from '../lib/reward-verification.js';

export const gameRouter=Router();
const uuid=z.uuid(),tokenSchema=z.string().regex(/^[a-f0-9]{64}$/),deviceSchema=z.string().min(24).max(100);
const secret=()=>process.env.JWT_SECRET!;
const sign=(purpose:string,id:string,nonce:string)=>createHmac('sha256',secret()).update(`${purpose}:${id}:${nonce}`).digest('hex');
const validSignature=(actual:string,expected:string)=>{const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);};
const deviceHash=(value:string)=>createHmac('sha256',secret()).update(`game-device:${value}`).digest('hex');
const rewardCode=()=>`PP-${randomBytes(5).toString('hex').toUpperCase()}`;
const normalizeTable=(value:string)=>value.trim().toUpperCase().replace(/\s+/g,' ');
const MAX_PLAYERS=20;

gameRouter.get('/game/reward-rules',(_req,res)=>{
  res.setHeader('Cache-Control','public, max-age=300');
  res.json({individual:INDIVIDUAL_REWARDS,friends:FRIENDS_REWARDS,friendsUsesAverage:true,
    recordBonusPercent:1,maxDiscountPercent:10,maxDiscountCop:MAX_DISCOUNT_COP,
    expiryDays:REWARD_EXPIRY_DAYS,maxActiveRewards:MAX_ACTIVE_REWARDS,stackable:false,scope:'next_unpaid_cafe_order'});
});

async function issueReward(c:DB,customerId:string,orderId:string,sessionId:string,reward:RewardDefinition){
  const active=await c.query(`SELECT id,COALESCE(discount_percent,10)::int AS rank
    FROM customer_rewards WHERE customer_id=$1 AND status='available' AND expires_at>now()
    ORDER BY COALESCE(discount_percent,10) DESC,created_at DESC FOR UPDATE`,[customerId]);
  if((active.rowCount??0)>=MAX_ACTIVE_REWARDS){
    const weakest=active.rows[active.rows.length-1]!;
    if(Number(weakest.rank)>reward.discountPercent)return{inserted:null,limitMessage:'Ya conservas tres premios activos de mayor valor; este resultado no reemplazó ninguno.'};
    await c.query(`UPDATE customer_rewards SET status='voided',void_reason='replaced_by_better_reward' WHERE id=$1`,[weakest.id]);
  }
  const inserted=await c.query(`INSERT INTO customer_rewards(customer_id,order_id,game_session_id,reward_key,scope,title,description,redemption_code,expires_at,discount_percent,max_discount_cop)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+$9*interval '1 day',$10,$11)
    RETURNING id,title,description,redemption_code AS "redemptionCode",expires_at AS "expiresAt",scope,status,discount_percent AS "discountPercent",max_discount_cop AS "maxDiscountCop"`,
    [customerId,orderId,sessionId,reward.key,reward.scope,reward.title,reward.description,rewardCode(),reward.days,reward.discountPercent,reward.maxDiscountCop]);
  return{inserted:inserted.rows[0],limitMessage:null};
}

async function paidCapacity(c:Pick<DB,'query'>,orderId:string,trackingHash:string){
  const access=await c.query(`SELECT o.customer_id,o.table_code,cst.payment_bypass
    FROM orders o JOIN customers cst ON cst.id=o.customer_id
    JOIN suborders s ON s.order_id=o.id AND s.area='cafe'
    WHERE o.id=$1 AND o.tracking_hash=$2 AND (s.payment_status='paid' OR cst.payment_bypass=true)
    LIMIT 1`,[orderId,trackingHash]);
  if(!access.rowCount)throw new HttpError(403,'El pedido debe estar pagado antes de jugar');
  const found=await c.query(`SELECT i.game_group_snapshot,
    SUM(i.quantity*i.game_units_snapshot)::int AS units
    FROM orders o JOIN suborders s ON s.order_id=o.id AND s.area='cafe'
    JOIN order_items i ON i.suborder_id=s.id
    WHERE o.id=$1 AND o.tracking_hash=$2 AND o.customer_id IS NOT NULL AND i.game_group_snapshot<>'none'
    GROUP BY i.game_group_snapshot`,[orderId,trackingHash]);
  const row=access.rows[0],counts=consumptionFromRows(found.rows),unrestricted=Boolean(row.payment_bypass);
  const assessment=unrestricted
    ? {allowed:true,confidence:'unrestricted' as const,totalUnits:Object.values(counts).reduce((sum,value)=>sum+value,0),supportedPlayers:MAX_PLAYERS,reason:'Perfil de pruebas sin límites de partidas.'}
    : assessParty(counts,1,MAX_PLAYERS);
  if(assessment.supportedPlayers<1)throw new HttpError(409,assessment.reason);
  return {customer_id:row.customer_id,table_code:row.table_code,counts,unrestricted,...assessment};
}

gameRouter.get('/game/eligibility',async(req,res)=>{
  const orderId=uuid.parse(req.query.orderId),trackingToken=tokenSchema.parse(req.query.trackingToken);
  const eligibility=await paidCapacity(pool as unknown as Pick<DB,'query'>,orderId,sha256(trackingToken));
  const sessions=await pool.query('SELECT COUNT(*)::int AS count,MAX(created_at) AS last_created_at FROM game_sessions WHERE order_id=$1',[orderId]);
  const profileResult=await pool.query(`SELECT c.name,right(c.phone_e164,4) AS "phoneEnding",
    COALESCE(stats.best_score,0)::int AS "bestScore",COALESCE(stats.games_played,0)::int AS "gamesPlayed"
    FROM customers c LEFT JOIN customer_game_stats stats ON stats.customer_id=c.id WHERE c.id=$1`,[eligibility.customer_id]);
  const allowance=gameAllowance(Number(sessions.rows[0]?.count??0),sessions.rows[0]?.last_created_at??null);
  res.setHeader('Cache-Control','no-store');
  res.json({maxPlayers:eligibility.supportedPlayers,totalUnits:eligibility.totalUnits,counts:eligibility.counts,
    hasTable:Boolean(eligibility.table_code),unrestricted:eligibility.unrestricted,
    gamesUsed:eligibility.unrestricted?0:allowance.gamesUsed,gamesRemaining:eligibility.unrestricted?null:allowance.gamesRemaining,
    nextAvailableAt:eligibility.unrestricted?null:allowance.nextAvailableAt,profile:profileResult.rows[0]});
});

gameRouter.post('/staff/table-visits/:id/close',needStaff('admin','cashier'),async(req,res)=>{
  const id=uuid.parse(req.params.id),row=await pool.query(`UPDATE table_visits SET status='closed',closed_by=$2,closed_at=now() WHERE id=$1 AND status='active' RETURNING id`,[id,req.identity!.id]);
  if(!row.rowCount)throw new HttpError(409,'La visita ya estaba cerrada');res.json({closed:true});
});

const startInput=z.object({orderId:uuid,trackingToken:tokenSchema,deviceId:deviceSchema,playerCount:z.number().int().min(1).max(MAX_PLAYERS)});
gameRouter.post('/game/sessions',async(req,res)=>{
  const input=startInput.parse(req.body),fingerprint=deviceHash(input.deviceId);
  const session=await inTransaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`game:${input.orderId}`]);
    const eligible=await paidCapacity(c,input.orderId,sha256(input.trackingToken));
    const assessment=eligible.unrestricted
      ? {allowed:true,confidence:'unrestricted' as const,reason:'Perfil de pruebas sin límites de partidas.'}
      : assessParty(eligible.counts,input.playerCount,MAX_PLAYERS);
    if(!assessment.allowed)throw new HttpError(422,assessment.reason);
    const mode=input.playerCount===1?'individual':'friends',key=eligible.unrestricted
      ? eligible.table_code?normalizeTable(eligible.table_code):`TEST-${input.orderId}`
      : eligible.table_code?normalizeTable(eligible.table_code):null;
    if(mode==='friends'&&!key&&!eligible.unrestricted)throw new HttpError(422,'El modo Amigos requiere un pedido asociado a una mesa');
    if(!eligible.unrestricted){
      const used=await c.query('SELECT COUNT(*)::int AS count,MAX(created_at) AS last_created_at FROM game_sessions WHERE order_id=$1',[input.orderId]);
      const allowance=gameAllowance(Number(used.rows[0]?.count??0),used.rows[0]?.last_created_at??null);
      if(!allowance.canStart)throw new HttpError(409,`Este pedido ya utilizó sus tres partidas. Se habilitará nuevamente a las ${allowance.nextAvailableAt}.`);
    }
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`game-table:${key??input.orderId}`]);
    let visitId:string|null=null;
    if(key&&!eligible.unrestricted){
      await c.query(`UPDATE table_visits SET status='closed',closed_at=now() WHERE table_key=$1 AND status='active' AND expires_at<=now()`,[key]);
      const active=await c.query(`SELECT id FROM table_visits WHERE table_key=$1 AND status='active' FOR UPDATE`,[key]);
      if(active.rowCount){
        visitId=active.rows[0].id;
      }else{
        const made=await c.query(`INSERT INTO table_visits(table_key,party_size,opened_by) VALUES($1,$2,NULL) RETURNING id`,[key,input.playerCount]);
        visitId=made.rows[0].id;
      }
    }
    const entitlement=await c.query(`INSERT INTO game_entitlements(order_id,customer_id,table_key,table_visit_id,mode,player_count,issued_by)
      VALUES($1,$2,$3,$4,$5,$6,NULL) RETURNING id`,[input.orderId,eligible.customer_id,key,visitId,mode,input.playerCount]);
    const entitlementId=entitlement.rows[0].id;
    const made=await c.query(`INSERT INTO game_sessions(order_id,customer_id,device_hash,mode,player_count,entitlement_id,table_key) VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING id,nonce,mode,player_count AS "playerCount",current_player AS "currentPlayer",expires_at AS "expiresAt"`,[input.orderId,eligible.customer_id,fingerprint,mode,input.playerCount,entitlementId,key]);
    await c.query(`UPDATE game_entitlements SET status='claimed',claimed_at=now() WHERE id=$1`,[entitlementId]);
    const count=await c.query('SELECT COUNT(*)::int AS count,MAX(created_at) AS last_created_at FROM game_sessions WHERE order_id=$1',[input.orderId]);
    const allowance=gameAllowance(Number(count.rows[0]?.count??0),count.rows[0]?.last_created_at??null);
    return {...made.rows[0],unrestricted:eligible.unrestricted,
      gamesUsed:eligible.unrestricted?0:allowance.gamesUsed,gamesRemaining:eligible.unrestricted?null:allowance.gamesRemaining,
      nextAvailableAt:eligible.unrestricted?null:allowance.nextAvailableAt};
  });
  const eligibility=await paidCapacity(pool as unknown as Pick<DB,'query'>,input.orderId,sha256(input.trackingToken));
  const assessment=eligibility.unrestricted
    ? {confidence:'unrestricted' as const,reason:'Perfil de pruebas sin límites de partidas.'}
    : assessParty(eligibility.counts,input.playerCount,MAX_PLAYERS);
  const practice=await pool.query('SELECT practice_completed_at,games_played FROM customer_game_stats WHERE customer_id=$1',[eligibility.customer_id]);
  res.status(201).json({...session,confidence:assessment.confidence,validationMessage:assessment.reason,
    needsPractice:!practice.rows[0]?.practice_completed_at&&Number(practice.rows[0]?.games_played??0)===0,
    sessionToken:sign('game-session',session.id,session.nonce)});
});

const sessionAccess=z.object({sessionId:uuid,sessionToken:tokenSchema});
gameRouter.post('/game/attempts',async(req,res)=>{
  const input=sessionAccess.parse(req.body);
  const attempt=await inTransaction(async c=>{
    const s=await c.query(`SELECT id,nonce,current_player,player_count,status,expires_at FROM game_sessions WHERE id=$1 FOR UPDATE`,[input.sessionId]),session=s.rows[0];
    if(!session||!validSignature(input.sessionToken,sign('game-session',session.id,session.nonce)))throw new HttpError(403,'Sesión de juego inválida');
    if(session.status!=='active'||new Date(session.expires_at)<=new Date())throw new HttpError(409,'La sesión de juego terminó o venció');
    const existing=await c.query("SELECT id,status,engine_version FROM game_attempts WHERE session_id=$1 AND player_number=$2 AND status IN ('active','completed')",[session.id,session.current_player]);
    if(existing.rowCount){
      const prior=existing.rows[0];
      if(prior.status==='active'&&Number(prior.engine_version)!==ENGINE_VERSION)await c.query("UPDATE game_attempts SET status='invalid',verification_status='failed',completed_at=now() WHERE id=$1",[prior.id]);
      else throw new HttpError(409,'Este jugador ya inició su intento');
    }
    const made=await c.query(`INSERT INTO game_attempts(session_id,player_number,engine_version,verification_status) VALUES($1,$2,$3,'pending')
      RETURNING id,nonce,seed,player_number AS "playerNumber",started_at AS "startedAt",engine_version AS "engineVersion"`,[session.id,session.current_player,ENGINE_VERSION]);return made.rows[0];
  });
  res.status(201).json({...attempt,attemptToken:sign('game-attempt',attempt.id,attempt.nonce)});
});

gameRouter.post('/game/practice/complete',async(req,res)=>{
  const input=sessionAccess.parse(req.body);
  await inTransaction(async c=>{
    const found=await c.query('SELECT id,nonce,customer_id,status,expires_at FROM game_sessions WHERE id=$1 FOR UPDATE',[input.sessionId]);
    const session=found.rows[0];
    if(!session||!validSignature(input.sessionToken,sign('game-session',session.id,session.nonce)))throw new HttpError(403,'Sesión de práctica inválida');
    if(session.status!=='active'||new Date(session.expires_at)<=new Date())throw new HttpError(409,'La sesión terminó antes de guardar la práctica');
    await c.query(`INSERT INTO customer_game_stats(customer_id,practice_completed_at)
      VALUES($1,now()) ON CONFLICT(customer_id) DO UPDATE
      SET practice_completed_at=COALESCE(customer_game_stats.practice_completed_at,now()),updated_at=now()`,[session.customer_id]);
  });
  res.json({completed:true});
});

const finishInput=z.object({attemptToken:tokenSchema,engineVersion:z.literal(ENGINE_VERSION),terminalTick:z.number().int().min(1).max(36000),
  flapTicks:z.array(z.number().int().min(1).max(36000)).max(3000),clientScore:z.number().int().min(0).max(400),finishReason:z.enum(['obstacle','boundary'])});
gameRouter.post('/game/attempts/:id/finish',async(req,res)=>{
  const attemptId=uuid.parse(req.params.id),input=finishInput.parse(req.body);
  const result=await inTransaction(async c=>{
    const a=await c.query(`SELECT a.*,s.mode,s.player_count,s.customer_id,s.order_id,s.status session_status,s.entitlement_id FROM game_attempts a JOIN game_sessions s ON s.id=a.session_id WHERE a.id=$1 FOR UPDATE OF a,s`,[attemptId]),attempt=a.rows[0];
    if(!attempt||!validSignature(input.attemptToken,sign('game-attempt',attempt.id,attempt.nonce)))throw new HttpError(403,'Intento inválido');
    if(attempt.status==='completed'&&attempt.result_snapshot)return{kind:'confirmed' as const,result:attempt.result_snapshot};
    if(attempt.status!=='active'||attempt.session_status!=='active')throw new HttpError(409,'El intento ya terminó');
    if(Number(attempt.engine_version)!==input.engineVersion){
      await c.query("UPDATE game_attempts SET status='invalid',verification_status='failed',completed_at=now() WHERE id=$1",[attempt.id]);
      return{kind:'version_mismatch' as const};
    }
    const elapsed=Date.now()-new Date(attempt.started_at).getTime();
    const claimedDuration=input.terminalTick*TICK_MS;
    if(claimedDuration>elapsed+8000)throw new HttpError(422,'La duración del vuelo no coincide con el tiempo real. El intento quedó pendiente y no consumió la partida.');
    if(input.flapTicks.some((value:number,index:number)=>value>input.terminalTick||(index>0&&value<=input.flapTicks[index-1]!)))throw new HttpError(422,'Los impulsos no forman una secuencia válida. El intento quedó pendiente y no consumió la partida.');
    const verified=replayFlight(attempt.seed,input.flapTicks,input.terminalTick);
    const exact=verified.finished&&verified.terminalTick===input.terminalTick&&verified.score===input.clientScore&&verified.finishReason===input.finishReason;
    if(!exact){
      await c.query(`INSERT INTO game_security_events(order_id,game_session_id,game_attempt_id,event_type,details) VALUES($1,$2,$3,'exact_replay_mismatch',$4)`,
        [attempt.order_id,attempt.session_id,attempt.id,JSON.stringify({engineVersion:input.engineVersion,client:{score:input.clientScore,terminalTick:input.terminalTick,finishReason:input.finishReason},server:verified})]);
      await c.query("UPDATE game_attempts SET status='invalid',verification_status='failed',completed_at=now(),terminal_tick=$2,client_score=$3,flap_count=$4,flap_ticks=$5 WHERE id=$1",
        [attempt.id,input.terminalTick,input.clientScore,input.flapTicks.length,JSON.stringify(input.flapTicks)]);
      return{kind:'mismatch' as const};
    }
    const score=verified.score;await c.query(`UPDATE game_attempts SET status='completed',score=$2,duration_ms=$3,flap_count=$4,completed_at=now(),
      terminal_tick=$5,client_score=$2,flap_ticks=$6,verification_status='confirmed' WHERE id=$1`,
      [attempt.id,score,verified.durationMs,input.flapTicks.length,input.terminalTick,JSON.stringify(input.flapTicks)]);
    const aggregate=await c.query(`SELECT COALESCE(SUM(score),0)::int total,COALESCE(MAX(score),0)::int best,COUNT(*)::int played FROM game_attempts WHERE session_id=$1 AND status='completed'`,[attempt.session_id]);
    const {total,best,played}=aggregate.rows[0],complete=played>=attempt.player_count;
    await c.query(`UPDATE game_sessions SET total_score=$2,best_score=$3,current_player=LEAST(player_count,$4),status=CASE WHEN $5 THEN 'completed' ELSE status END,completed_at=CASE WHEN $5 THEN now() ELSE NULL END WHERE id=$1`,[attempt.session_id,total,best,played+1,complete]);
    let rewards:any[]=[];let recordBroken=false;let rewardLimitMessage:string|null=null;let personalBestScore:number|null=null;
    if(complete){
      const previous=await c.query('SELECT best_score FROM customer_game_stats WHERE customer_id=$1 FOR UPDATE',[attempt.customer_id]),oldBest=previous.rows[0]?.best_score??0;
      recordBroken=attempt.mode==='individual'&&oldBest>=10&&score>oldBest;
      personalBestScore=Math.max(Number(oldBest),Number(best));
      await c.query(`INSERT INTO customer_game_stats(customer_id,best_score,last_individual_play_at,games_played) VALUES($1,$2,CASE WHEN $3='individual' THEN now() ELSE NULL END,1) ON CONFLICT(customer_id) DO UPDATE SET best_score=GREATEST(customer_game_stats.best_score,EXCLUDED.best_score),last_individual_play_at=CASE WHEN $3='individual' THEN now() ELSE customer_game_stats.last_individual_play_at END,games_played=customer_game_stats.games_played+1,updated_at=now()`,[attempt.customer_id,best,attempt.mode]);
      const main=applyRecordBonus(earnedReward(attempt.mode,total,attempt.player_count),attempt.mode==='individual'&&earnsRecordBonus(oldBest,score));
      if(main){const issued=await issueReward(c,attempt.customer_id,attempt.order_id,attempt.session_id,main);if(issued.inserted)rewards.push(issued.inserted);rewardLimitMessage=issued.limitMessage;}
      await c.query(`UPDATE game_entitlements SET status='completed',completed_at=now() WHERE id=$1`,[attempt.entitlement_id]);
    }
    const response={score,totalScore:total,bestScore:best,personalBestScore,recordBroken,complete,nextPlayer:complete?null:played+1,rewards,rewardLimitMessage,
      verificationStatus:'confirmed' as const,verificationMessage:'El teléfono y el servidor coincidieron exactamente. Puntaje guardado con evidencia auditable.'};
    await c.query('UPDATE game_attempts SET result_snapshot=$2 WHERE id=$1',[attempt.id,JSON.stringify(response)]);
    return{kind:'confirmed' as const,result:response};
  });
  if(result.kind==='version_mismatch')throw new HttpError(409,'La versión del juego cambió. No consumimos la partida; actualiza la página y repite el intento.');
  if(result.kind==='mismatch')throw new HttpError(409,'El teléfono y el servidor no coincidieron. No guardamos un puntaje distinto, no consumimos la partida y puedes repetir el intento.');
  res.json(result.result);
});

gameRouter.get('/game/rewards',async(req,res)=>{const orderId=uuid.parse(req.query.orderId),trackingToken=tokenSchema.parse(req.query.trackingToken);const order=await pool.query('SELECT customer_id FROM orders WHERE id=$1 AND tracking_hash=$2',[orderId,sha256(trackingToken)]);if(!order.rowCount)throw new HttpError(404,'Pedido no encontrado');const rewards=await pool.query(`SELECT id,title,description,scope,redemption_code AS "redemptionCode",status,expires_at AS "expiresAt",discount_percent AS "discountPercent",max_discount_cop AS "maxDiscountCop" FROM customer_rewards WHERE customer_id=$1 AND status='available' AND expires_at>now() ORDER BY discount_percent DESC,created_at DESC`,[order.rows[0].customer_id]);res.json(rewards.rows);});
gameRouter.get('/admin/rewards',needStaff('admin','cashier'),async(_req,res)=>{const rows=await pool.query(`SELECT r.id,r.title,r.scope,r.redemption_code AS "redemptionCode",r.status,r.expires_at AS "expiresAt",
  r.redeemed_at AS "redeemedAt",r.discount_percent AS "discountPercent",r.max_discount_cop AS "maxDiscountCop",
  c.name,c.phone_e164 AS phone,challenge.id AS "receiptId",staff.display_name AS "redeemedByName",COALESCE(eligible.orders,'[]'::jsonb) AS "eligibleOrders"
  FROM customer_rewards r JOIN customers c ON c.id=r.customer_id
  LEFT JOIN LATERAL (SELECT id,verified_by FROM reward_redemption_challenges WHERE reward_id=r.id AND status='verified' ORDER BY verified_at DESC LIMIT 1) challenge ON true
  LEFT JOIN staff_users staff ON staff.id=challenge.verified_by
  LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('suborderId',s.id,'orderId',o.id,'reference',upper(left(o.id::text,8)),'totalCop',s.total_cop,'payableCop',s.total_cop-s.discount_cop) ORDER BY s.created_at DESC) orders
    FROM suborders s JOIN orders o ON o.id=s.order_id WHERE o.customer_id=r.customer_id AND s.area='cafe' AND s.status='pending_payment' AND s.payment_status='pending' AND s.payment_method='cash' AND s.reward_id IS NULL) eligible ON true
  WHERE (r.status='available' AND r.expires_at>now()) OR (r.status='redeemed' AND r.redeemed_at>now()-interval '30 days')
  ORDER BY CASE WHEN r.status='available' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 200`);res.json(rows.rows);});

gameRouter.post('/admin/rewards/:id/redemption-pin',needStaff('admin','cashier'),async(req,res)=>{
  const rewardId=uuid.parse(req.params.id),challengeId=randomUUID(),pin=createRewardPin();
  const {suborderId}=z.object({customerPresent:z.literal(true),suborderId:uuid}).parse(req.body);
  const challenge=await inTransaction(async c=>{
    const found=await c.query(`SELECT r.id,r.customer_id,r.status,r.expires_at,r.discount_percent,r.max_discount_cop,c.phone_e164
      FROM customer_rewards r JOIN customers c ON c.id=r.customer_id WHERE r.id=$1 FOR UPDATE OF r`,[rewardId]);
    const reward=found.rows[0];
    if(!reward||reward.status!=='available'||new Date(reward.expires_at)<=new Date())throw new HttpError(409,'El premio está vencido, usado o no está disponible');
    if(!reward.phone_e164)throw new HttpError(409,'La cuenta del cliente no tiene un teléfono válido');
    if(!reward.discount_percent||!reward.max_discount_cop)throw new HttpError(409,'Este beneficio no contiene una regla de descuento válida');
    const target=await c.query(`SELECT s.id,s.status,s.payment_status,s.payment_method,s.reward_id,o.customer_id
      FROM suborders s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 FOR UPDATE OF s`,[suborderId]);
    const order=target.rows[0];
    if(!order||order.customer_id!==reward.customer_id||order.status!=='pending_payment'||order.payment_status!=='pending'||order.payment_method!=='cash'||order.reward_id)
      throw new HttpError(409,'Elige un pedido de café pendiente y sin otro premio del mismo cliente');
    await c.query(`UPDATE reward_redemption_challenges SET status='expired' WHERE reward_id=$1 AND status='pending' AND expires_at<=now()`,[rewardId]);
    const active=await c.query(`SELECT expires_at FROM reward_redemption_challenges WHERE reward_id=$1 AND status='pending' LIMIT 1`,[rewardId]);
    if(active.rowCount)throw new HttpError(409,'Ya existe un PIN vigente para este premio. Pídeselo al cliente o espera a que venza.');
    const recent=await c.query(`SELECT COUNT(*)::int AS count FROM reward_redemption_challenges WHERE reward_id=$1 AND created_at>now()-interval '30 minutes'`,[rewardId]);
    if(Number(recent.rows[0]?.count??0)>=3)throw new HttpError(429,'Se alcanzó el límite de envíos. Intenta nuevamente en 30 minutos.');
    const made=await c.query(`INSERT INTO reward_redemption_challenges(id,reward_id,requested_by,customer_present_confirmed,code_hash,expires_at,target_suborder_id)
      VALUES($1,$2,$3,true,$4,now()+$5*interval '1 minute',$6) RETURNING expires_at AS "expiresAt"`,
      [challengeId,rewardId,req.identity!.id,hashRewardPin(challengeId,rewardId,pin),REWARD_PIN_TTL_MINUTES,suborderId]);
    return{phone:reward.phone_e164 as string,expiresAt:made.rows[0].expiresAt as string};
  });
  try{
    const providerMessageId=await sendRewardPin(challenge.phone,pin);
    await pool.query('UPDATE reward_redemption_challenges SET provider_message_id=$2 WHERE id=$1',[challengeId,providerMessageId]);
  }catch{
    await pool.query(`UPDATE reward_redemption_challenges SET status='failed' WHERE id=$1`,[challengeId]);
    throw new HttpError(503,'No se pudo enviar el PIN por WhatsApp. El premio continúa disponible y no fue marcado como usado.');
  }
  res.status(201).json({challengeId,maskedPhone:maskPhone(challenge.phone),expiresAt:challenge.expiresAt});
});

gameRouter.post('/admin/rewards/:id/redeem',needStaff('admin','cashier'),async(req,res)=>{
  const rewardId=uuid.parse(req.params.id),{pin}=z.object({pin:z.string().regex(/^\d{6}$/)}).parse(req.body);
  const result=await inTransaction(async c=>{
    const rewardResult=await c.query(`SELECT id,status,expires_at,discount_percent,max_discount_cop FROM customer_rewards WHERE id=$1 FOR UPDATE`,[rewardId]);
    const reward=rewardResult.rows[0];
    if(!reward||reward.status!=='available'||new Date(reward.expires_at)<=new Date())throw new HttpError(409,'El premio está vencido, usado o no está disponible');
    const challengeResult=await c.query(`SELECT id,code_hash,attempts,expires_at,target_suborder_id FROM reward_redemption_challenges
      WHERE reward_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[rewardId]);
    const challenge=challengeResult.rows[0];
    if(!challenge)throw new HttpError(409,'Solicita primero el PIN de confirmación por WhatsApp');
    if(new Date(challenge.expires_at)<=new Date()){
      await c.query(`UPDATE reward_redemption_challenges SET status='expired' WHERE id=$1`,[challenge.id]);
      return{kind:'expired' as const};
    }
    if(!validRewardPin(challenge.id,rewardId,pin,challenge.code_hash)){
      const attempts=Number(challenge.attempts)+1,expired=attempts>=REWARD_PIN_MAX_ATTEMPTS;
      await c.query(`UPDATE reward_redemption_challenges SET attempts=$2,status=CASE WHEN $3 THEN 'expired' ELSE status END WHERE id=$1`,[challenge.id,attempts,expired]);
      return{kind:'invalid' as const,remaining:Math.max(0,REWARD_PIN_MAX_ATTEMPTS-attempts)};
    }
    const target=await c.query(`SELECT id,total_cop,discount_cop,reward_id,status,payment_status,payment_method FROM suborders WHERE id=$1 FOR UPDATE`,[challenge.target_suborder_id]);
    const order=target.rows[0];
    if(!order||order.status!=='pending_payment'||order.payment_status!=='pending'||order.payment_method!=='cash'||order.reward_id)
      throw new HttpError(409,'El pedido seleccionado ya no está disponible para aplicar el premio');
    const discount=Math.min(Number(reward.max_discount_cop),Math.floor(Number(order.total_cop)*Number(reward.discount_percent)/100));
    if(discount<1)throw new HttpError(409,'El pedido no tiene un valor suficiente para aplicar este descuento');
    const updated=await c.query(`UPDATE suborders SET discount_cop=$2,reward_id=$3,updated_at=now() WHERE id=$1
      RETURNING total_cop-discount_cop AS "payableCop"`,[order.id,discount,rewardId]);
    const redeemed=await c.query(`UPDATE customer_rewards SET status='redeemed',redeemed_at=now(),redeemed_by=$2
      WHERE id=$1 RETURNING redeemed_at AS "redeemedAt"`,[rewardId,req.identity!.id]);
    await c.query(`UPDATE reward_redemption_challenges SET status='verified',verified_by=$2,verified_at=now() WHERE id=$1`,[challenge.id,req.identity!.id]);
    return{kind:'verified' as const,receiptId:challenge.id,redeemedAt:redeemed.rows[0].redeemedAt,discountCop:discount,payableCop:Number(updated.rows[0].payableCop)};
  });
  if(result.kind==='expired')throw new HttpError(410,'El PIN venció. Solicita uno nuevo; el premio continúa disponible.');
  if(result.kind==='invalid')throw new HttpError(422,`PIN incorrecto. Quedan ${result.remaining} intentos.`);
  res.json({redeemed:true,receiptId:result.receiptId,redeemedAt:result.redeemedAt,discountCop:result.discountCop,payableCop:result.payableCop});
});
