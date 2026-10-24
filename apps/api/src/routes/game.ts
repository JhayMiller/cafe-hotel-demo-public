import {Router} from 'express';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {pool,inTransaction,HttpError} from '../lib/db.js';
import {needStaff} from '../lib/auth.js';
import {sha256} from '../lib/wompi.js';

export const gameRouter=Router();
const uuid=z.uuid();
const tokenSchema=z.string().regex(/^[a-f0-9]{64}$/);
const deviceSchema=z.string().min(24).max(100);
const secret=()=>process.env.JWT_SECRET!;
const sign=(purpose:string,id:string,nonce:string)=>createHmac('sha256',secret()).update(`${purpose}:${id}:${nonce}`).digest('hex');
const validSignature=(actual:string,expected:string)=>{
  const a=Buffer.from(actual),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
};
const deviceHash=(value:string)=>createHmac('sha256',secret()).update(`game-device:${value}`).digest('hex');
const rewardCode=()=>`PP-${randomBytes(5).toString('hex').toUpperCase()}`;

const startInput=z.object({
  orderId:uuid,trackingToken:tokenSchema,deviceId:deviceSchema,
  mode:z.enum(['individual','friends']),playerCount:z.number().int().min(1).max(6)
}).refine(v=>(v.mode==='individual'&&v.playerCount===1)||(v.mode==='friends'&&v.playerCount>=2),{message:'Cantidad de jugadores inválida'});

gameRouter.post('/game/sessions',async(req,res)=>{
  const input=startInput.parse(req.body),fingerprint=deviceHash(input.deviceId);
  const session=await inTransaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`game:${input.orderId}`]);
    const order=await c.query(`SELECT o.id,o.customer_id FROM orders o
      WHERE o.id=$1 AND o.tracking_hash=$2 AND o.customer_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM suborders s WHERE s.order_id=o.id AND s.area='cafe' AND s.payment_status='paid')`,
      [input.orderId,sha256(input.trackingToken)]);
    if(!order.rowCount) throw new HttpError(403,'El juego requiere un pedido pagado y un cliente registrado');
    const customerId=order.rows[0].customer_id as string;
    const used=await c.query(`SELECT id,nonce,mode,player_count AS "playerCount",current_player AS "currentPlayer",
      status,expires_at AS "expiresAt",device_hash FROM game_sessions WHERE order_id=$1`,[input.orderId]);
    if(used.rowCount){
      const previous=used.rows[0];
      if(previous.status==='active'&&previous.device_hash===fingerprint&&new Date(previous.expiresAt)>new Date()) return previous;
      throw new HttpError(409,'Este pedido ya habilitó una sesión de juego');
    }
    if(input.mode==='individual'){
      const recent=await c.query(`SELECT 1 FROM game_sessions WHERE mode='individual'
        AND (customer_id=$1 OR device_hash=$2) AND created_at>now()-interval '24 hours' LIMIT 1`,[customerId,fingerprint]);
      if(recent.rowCount) throw new HttpError(429,'El próximo intento individual estará disponible 24 horas después del anterior');
    }
    const made=await c.query(`INSERT INTO game_sessions(order_id,customer_id,device_hash,mode,player_count)
      VALUES($1,$2,$3,$4,$5) RETURNING id,nonce,mode,player_count AS "playerCount",current_player AS "currentPlayer",expires_at AS "expiresAt"`,
      [input.orderId,customerId,fingerprint,input.mode,input.playerCount]);
    return made.rows[0];
  });
  res.status(201).json({...session,sessionToken:sign('game-session',session.id,session.nonce)});
});

