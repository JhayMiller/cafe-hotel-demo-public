import {SignJWT, jwtVerify} from 'jose';
import type {Request, Response, NextFunction} from 'express';
import {pool, HttpError} from './db.js';

type StaffRole = 'admin'|'reception'|'kitchen'|'cashier'|'housekeeping';
export type Identity = {role: StaffRole|'guest'; id: string; stayId?: string};
declare global {
  namespace Express { interface Request { identity?: Identity } }
}
const secret = () => {
  const key = process.env.JWT_SECRET;
  if (!key || key.length < 32) throw new Error('JWT_SECRET necesita 32+ caracteres');
  return new TextEncoder().encode(key);
};
export async function createToken(role: Identity['role'], id: string, expSeconds=3600) {
  return new SignJWT({role}).setProtectedHeader({alg:'HS256'})
    .setSubject(id).setIssuer('cafe-hotel').setAudience('cafe-hotel-web')
    .setIssuedAt().setExpirationTime(`${expSeconds}s`).sign(secret());
}
export function writeSession(res: Response, jwt: string, seconds: number) {
  res.cookie('ch_session', jwt, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: seconds * 1000,
  });
}
export async function readIdentity(token?: string): Promise<Identity|null> {
  if (!token) return null;
  try {
    const {payload} = await jwtVerify(token, secret(), {issuer:'cafe-hotel',audience:'cafe-hotel-web',algorithms:['HS256']});
    if (!payload.sub || typeof payload.role !== 'string') return null;
    if (payload.role === 'guest') {
      const stay = await pool.query(`SELECT id FROM stays WHERE id=$1 AND pin_revoked_at IS NULL
        AND checked_out_at IS NULL AND checkout_at > now()`, [payload.sub]);
      return stay.rowCount ? {id:payload.sub,stayId:payload.sub,role:'guest'} : null;
    }
    if (!['admin','reception','kitchen','cashier','housekeeping'].includes(payload.role)) return null;
    const staff = await pool.query('SELECT id,role FROM staff_users WHERE id=$1 AND role=$2 AND is_active=true', [payload.sub,payload.role]);
    return staff.rowCount ? {id:payload.sub,role:payload.role as StaffRole} : null;
  } catch {return null;}
}
export async function session(req: Request,res: Response,next:NextFunction) {
  try {req.identity = await readIdentity(req.cookies?.ch_session) ?? undefined; next();}
  catch(error) { next(error); }
}
export function needStaff(...roles: StaffRole[]) {
  return (req:Request,_res:Response,next:NextFunction) => {
    if (!req.identity || !roles.includes(req.identity.role as StaffRole)) return next(new HttpError(403,'Acceso restringido'));
    next();
  };
}
export function canViewArea(role:string,area:string) {
  return role==='admin' || (area==='cafe' && ['kitchen','cashier'].includes(role)) ||
    (area==='hotel' && ['reception','housekeeping'].includes(role));
}
