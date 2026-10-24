import {z} from 'zod';
export const groupInline = z.object({
  name:z.string().min(2).max(100), minSelected:z.number().int().min(0),
  maxSelected:z.number().int().min(1).max(20),
  options:z.array(z.object({name:z.string().min(1).max(100),
    type:z.enum(['add','remove','preference']),priceDeltaCop:z.number().int().min(0).max(5000000)})).min(1).max(30)
}).refine(g=>g.maxSelected>=g.minSelected && g.maxSelected<=g.options.length,{message:'Límites de selección inválidos'});
export const productInput = z.object({
  name:z.string().min(2).max(130),description:z.string().max(500).default(''),
  category:z.string().min(2).max(60),area:z.enum(['cafe','hotel']),
  visibility:z.enum(['standard','guest']),priceCop:z.number().int().min(0).max(100000000),
  gameGroup:z.enum(['beverage','food','none']).default('food'),gameUnits:z.number().int().min(0).max(20).default(1),
  imageUrl:z.url().max(2000).nullable().optional(),isAvailable:z.boolean().default(true),
  groups:z.array(z.union([
    z.object({existingGroupId:z.uuid()}),
    groupInline
  ])).max(20).default([])
}).refine(v=>v.area==='cafe'||v.visibility==='guest',{message:'Los productos del hotel deben ser guest-only'});
export const cartInput = z.object({
  idempotencyKey:z.uuid(),
  tableCode:z.string().max(60).optional(),
  customer:z.object({name:z.string().min(2).max(120),
    phone:z.string().regex(/^\+[1-9]\d{7,14}$/),whatsappOptIn:z.boolean().default(false)}).optional(),
  cafePayment:z.enum(['cash','online']).default('cash'),
  hotelPayment:z.enum(['none','room_charge']).default('none'),
  items:z.array(z.object({productId:z.uuid(),quantity:z.number().int().min(1).max(30),
    optionIds:z.array(z.uuid()).max(40).default([]), note:z.string().max(350).default('')})).min(1).max(40)
});