const sessionAccess=z.object({sessionId:uuid,sessionToken:tokenSchema});
gameRouter.post('/game/attempts',async(req,res)=>{
  const input=sessionAccess.parse(req.body);
  const attempt=await inTransaction(async c=>{
    const s=await c.query(`SELECT id,nonce,current_player,player_count,status,expires_at FROM game_sessions WHERE id=$1 FOR UPDATE`,[input.sessionId]);
    const session=s.rows[0];
    if(!session||!validSignature(input.sessionToken,sign('game-session',session.id,session.nonce))) throw new HttpError(403,'Sesión de juego inválida');
    if(session.status!=='active'||new Date(session.expires_at)<=new Date()) throw new HttpError(409,'La sesión de juego terminó o venció');
    const existing=await c.query('SELECT id,status FROM game_attempts WHERE session_id=$1 AND player_number=$2',[session.id,session.current_player]);
    if(existing.rowCount) throw new HttpError(409,'Este jugador ya inició su intento');
    const made=await c.query(`INSERT INTO game_attempts(session_id,player_number) VALUES($1,$2)
      RETURNING id,nonce,player_number AS "playerNumber",started_at AS "startedAt"`,[session.id,session.current_player]);
    return made.rows[0];
  });
  res.status(201).json({...attempt,attemptToken:sign('game-attempt',attempt.id,attempt.nonce)});
});

const finishInput=z.object({attemptToken:tokenSchema,score:z.number().int().min(0).max(250),durationMs:z.number().int().min(500).max(600000)});
type Reward={key:string,scope:'customer'|'table',title:string,description:string,days:number};
function earnedReward(mode:string,score:number,players:number):Reward|null{
  if(mode==='individual'){
    if(score>=35)return {key:'individual-coffee',scope:'customer',title:'Café de la casa gratis',description:'Válido en una visita futura. No canjeable por dinero.',days:30};
    if(score>=20)return {key:'individual-15',scope:'customer',title:'15% de descuento',description:'En una compra futura, máximo $15.000 COP. No acumulable.',days:30};
    if(score>=10)return {key:'individual-10',scope:'customer',title:'10% de descuento',description:'En una compra futura, máximo $10.000 COP. No acumulable.',days:21};
  }else{
    const average=Math.floor(score/players);
    if(average>=20)return {key:'friends-10',scope:'table',title:'10% para toda la mesa',description:'En una visita futura, máximo $20.000 COP. No acumulable.',days:21};
    if(average>=12)return {key:'friends-5',scope:'table',title:'5% para toda la mesa',description:'En una visita futura, máximo $10.000 COP. No acumulable.',days:21};
    if(average>=7)return {key:'friends-tasting',scope:'table',title:'Detalle para compartir',description:'Pregunta por el detalle disponible en una próxima visita.',days:14};
  }
  return null;
}

