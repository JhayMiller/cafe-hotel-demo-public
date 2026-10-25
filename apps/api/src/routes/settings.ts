import {Router} from 'express';
import argon2 from 'argon2';
import {z} from 'zod';
import {pool,HttpError} from '../lib/db.js';
import {needStaff} from '../lib/auth.js';

export const settingsRouter=Router();

const color=z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const optionalUrl=z.union([z.url().max(2000),z.literal(''),z.null()]).transform(v=>v||null);
const brandInput=z.object({
  name:z.string().min(2).max(140),shortName:z.string().min(2).max(60),
  tagline:z.string().max(180),description:z.string().max(500),
  logoUrl:optionalUrl,heroImageUrl:optionalUrl,
  primaryColor:color,secondaryColor:color,accentColor:color,surfaceColor:color,
  guestTitle:z.string().min(2).max(160),guestDescription:z.string().max(500),
  address:z.string().max(240),phone:z.string().max(40)
});

export async function readBrand() {
  const result=await pool.query(`SELECT name,short_name AS "shortName",tagline,description,
    logo_url AS "logoUrl",hero_image_url AS "heroImageUrl",primary_color AS "primaryColor",
    secondary_color AS "secondaryColor",accent_color AS "accentColor",surface_color AS "surfaceColor",
    guest_title AS "guestTitle",guest_description AS "guestDescription",address,phone
    FROM brand_settings WHERE singleton=true`);
  return result.rows[0];
}

settingsRouter.get('/brand',async(_req,res)=>res.json(await readBrand()));
settingsRouter.put('/admin/brand',needStaff('admin'),async(req,res)=>{
  const b=brandInput.parse(req.body);
  await pool.query(`UPDATE brand_settings SET name=$1,short_name=$2,tagline=$3,description=$4,
    logo_url=$5,hero_image_url=$6,primary_color=$7,secondary_color=$8,accent_color=$9,surface_color=$10,
    guest_title=$11,guest_description=$12,address=$13,phone=$14,updated_at=now() WHERE singleton=true`,
    [b.name,b.shortName,b.tagline,b.description,b.logoUrl,b.heroImageUrl,b.primaryColor,b.secondaryColor,
      b.accentColor,b.surfaceColor,b.guestTitle,b.guestDescription,b.address,b.phone]);
  res.json(await readBrand());
});

const roles=z.enum(['admin','reception','kitchen','cashier','housekeeping']);
const createStaff=z.object({displayName:z.string().min(2).max(120),email:z.email().max(254),password:z.string().min(12).max(200),role:roles});
settingsRouter.get('/admin/staff',needStaff('admin'),async(_req,res)=>{
  const rows=await pool.query(`SELECT id,email,COALESCE(display_name,email) AS "displayName",role,is_active AS "isActive",created_at AS "createdAt"
    FROM staff_users ORDER BY is_active DESC,display_name NULLS LAST,email`);
  res.json(rows.rows);
});
settingsRouter.post('/admin/staff',needStaff('admin'),async(req,res)=>{
  const s=createStaff.parse(req.body);
  try {
    const row=await pool.query(`INSERT INTO staff_users(email,password_hash,role,display_name)
      VALUES($1,$2,$3,$4) RETURNING id,email,display_name AS "displayName",role,is_active AS "isActive"`,
      [s.email.toLowerCase(),await argon2.hash(s.password,{type:argon2.argon2id}),s.role,s.displayName]);
    res.status(201).json(row.rows[0]);
  } catch(error:any) {
    if(error?.code==='23505') throw new HttpError(409,'Ya existe una cuenta con ese correo');
    throw error;
  }
});
const updateStaff=z.object({displayName:z.string().min(2).max(120),role:roles,isActive:z.boolean()});
settingsRouter.patch('/admin/staff/:id',needStaff('admin'),async(req,res)=>{
  const id=z.uuid().parse(req.params.id),s=updateStaff.parse(req.body);
  if(id===req.identity!.id&&!s.isActive) throw new HttpError(409,'No puedes desactivar tu propia cuenta');
  const row=await pool.query(`UPDATE staff_users SET display_name=$2,role=$3,is_active=$4 WHERE id=$1
    RETURNING id,email,display_name AS "displayName",role,is_active AS "isActive"`,[id,s.displayName,s.role,s.isActive]);
  if(!row.rowCount) throw new HttpError(404,'Cuenta no encontrada');
  res.json(row.rows[0]);
});
settingsRouter.put('/admin/staff/:id/password',needStaff('admin'),async(req,res)=>{
  const id=z.uuid().parse(req.params.id),{password}=z.object({password:z.string().min(12).max(200)}).parse(req.body);
  const row=await pool.query('UPDATE staff_users SET password_hash=$2 WHERE id=$1 RETURNING id',[id,await argon2.hash(password,{type:argon2.argon2id})]);
  if(!row.rowCount) throw new HttpError(404,'Cuenta no encontrada');
  res.json({updated:true});
});

settingsRouter.get('/admin/integrations',needStaff('admin'),(_req,res)=>res.json({
  payments:{provider:'Wompi',environment:process.env.WOMPI_ENV||'disabled',configured:Boolean(process.env.WOMPI_PUBLIC_KEY&&process.env.WOMPI_INTEGRITY_SECRET&&process.env.WOMPI_EVENTS_SECRET)},
  whatsapp:{configured:Boolean(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID),
    rewardPinReady:Boolean(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_TEMPLATE_REWARD_PIN)},
  storage:{configured:Boolean(process.env.STORAGE_BUCKET&&process.env.STORAGE_PUBLIC_BASE_URL)}
}));
