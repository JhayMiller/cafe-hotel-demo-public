import {Router} from 'express';
import {z} from 'zod';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {randomUUID} from 'node:crypto';
import {pool,inTransaction,HttpError, type DB} from '../lib/db.js';
import {needStaff} from '../lib/auth.js';
import {productInput} from '../lib/validators.js';
export const catalogRouter=Router();

const SELECT_PRODUCTS=`SELECT p.id,p.name,p.description,p.category,p.area,p.visibility,p.price_cop AS "priceCop",
 p.image_url AS "imageUrl",p.is_available AS "isAvailable",p.deleted_at AS "deletedAt",
 p.game_group AS "gameGroup",p.game_units AS "gameUnits",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'minSelected',g.min_selected,
 'maxSelected',g.max_selected,'options',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,
 'name',o.name,'type',o.type,'priceDeltaCop',o.price_delta_cop) ORDER BY o.sort_order)
 FROM modifier_options o WHERE o.group_id=g.id AND o.is_active=true),'[]'::jsonb)) ORDER BY pm.sort_order)
 FROM product_modifier_groups pm JOIN modifier_groups g ON g.id=pm.group_id
 WHERE pm.product_id=p.id AND g.is_active=true),'[]'::jsonb) groups
 FROM products p`;
// Devuelve menú ya compuesto: un viaje a API para productos, grupos y opciones.
catalogRouter.get('/catalog',async(req,res)=>{
  const visibility=req.identity?.role==='guest' ? ['standard','guest'] : ['standard'];
  const result=await pool.query(`${SELECT_PRODUCTS} WHERE p.deleted_at IS NULL AND p.is_available=true
    AND p.visibility=ANY($1::text[]) ORDER BY p.area,p.category,p.name`,[visibility]);
  res.json(result.rows);
});
catalogRouter.get('/admin/products',needStaff('admin'),async(_req,res)=>{
  const result=await pool.query(`${SELECT_PRODUCTS} ORDER BY p.created_at DESC`);
  res.json(result.rows);
});
catalogRouter.get('/admin/modifier-groups',needStaff('admin'),async(_req,res)=>{
  const rows=await pool.query(`SELECT g.id,g.name,g.min_selected AS "minSelected",g.max_selected AS "maxSelected",
    COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'type',o.type,'priceDeltaCop',o.price_delta_cop))
    FILTER (WHERE o.id IS NOT NULL),'[]'::jsonb) options
    FROM modifier_groups g LEFT JOIN modifier_options o ON o.group_id=g.id AND o.is_active=true
    WHERE g.is_active=true GROUP BY g.id ORDER BY g.name`);
  res.json(rows.rows);
});