gameRouter.post('/game/attempts/:id/finish',async(req,res)=>{
  const attemptId=uuid.parse(req.params.id),input=finishInput.parse(req.body);
  const result=await inTransaction(async c=>{
    const a=await c.query(`SELECT a.*,s.mode,s.player_count,s.current_player,s.customer_id,s.order_id,s.status session_status
      FROM game_attempts a JOIN game_sessions s ON s.id=a.session_id WHERE a.id=$1 FOR UPDATE OF a,s`,[attemptId]);
    const attempt=a.rows[0];
    if(!attempt||!validSignature(input.attemptToken,sign('game-attempt',attempt.id,attempt.nonce))) throw new HttpError(403,'Intento inválido');
    if(attempt.status!=='active'||attempt.session_status!=='active') throw new HttpError(409,'El intento ya terminó');
    const elapsed=Date.now()-new Date(attempt.started_at).getTime();
    if(input.durationMs>elapsed+8000||input.score>Math.floor(input.durationMs/700)+3) throw new HttpError(422,'El puntaje no coincide con la duración del intento');
    await c.query(`UPDATE game_attempts SET status='completed',score=$2,duration_ms=$3,completed_at=now() WHERE id=$1`,[attempt.id,input.score,input.durationMs]);
    const aggregate=await c.query(`SELECT COALESCE(SUM(score),0)::int total,COALESCE(MAX(score),0)::int best,COUNT(*)::int played
      FROM game_attempts WHERE session_id=$1 AND status='completed'`,[attempt.session_id]);
    const {total,best,played}=aggregate.rows[0];
    const complete=played>=attempt.player_count;
    await c.query(`UPDATE game_sessions SET total_score=$2,best_score=$3,current_player=LEAST(player_count,$4),
      status=CASE WHEN $5 THEN 'completed' ELSE status END,completed_at=CASE WHEN $5 THEN now() ELSE NULL END WHERE id=$1`,
      [attempt.session_id,total,best,played+1,complete]);
    let rewards:any[]=[];let recordBroken=false;
    if(complete){
      const previous=await c.query('SELECT best_score FROM customer_game_stats WHERE customer_id=$1 FOR UPDATE',[attempt.customer_id]);
      const oldBest=previous.rows[0]?.best_score??0;
      recordBroken=attempt.mode==='individual'&&input.score>oldBest;
      await c.query(`INSERT INTO customer_game_stats(customer_id,best_score,last_individual_play_at,games_played)
        VALUES($1,$2,CASE WHEN $3='individual' THEN now() ELSE NULL END,1)
        ON CONFLICT(customer_id) DO UPDATE SET best_score=GREATEST(customer_game_stats.best_score,EXCLUDED.best_score),
        last_individual_play_at=CASE WHEN $3='individual' THEN now() ELSE customer_game_stats.last_individual_play_at END,
        games_played=customer_game_stats.games_played+1,updated_at=now()`,[attempt.customer_id,best,attempt.mode]);
      const definitions:Reward[]=[];const main=earnedReward(attempt.mode,total,attempt.player_count);if(main)definitions.push(main);
      if(recordBroken&&oldBest>0)definitions.push({key:'record-bonus',scope:'customer',title:'Bono por nuevo récord',description:'5% adicional en una compra futura, máximo $5.000 COP.',days:14});
      for(const reward of definitions){
        const inserted=await c.query(`INSERT INTO customer_rewards(customer_id,order_id,game_session_id,reward_key,scope,title,description,redemption_code,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+$9*interval '1 day')
          RETURNING id,title,description,redemption_code AS "redemptionCode",expires_at AS "expiresAt",scope,status`,
          [attempt.customer_id,attempt.order_id,attempt.session_id,reward.key,reward.scope,reward.title,reward.description,rewardCode(),reward.days]);
        rewards.push(inserted.rows[0]);
      }
    }
    return {score:input.score,totalScore:total,bestScore:best,recordBroken,complete,nextPlayer:complete?null:played+1,rewards};
  });
  res.json(result);
});

gameRouter.get('/game/rewards',async(req,res)=>{
  const orderId=uuid.parse(req.query.orderId),trackingToken=tokenSchema.parse(req.query.trackingToken);
  const order=await pool.query('SELECT customer_id FROM orders WHERE id=$1 AND tracking_hash=$2',[orderId,sha256(trackingToken)]);
  if(!order.rowCount) throw new HttpError(404,'Pedido no encontrado');
  const rewards=await pool.query(`SELECT id,title,description,scope,redemption_code AS "redemptionCode",status,expires_at AS "expiresAt"
    FROM customer_rewards WHERE customer_id=$1 AND status='available' AND expires_at>now() ORDER BY created_at DESC`,[order.rows[0].customer_id]);
  res.json(rewards.rows);
});

gameRouter.get('/admin/rewards',needStaff('admin','cashier'),async(_req,res)=>{
  const rows=await pool.query(`SELECT r.id,r.title,r.scope,r.redemption_code AS "redemptionCode",r.status,r.expires_at AS "expiresAt",
    c.name,c.phone_e164 AS phone FROM customer_rewards r JOIN customers c ON c.id=r.customer_id
    WHERE r.status='available' AND r.expires_at>now() ORDER BY r.created_at DESC LIMIT 200`);
  res.json(rows.rows);
});
gameRouter.post('/admin/rewards/:id/redeem',needStaff('admin','cashier'),async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const row=await pool.query(`UPDATE customer_rewards SET status='redeemed',redeemed_at=now(),redeemed_by=$2
    WHERE id=$1 AND status='available' AND expires_at>now() RETURNING id`,[id,req.identity!.id]);
  if(!row.rowCount) throw new HttpError(409,'Premio inválido, vencido o ya usado');
  res.json({redeemed:true});
});
