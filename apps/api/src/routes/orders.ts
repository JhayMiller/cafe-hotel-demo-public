import {Router} from 'express';
import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {cartInput} from '../lib/validators.js';
import {pool,inTransaction,HttpError} from '../lib/db.js';
import {sha256,checkoutDetails} from '../lib/wompi.js';
import {announce} from '../lib/events.js';
import {assessParty,consumptionFromRows} from '../lib/game-capacity.js';
export const ordersRouter=Router();

const safeNumber=(value:any):number=>{
  const n=Number(value);
  if (!Number.isSafeInteger(n)||n<0) throw new HttpError(422,'Valor monetario inválido');
  return n;
};
const trackingFor=(orderId:string,key:string)=>createHmac('sha256',process.env.JWT_SECRET!).update(`track:${orderId}:${key}`).digest('hex');

ordersRouter.post('/orders/checkout',async(req,res)=>{
  const cart=cartInput.parse(req.body);
  const role=req.identity?.role==='guest'?'guest':'standard';
  if (role==='standard'&&!cart.customer) throw new HttpError(422,'Nombre y teléfono obligatorios');
  if (role==='guest'&&(!req.identity?.stayId)) throw new HttpError(401,'Acceso de huésped vencido');
  const anchor=role==='guest'?req.identity!.stayId!:cart.customer!.phone;
  const requestHash=sha256(JSON.stringify({cart,role,anchor}));
  const response=await inTransaction(async c=>{
    // Bloqueo lógico de idempotencia para clics repetidos / doble envío.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[cart.idempotencyKey]);
    const exists=await c.query('SELECT id,request_hash FROM orders WHERE idempotency_key=$1',[cart.idempotencyKey]);
    if (exists.rowCount) {
      if (exists.rows[0].request_hash!==requestHash) throw new HttpError(409,'Clave de idempotencia reutilizada con otro pedido');
      return {orderId:exists.rows[0].id as string,reused:true,announcements:[] as any[]};
    }
    const ids=[...new Set(cart.items.map(item=>item.productId))];
    const products=await c.query(`SELECT id,name,area,visibility,price_cop,is_available,deleted_at,game_group,game_units
      FROM products WHERE id=ANY($1::uuid[]) FOR SHARE`,[ids]);
    if (products.rowCount!==ids.length) throw new HttpError(422,'Algún producto ya no existe');
    const byId=new Map<string,any>(products.rows.map(p=>[p.id,p]));
    const groups=await c.query(`SELECT pm.product_id,g.id group_id,g.min_selected,g.max_selected,
      o.id option_id,o.name option_name,o.price_delta_cop,o.type
      FROM product_modifier_groups pm JOIN modifier_groups g ON g.id=pm.group_id AND g.is_active=true
      LEFT JOIN modifier_options o ON o.group_id=g.id AND o.is_active=true
      WHERE pm.product_id=ANY($1::uuid[])`,[ids]);
    const prepared: Array<{area:'cafe'|'hotel',name:string,productId:string,quantity:number,unit:number,options:any[],note:string,line:number,
      gameGroup:'beverage'|'pastry'|'meal'|'packaged'|'other'|'none',gameUnits:number}> = [];
    let totalCafe=0,totalHotel=0;
    for (const item of cart.items) {
      const p=byId.get(item.productId);
      if (!p.is_available||p.deleted_at) throw new HttpError(422,`Producto agotado: ${p.name}`);
      if (role==='standard'&&p.visibility==='guest') throw new HttpError(403,'Producto exclusivo de huéspedes');
      const definitions=new Map<string,{min:number,max:number,options:Map<string,any>}>();
      for (const r of groups.rows.filter(g=>g.product_id===p.id)) {
        let def=definitions.get(r.group_id);
        if (!def) {def={min:r.min_selected,max:r.max_selected,options:new Map()};definitions.set(r.group_id,def);}
        if (r.option_id) def.options.set(r.option_id,r);
      }
      const chosen=new Set(item.optionIds);
      if (chosen.size!==item.optionIds.length) throw new HttpError(422,'No se puede repetir modificador');
      const options:any[]=[];
      for (const group of definitions.values()) {
        const selected=[...chosen].filter(id=>group.options.has(id));
        if (selected.length<group.min||selected.length>group.max) throw new HttpError(422,`Cantidad de opciones fuera del rango ${group.min}-${group.max}`);
        for (const id of selected) {
          const opt=group.options.get(id)!;
          if (opt.type!=='add'&&Number(opt.price_delta_cop)!==0) throw new HttpError(422,'Modificador inconsistente');
          options.push({id,name:opt.option_name,type:opt.type,priceDeltaCop:safeNumber(opt.price_delta_cop)});
          chosen.delete(id);
        }
      }
      if (chosen.size) throw new HttpError(422,'Modificador no autorizado para el producto');
      const unit=safeNumber(p.price_cop),line=(unit+options.reduce((s,o)=>s+o.priceDeltaCop,0))*item.quantity;
      if (!Number.isSafeInteger(line)) throw new HttpError(422,'Importe excedido');
      const area=p.area as 'cafe'|'hotel';
      if (area==='hotel') totalHotel+=line; else totalCafe+=line;
      prepared.push({area,name:p.name,productId:p.id,quantity:item.quantity,unit,options,note:item.note,line,
        gameGroup:area==='cafe'?p.game_group:'none',gameUnits:area==='cafe'?Number(p.game_units):0});
    }
    if (role==='standard'&&totalHotel) throw new HttpError(403,'El hotel requiere acceso de huésped');
    if (totalCafe>0 && cart.cafePayment==='online' && (!process.env.WOMPI_PUBLIC_KEY || !process.env.WOMPI_INTEGRITY_SECRET || !process.env.WOMPI_EVENTS_SECRET))
      throw new HttpError(503,'Pago en línea no configurado; selecciona efectivo en caja');
    if (totalHotel>0&&cart.hotelPayment!=='room_charge') throw new HttpError(422,'Este servicio requiere cargo a habitación');
    if (!Number.isSafeInteger(totalCafe+totalHotel)) throw new HttpError(422,'Importe inválido');
    let customerId:string|null=null;
    if (cart.customer) {
      const cust=await c.query(`INSERT INTO customers(name,phone_e164,whatsapp_opt_in)
        VALUES($1,$2,$3) ON CONFLICT(phone_e164) DO UPDATE SET name=EXCLUDED.name,
        whatsapp_opt_in=EXCLUDED.whatsapp_opt_in,updated_at=now() RETURNING id`,
        [cart.customer.name,cart.customer.phone,cart.customer.whatsappOptIn]);
      customerId=cust.rows[0].id;
    }
    const orderId=randomUUID();
    const token=trackingFor(orderId,cart.idempotencyKey);
    await c.query(`INSERT INTO orders(id,actor_role,customer_id,stay_id,table_code,idempotency_key,request_hash,tracking_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orderId,role,customerId,role==='guest'?anchor:null,cart.tableCode??null,cart.idempotencyKey,requestHash,sha256(token)]);
    const announcements:any[]=[];
    for (const area of ['cafe','hotel'] as const) {
      const items=prepared.filter(x=>x.area===area);
      if (!items.length) continue;
      const total=area==='cafe'?totalCafe:totalHotel;
      const method=area==='cafe'?cart.cafePayment:total===0?'none':'room_charge';
      const status=area==='hotel'?'queued':method==='cash'?'pending_payment':'waiting_gateway';
      const payStatus=area==='hotel'?(method==='none'?'not_required':'room_charge'):'pending';
      const sub=await c.query(`INSERT INTO suborders(order_id,area,status,payment_method,payment_status,total_cop)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[orderId,area,status,method,payStatus,total]);
      const sid=sub.rows[0].id as string;
      for (const item of items) {
        await c.query(`INSERT INTO order_items(suborder_id,product_id,product_name,quantity,unit_price_cop,options_snapshot,note,line_total_cop,game_group_snapshot,game_units_snapshot)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [sid,item.productId,item.name,item.quantity,item.unit,JSON.stringify(item.options),item.note,item.line,item.gameGroup,item.gameUnits]);
      }
      if (area==='hotel' && method==='room_charge') {
        await c.query('INSERT INTO room_charges(stay_id,suborder_id,amount_cop) VALUES($1,$2,$3)',[anchor,sid,total]);
      }
      if (area==='cafe' && method==='online') {
        await c.query('INSERT INTO payment_attempts(suborder_id,reference,amount_cop) VALUES($1,$2,$3)',
          [sid,`CH-${sid}`,total]);
      }
      if (status==='pending_payment') {
        await c.query(`INSERT INTO domain_events(event_key,event_type,suborder_id)
          VALUES($1,'EVENT_CASH_PENDING',$2)`,[`cash:${sid}`,sid]);
      }
      announcements.push({suborderId:sid,area,status});
    }
    return {orderId,reused:false,announcements};
  });
  for (const event of response.announcements) announce(event.area,event.suborderId,event.status);
  const token=trackingFor(response.orderId,cart.idempotencyKey);
  const suborders=await pool.query(`SELECT id,area,status,payment_method AS "paymentMethod",total_cop AS "totalCop"
    FROM suborders WHERE order_id=$1 ORDER BY area`,[response.orderId]);
  const online=suborders.rows.find(s=>s.area==='cafe'&&s.paymentMethod==='online');
  const checkout=online?checkoutDetails(`CH-${online.id}`,safeNumber(online.totalCop)):null;
  res.status(response.reused?200:201).json({orderId:response.orderId,trackingToken:token,
    suborders:suborders.rows,onlineCheckout:checkout,
    instructions: online&&!checkout?'Pasarela todavía no configurada; no se iniciará la preparación':undefined});
});
ordersRouter.get('/orders/:id/status',async(req,res)=>{
  const orderId=z.uuid().parse(req.params.id);
  const token=z.string().length(64).parse(req.query.token);
  const result=await pool.query('SELECT id FROM orders WHERE id=$1 AND tracking_hash=$2',[orderId,sha256(token)]);
  if (!result.rowCount) throw new HttpError(404,'Pedido no encontrado');
  const sub=await pool.query('SELECT area,status,payment_status AS "paymentStatus" FROM suborders WHERE order_id=$1',[orderId]);
  const game=await pool.query(`SELECT mode,player_count AS "playerCount",status,expires_at AS "expiresAt" FROM game_entitlements WHERE order_id=$1`,[orderId]);
  const capacity=await pool.query(`SELECT i.game_group_snapshot,
    SUM(i.quantity*i.game_units_snapshot)::int AS units
    FROM suborders s JOIN order_items i ON i.suborder_id=s.id
    WHERE s.order_id=$1 AND s.area='cafe' AND s.payment_status='paid' AND i.game_group_snapshot<>'none'
    GROUP BY i.game_group_snapshot`,[orderId]);
  const counts=consumptionFromRows(capacity.rows),assessment=assessParty(counts,1);
  res.setHeader('Cache-Control','no-store');
  res.json({orderId,suborders:sub.rows,gameEntitlement:game.rows[0]??null,
    gameEligibility:assessment.supportedPlayers>0?{counts,totalUnits:assessment.totalUnits,maxPlayers:assessment.supportedPlayers}:null});
});
