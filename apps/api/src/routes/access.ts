import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import argon2 from 'argon2';
import {randomInt} from 'node:crypto';
import {pool, inTransaction, HttpError} from '../lib/db.js';
import {createToken, writeSession, needStaff} from '../lib/auth.js';

export const accessRouter=Router();
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false});
const loginSchema=z.object({email:z.email().max(254),password:z.string().min(1).max(200)});
accessRouter.post('/staff/login',loginLimiter,async (req,res)=>{
  const input=loginSchema.parse(req.body);
  const result=await pool.query('SELECT id,password_hash,role FROM staff_users WHERE email=$1 AND is_active=true',[input.email.toLowerCase()]);
  const user=result.rows[0];
  if (!user || !await argon2.verify(user.password_hash,input.password)) throw new HttpError(401,'Credenciales inválidas');
  writeSession(res,await createToken(user.role,user.id,8*3600),8*3600);
  res.json({role:user.role});
});
accessRouter.post('/auth/logout',(_req,res)=>{
  res.clearCookie('ch_session',{sameSite:'lax',path:'/',secure:process.env.NODE_ENV==='production',httpOnly:true});
  res.json({ok:true});
});
accessRouter.get('/auth/session',(req,res)=>res.json({role:req.identity?.role??'standard'}));

const stayInput=z.object({roomNumber:z.string().min(1).max(15),checkoutAt:z.iso.datetime({offset:true})});
accessRouter.post('/reception/stays',needStaff('admin','reception'),async(req,res)=>{
  const data=stayInput.parse(req.body),end=new Date(data.checkoutAt);
  if (end.getTime()<=Date.now()+60_000 || end.getTime()>Date.now()+60*24*3600_000) throw new HttpError(400,'Fecha de checkout fuera de rango');
  const pin=String(randomInt(0,10000)).padStart(4,'0');
  const hash=await argon2.hash(`${pin}:${process.env.PIN_PEPPER}`,{type:argon2.argon2id});
  const id=await inTransaction(async c=>{
    const room=await c.query('SELECT id FROM rooms WHERE room_number=$1 AND is_active=true FOR UPDATE',[data.roomNumber]);
    if (!room.rowCount) throw new HttpError(404,'Habitación inexistente');
    const existing=await c.query(`SELECT id FROM stays WHERE room_id=$1 AND checked_out_at IS NULL AND checkout_at>now() LIMIT 1`,[room.rows[0].id]);
    if (existing.rowCount) throw new HttpError(409,'La habitación ya tiene una estancia activa');
    const r=await c.query(`INSERT INTO stays (room_id,pin_hash,checkout_at,created_by)
      VALUES ($1,$2,$3,$4) RETURNING id`,[room.rows[0].id,hash,end.toISOString(),req.identity!.id]);
    return r.rows[0].id as string;
  });
  res.status(201).json({stayId:id,roomNumber:data.roomNumber,pin,checkoutAt:data.checkoutAt,
    warning:'Mostrar PIN una sola vez. No almacenarlo en logs.'});
});
accessRouter.post('/reception/stays/:id/revoke',needStaff('admin','reception'),async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const changed=await pool.query(`UPDATE stays SET pin_revoked_at=now(),checked_out_at=COALESCE(checked_out_at,now())
    WHERE id=$1 AND checked_out_at IS NULL RETURNING id`,[id]);
  if (!changed.rowCount) throw new HttpError(404,'Estancia no encontrada o ya revocada');
  res.json({revoked:true});
});
accessRouter.get('/reception/rooms',needStaff('admin','reception'),async(_req,res)=>{
  const data=await pool.query('SELECT id,room_number,is_active FROM rooms ORDER BY room_number');
  res.json(data.rows);
});
accessRouter.post('/admin/rooms',needStaff('admin'),async(req,res)=>{
  const {roomNumber}=z.object({roomNumber:z.string().min(1).max(15)}).parse(req.body);
  const r=await pool.query('INSERT INTO rooms(room_number) VALUES($1) ON CONFLICT(room_number) DO UPDATE SET is_active=true RETURNING id,room_number',[roomNumber]);
  res.status(201).json(r.rows[0]);
});

accessRouter.post('/guest/access',loginLimiter,async(req,res)=>{
  const {roomNumber,pin}=z.object({roomNumber:z.string().min(1).max(15),pin:z.string().regex(/^\d{4}$/)}).parse(req.body);
  const outcome=await inTransaction(async c=>{
    const r=await c.query(`SELECT s.id,s.pin_hash,s.checkout_at,s.failed_attempts,s.locked_until
      FROM stays s JOIN rooms r ON r.id=s.room_id
      WHERE r.room_number=$1 AND s.pin_revoked_at IS NULL AND s.checked_out_at IS NULL
        AND s.checkout_at>now() ORDER BY s.checkout_at DESC LIMIT 1 FOR UPDATE OF s`,[roomNumber]);
    const stay=r.rows[0];
    if (!stay) return null;
    if (stay.locked_until && new Date(stay.locked_until)>new Date()) return null;
    const okay=await argon2.verify(stay.pin_hash,`${pin}:${process.env.PIN_PEPPER}`);
    if (!okay) {
      await c.query(`UPDATE stays SET failed_attempts=$2,locked_until=CASE WHEN $2>=5 THEN now()+interval '30 minutes' ELSE NULL END WHERE id=$1`,[stay.id,stay.failed_attempts+1]);
      return null;
    }
    await c.query('UPDATE stays SET failed_attempts=0,locked_until=NULL WHERE id=$1',[stay.id]);
    return {id:stay.id as string,checkout:new Date(stay.checkout_at)};
  });
  if (!outcome) throw new HttpError(401,'Habitación o PIN incorrecto, vencido o temporalmente bloqueado');
  const seconds=Math.max(1,Math.min(2*3600,Math.floor((outcome.checkout.getTime()-Date.now())/1000)));
  writeSession(res,await createToken('guest',outcome.id,seconds),seconds);
  res.json({role:'guest',expiresIn:seconds});
});
