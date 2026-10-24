import {Router} from 'express';
import {pool,inTransaction,HttpError} from '../lib/db.js';
import {verifyWompiEvent} from '../lib/wompi.js';
import {announce} from '../lib/events.js';
export const webhooksRouter=Router();
webhooksRouter.post('/webhooks/wompi',async(req,res)=>{
  verifyWompiEvent(req.body,req.header('X-Event-Checksum'));
  if (req.body.event!=='transaction.updated') return res.json({received:true,ignored:true});
  if (req.body.environment!==process.env.WOMPI_ENV) throw new HttpError(400,'Entorno de pago incorrecto');
  const transaction=req.body.data?.transaction;
  if (!transaction||typeof transaction.reference!=='string'||typeof transaction.id!=='string') throw new HttpError(400,'Transacción inválida');
  const payload=await inTransaction(async c=>{
    const found=await c.query(`SELECT a.id,a.amount_cop,a.status,s.id suborder_id,s.status suborder_status
      FROM payment_attempts a JOIN suborders s ON s.id=a.suborder_id
      WHERE a.reference=$1 FOR UPDATE OF a,s`,[transaction.reference]);
    if (!found.rowCount) throw new HttpError(404,'Referencia de pago no encontrada');
    const payment=found.rows[0];
    if (transaction.currency!=='COP'||Number(transaction.amount_in_cents)!==Number(payment.amount_cop)*100)
      throw new HttpError(400,'Moneda o monto inconsistente');
    const mapped:{[key:string]:string}={APPROVED:'approved',DECLINED:'declined',VOIDED:'voided',ERROR:'error'};
    const next=mapped[transaction.status];
    if (!next) return null; // pendiente o evento intermedio
    if (payment.status==='approved') return null; // no revertir pago ya aprobado
    if (payment.status!== 'pending') return null; // evitar regresión o doble evento
    await c.query('UPDATE payment_attempts SET status=$2,transaction_id=$3,updated_at=now() WHERE id=$1',
      [payment.id,next,transaction.id]);
    if (next==='approved' && payment.suborder_status==='waiting_gateway') {
      await c.query(`UPDATE suborders SET status='queued',payment_status='paid',updated_at=now() WHERE id=$1`,[payment.suborder_id]);
      return {area:'cafe',suborderId:payment.suborder_id,status:'queued'};
    }
    return null;
  });
  if (payload) announce(payload.area,payload.suborderId,payload.status);
  return res.json({received:true});
});
