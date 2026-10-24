import {createHash, timingSafeEqual} from 'node:crypto';
import {HttpError} from './db.js';
export function sha256(value:string) { return createHash('sha256').update(value).digest('hex'); }
export function checkoutDetails(reference:string, totalCop:number) {
  const publicKey=process.env.WOMPI_PUBLIC_KEY, integrity=process.env.WOMPI_INTEGRITY_SECRET;
  if (!publicKey || !integrity) return null;
  const cents=totalCop*100;
  return {url:'https://checkout.wompi.co/p/', publicKey,currency:'COP',
    amountInCents:cents,reference,signature:sha256(`${reference}${cents}COP${integrity}`)};
}
export function verifyWompiEvent(body:any,header?:string) {
  const secret=process.env.WOMPI_EVENTS_SECRET;
  if (!secret) throw new HttpError(503,'Webhook no configurado');
  if (!body?.signature?.properties || !Array.isArray(body.signature.properties) || !Number.isSafeInteger(body.timestamp))
    throw new HttpError(400,'Evento inválido');
  const properties:unknown[]=body.signature.properties;
  if (properties.length===0 || properties.length>20) throw new HttpError(400,'Firma inválida');
  let content='';
  for (const property of properties) {
    if (typeof property!=='string' || !/^[a-zA-Z_]+(?:\.[a-zA-Z_]+)*$/.test(property)) throw new HttpError(400,'Firma inválida');
    let value:any=body.data;
    for (const segment of property.split('.')) value=value?.[segment];
    if (!['string','number','boolean'].includes(typeof value)) throw new HttpError(400,'Datos de firma inválidos');
    content+=String(value);
  }
  const computed=sha256(content+String(body.timestamp)+secret);
  const received=header ?? body.signature.checksum;
  if (typeof received!=='string' || !/^[a-f0-9]{64}$/i.test(received)) throw new HttpError(401,'Firma inválida');
  if (!timingSafeEqual(Buffer.from(computed,'hex'),Buffer.from(received,'hex'))) throw new HttpError(401,'Firma inválida');
  if (header && header.toLowerCase()!==String(body.signature.checksum).toLowerCase()) throw new HttpError(401,'Firmas no coinciden');
}
