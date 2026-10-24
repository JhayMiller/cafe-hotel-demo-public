import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {createServer} from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {ZodError} from 'zod';
import {session} from './lib/auth.js';
import {HttpError,pool} from './lib/db.js';
import {installSockets} from './lib/events.js';
import {startNotificationWorker} from './lib/notifications.js';
import {accessRouter} from './routes/access.js';
import {catalogRouter} from './routes/catalog.js';
import {ordersRouter} from './routes/orders.js';
import {operationsRouter} from './routes/operations.js';
import {webhooksRouter} from './routes/webhooks.js';
import {settingsRouter,readBrand} from './routes/settings.js';
import {runMigrations} from './migrate.js';

for (const env of ['DATABASE_URL','JWT_SECRET','PIN_PEPPER']) {
  if (!process.env[env] || process.env[env]!.length< (env==='DATABASE_URL'?10:32))
    throw new Error(`Configurar ${env} antes de iniciar`);
}
const app=express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({limit:'100kb'}));
app.use(cookieParser());
// Origen seguro para mutaciones con cookies. Webhooks externos utilizan su firma verificable.
app.use((req,res,next)=>{
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)&&!req.path.startsWith('/api/webhooks/')) {
    const origin=req.header('Origin');
    const webOrigin=process.env.WEB_ORIGIN||process.env.RENDER_EXTERNAL_URL;
    if (origin && origin!==webOrigin) return res.status(403).json({error:'Origen no autorizado'});
    if (process.env.NODE_ENV==='production'&&!origin) return res.status(403).json({error:'Origen obligatorio'});
  }
  next();
});
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.use('/api',webhooksRouter);
app.use('/api',session);
app.use('/api',accessRouter,catalogRouter,ordersRouter,operationsRouter,settingsRouter);
app.get('/manifest.webmanifest',async(_req,res)=>{
  const brand=await readBrand();
  res.type('application/manifest+json').json({name:brand.name,short_name:brand.shortName,
    description:brand.description,start_url:'/',display:'standalone',background_color:brand.surfaceColor,
    theme_color:brand.primaryColor,icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]});
});
const webDist=process.env.WEB_DIST_DIR;
if (webDist && fs.existsSync(webDist)) {
  app.use(express.static(webDist,{index:false,maxAge:'1h'}));
  app.use((req,res,next)=>{
    if (req.method==='GET' && req.accepts('html')) return res.sendFile(path.join(webDist,'index.html'));
    next();
  });
}
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if (err instanceof ZodError) return res.status(422).json({error:'Datos inválidos',details:err.issues});
  if (err instanceof HttpError) return res.status(err.status).json({error:err.message});
  if (process.env.NODE_ENV!=='production') console.error(err);
  return res.status(500).json({error:'Error interno'});
});
const http=createServer(app);
installSockets(http);
startNotificationWorker();
const port=Number(process.env.PORT??4000);
await runMigrations();
http.listen(port,()=>console.log(`API en puerto ${port}`));
process.on('SIGTERM',async()=>{http.close();await pool.end();});
