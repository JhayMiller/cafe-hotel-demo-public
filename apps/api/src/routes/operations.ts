import {Router} from 'express';
import {z} from 'zod';
import {pool,inTransaction,HttpError} from '../lib/db.js';
import {needStaff,canViewArea} from '../lib/auth.js';
import {announce} from '../lib/events.js';
export const operationsRouter=Router();
operationsRouter.get('/staff/kanban/:area',needStaff('admin','reception','kitchen','cashier','housekeeping'),async(req,res)=>{
  const area=z.enum(['cafe','hotel']).parse(req.params.area);
  if (!canViewArea(req.identity!.role,area)) throw new HttpError(403,'Área restringida');
  const rows=await pool.query(`SELECT s.id,s.order_id AS "orderId",s.area,s.status,s.payment_status AS "paymentStatus",
    s.total_cop AS "totalCop",s.created_at AS "createdAt",o.table_code AS "tableCode",
    CASE WHEN s.area='hotel' THEN r.room_number ELSE NULL END AS "roomNumber",
    COALESCE(jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,
      'options',i.options_snapshot,'note',i.note)) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) items
    FROM suborders s JOIN orders o ON o.id=s.order_id
    LEFT JOIN stays st ON st.id=o.stay_id LEFT JOIN rooms r ON r.id=st.room_id
    LEFT JOIN order_items i ON i.suborder_id=s.id
    WHERE s.area=$1 AND s.status NOT IN ('completed','cancelled')
    GROUP BY s.id,o.id,r.room_number ORDER BY s.created_at`,[area]);
  res.json(rows.rows);
});
const transitionInput=z.object({status:z.enum(['queued','preparing','ready','dispatched','completed','cancelled'])});
operationsRouter.patch('/staff/suborders/:id/status',needStaff('admin','reception','kitchen','cashier','housekeeping'),async(req,res)=>{
  const id=z.uuid().parse(req.params.id),{status:target}=transitionInput.parse(req.body),role=req.identity!.role;
  const change=await inTransaction(async c=>{
    const r=await c.query('SELECT area,status,payment_method,payment_status FROM suborders WHERE id=$1 FOR UPDATE',[id]);
    if (!r.rowCount) throw new HttpError(404,'Suborden inexistente');
    const s=r.rows[0];
    if (!canViewArea(role,s.area)) throw new HttpError(403,'Área restringida');
    const valid=(s.area==='cafe'&&(
      (s.status==='pending_payment'&&target==='queued'&&['cashier','admin'].includes(role))||
      (s.status==='queued'&&target==='preparing'&&['kitchen','admin'].includes(role))||
      (s.status==='preparing'&&target==='ready'&&['kitchen','admin'].includes(role))||
      (s.status==='ready'&&target==='completed'&&['cashier','kitchen','admin'].includes(role))
    )) || (s.area==='hotel'&&(
      (s.status==='queued'&&target==='dispatched'&&['housekeeping','reception','admin'].includes(role))||
      (s.status==='dispatched'&&target==='completed'&&['housekeeping','reception','admin'].includes(role))
    )) || (target==='cancelled'&&role==='admin'&&!['completed','cancelled'].includes(s.status));
    if (!valid) throw new HttpError(409,'Transición o rol no permitido');
    if (s.area==='cafe'&&target==='queued'&&s.payment_method!=='cash') throw new HttpError(409,'Pago debe confirmarse con el webhook');
    await c.query(`UPDATE suborders SET status=$2,payment_status=CASE WHEN status='pending_payment' AND $2='queued'
      THEN 'paid' ELSE payment_status END,updated_at=now() WHERE id=$1`,[id,target]);
    if (target==='cancelled' && s.area==='hotel') {
      await c.query("UPDATE room_charges SET status='voided' WHERE suborder_id=$1 AND status='open'",[id]);
    }
    if (target==='ready'||target==='dispatched') {
      const eventType=target==='ready'?'EVENT_ORDER_READY':'EVENT_AMENITY_DISPATCHED';
      await c.query(`INSERT INTO domain_events(event_key,event_type,suborder_id)
        VALUES($1,$2,$3) ON CONFLICT(event_key) DO NOTHING`,[`${eventType}:${id}`,eventType,id]);
    }
    return {area:s.area as string,status:target};
  });
  announce(change.area,id,change.status);
  res.json({id,...change});
});
operationsRouter.get('/admin/customers',needStaff('admin'),async(_req,res)=>{
  const result=await pool.query(`SELECT c.id,c.name,c.phone_e164 AS phone,
    c.whatsapp_opt_in AS "whatsappOptIn",COUNT(s.id)::int AS visits,
    COALESCE(ROUND(AVG(s.total_cop)),0)::bigint AS "averageTicketCop",
    COALESCE(SUM(s.total_cop),0)::bigint AS "spendCop"
    FROM customers c LEFT JOIN orders o ON o.customer_id=c.id
    LEFT JOIN suborders s ON s.order_id=o.id AND s.area='cafe' AND s.status='completed'
    GROUP BY c.id ORDER BY visits DESC,c.name`);
  res.json(result.rows);
});