async function attachGroups(c:DB,productId:string,groups:z.infer<typeof productInput>['groups']) {
  for (let i=0;i<groups.length;i++) {
    const group=groups[i]!;
    let groupId:string;
    if ('existingGroupId' in group) {
      const r=await c.query(`SELECT g.id,g.min_selected,g.max_selected,COUNT(o.id)::int option_count
        FROM modifier_groups g LEFT JOIN modifier_options o ON o.group_id=g.id AND o.is_active=true
        WHERE g.id=$1 AND g.is_active=true GROUP BY g.id`,[group.existingGroupId]);
      if (!r.rowCount || Number(r.rows[0].option_count)<Number(r.rows[0].max_selected)) throw new HttpError(422,'Grupo de modificadores inválido');
      groupId=r.rows[0].id;
    } else {
      const g=await c.query(`INSERT INTO modifier_groups(name,min_selected,max_selected) VALUES($1,$2,$3) RETURNING id`,
        [group.name,group.minSelected,group.maxSelected]);
      groupId=g.rows[0].id;
      for (const [index,option] of group.options.entries()) {
        if (option.type!=='add' && option.priceDeltaCop!==0) throw new HttpError(422,'Solo las adiciones tienen recargo');
        await c.query(`INSERT INTO modifier_options(group_id,name,type,price_delta_cop,sort_order)
          VALUES($1,$2,$3,$4,$5)`,[groupId,option.name,option.type,option.priceDeltaCop,index]);
      }
    }
    await c.query('INSERT INTO product_modifier_groups(product_id,group_id,sort_order) VALUES($1,$2,$3)',[productId,groupId,i]);
  }
}
async function saveProduct(req:any,res:any,update=false) {
  const input=productInput.parse(req.body);
  const id=update ? z.uuid().parse(req.params.id) : undefined;
  const productId=await inTransaction(async c=>{
    let result;
    if (id) {
      result=await c.query(`UPDATE products SET name=$2,description=$3,category=$4,area=$5,visibility=$6,
        price_cop=$7,image_url=$8,is_available=$9,game_group=$10,game_units=$11,updated_at=now()
        WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
        [id,input.name,input.description,input.category,input.area,input.visibility,input.priceCop,input.imageUrl??null,input.isAvailable,input.area==='cafe'?input.gameGroup:'none',input.area==='cafe'?input.gameUnits:0]);
      if (!result.rowCount) throw new HttpError(404,'Producto inexistente');
      await c.query('DELETE FROM product_modifier_groups WHERE product_id=$1',[id]);
    } else {
      result=await c.query(`INSERT INTO products(name,description,category,area,visibility,price_cop,image_url,is_available,game_group,game_units)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [input.name,input.description,input.category,input.area,input.visibility,input.priceCop,input.imageUrl??null,input.isAvailable,input.area==='cafe'?input.gameGroup:'none',input.area==='cafe'?input.gameUnits:0]);
    }
    const pid=result.rows[0].id as string;
    await attachGroups(c,pid,input.groups);
    return pid;
  });
  res.status(update?200:201).json({id:productId,ok:true});
}
catalogRouter.post('/admin/products',needStaff('admin'),(req,res)=>saveProduct(req,res));
catalogRouter.put('/admin/products/:id',needStaff('admin'),(req,res)=>saveProduct(req,res,true));
catalogRouter.delete('/admin/products/:id',needStaff('admin'),async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const r=await pool.query('UPDATE products SET deleted_at=now(),is_available=false WHERE id=$1 AND deleted_at IS NULL RETURNING id',[id]);
  if (!r.rowCount) throw new HttpError(404,'Producto no encontrado');
  res.json({deleted:true});
});
catalogRouter.patch('/admin/products/:id/availability',needStaff('admin'),async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const {isAvailable}=z.object({isAvailable:z.boolean()}).parse(req.body);
  const r=await pool.query('UPDATE products SET is_available=$2,updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',[id,isAvailable]);
  if (!r.rowCount) throw new HttpError(404,'Producto no encontrado');
  res.json({id,isAvailable});
});
catalogRouter.post('/admin/uploads/product-image',needStaff('admin'),async(req,res)=>{
  const {contentType}=z.object({contentType:z.enum(['image/jpeg','image/png','image/webp'])}).parse(req.body);
  const bucket=process.env.STORAGE_BUCKET, base=process.env.STORAGE_PUBLIC_BASE_URL;
  if (!bucket || !base) throw new HttpError(503,'Almacenamiento no configurado');
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[contentType];
  const key=`products/${randomUUID()}.${ext}`;
  const s3=new S3Client({region:process.env.STORAGE_REGION||'us-east-1',
    ...(process.env.STORAGE_ENDPOINT?{endpoint:process.env.STORAGE_ENDPOINT,forcePathStyle:true}:{}),
    ...(process.env.STORAGE_ACCESS_KEY_ID&&process.env.STORAGE_SECRET_ACCESS_KEY?{credentials:{
      accessKeyId:process.env.STORAGE_ACCESS_KEY_ID,secretAccessKey:process.env.STORAGE_SECRET_ACCESS_KEY}}:{})});
  const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:contentType}),{expiresIn:60});
  res.json({uploadUrl,imageUrl:`${base.replace(/\/$/,'')}/${key}`});
});
