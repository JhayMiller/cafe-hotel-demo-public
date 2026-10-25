import {pool} from './db.js';

type EventRow={id:string,event_type:string,suborder_id:string,attempts:number};
const templates:Record<string,string|undefined>={
  EVENT_ORDER_READY:process.env.WHATSAPP_TEMPLATE_READY,
  EVENT_AMENITY_DISPATCHED:process.env.WHATSAPP_TEMPLATE_DISPATCHED
};
async function deliver(event:EventRow):Promise<'sent'|'skipped'> {
  // EVENT_CASH_PENDING es un aviso de UI. No genera mensaje de WhatsApp.
  const template=templates[event.event_type];
  if (!template) return 'skipped';
  const contact=await pool.query(`SELECT c.phone_e164,c.whatsapp_opt_in FROM suborders s
    JOIN orders o ON o.id=s.order_id LEFT JOIN customers c ON c.id=o.customer_id
    WHERE s.id=$1`,[event.suborder_id]);
  const customer=contact.rows[0];
  if (!customer?.whatsapp_opt_in||!customer.phone_e164) return 'skipped';
  const phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID,token=process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId||!token) throw Error('Canal WhatsApp no configurado');
  const graphVersion=process.env.WHATSAPP_GRAPH_VERSION||'v23.0';
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw Error('Versión de Graph no válida');
  const response=await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to:customer.phone_e164.replace('+',''),
      type:'template',template:{name:template,language:{code:'es_CO'}}}),
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw Error(`Proveedor WhatsApp HTTP ${response.status}`);
  return 'sent';
}
async function tick() {
  const claimed=await pool.query<EventRow>(`UPDATE domain_events d SET delivery_state='processing',
    attempts=d.attempts+1,processing_at=now()
    WHERE d.id IN (SELECT id FROM domain_events WHERE
      (delivery_state='pending' AND next_attempt_at<=now()) OR
      (delivery_state='processing' AND processing_at<now()-interval '2 minutes')
      ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED)
    RETURNING d.id,d.event_type,d.suborder_id,d.attempts`);
  for (const event of claimed.rows) {
    try {
      const result=await deliver(event);
      await pool.query('UPDATE domain_events SET delivery_state=$2,delivered_at=now() WHERE id=$1',[event.id,result]);
    } catch(e) {
      // No revelar teléfonos/tokens al log. Intentos limitados y retroceso progresivo.
      const lastAttempt=event.attempts>=4;
      await pool.query(`UPDATE domain_events SET delivery_state=$2,next_attempt_at=now()+($3::int*interval '1 minute') WHERE id=$1`,
        [event.id,lastAttempt?'error':'pending',Math.min(2**event.attempts,30)]);
      console.error('Fallo de notificación (sin datos personales):',event.id);
    }
  }
}
export function startNotificationWorker() {
  let running=false;
  const interval=setInterval(async()=>{
    if(running)return;
    running=true;
    try {await tick();} catch {console.error('Falló un ciclo de notificaciones');}
    finally {running=false;}
  },20000);
  interval.unref();
}

export async function sendRewardPin(phone:string,pin:string){
  const phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID,token=process.env.WHATSAPP_ACCESS_TOKEN;
  const template=process.env.WHATSAPP_TEMPLATE_REWARD_PIN;
  if(!phoneId||!token||!template)throw Error('Canal de verificación por WhatsApp no configurado');
  const graphVersion=process.env.WHATSAPP_GRAPH_VERSION||'v23.0';
  if(!/^v\d+\.\d+$/.test(graphVersion))throw Error('Versión de Graph no válida');
  const response=await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to:phone.replace('+',''),type:'template',
      template:{name:template,language:{code:'es_CO'},components:[{type:'body',parameters:[{type:'text',text:pin}]}]}}),
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error(`Proveedor WhatsApp HTTP ${response.status}`);
  const body=await response.json() as {messages?:{id?:string}[]};
  return body.messages?.[0]?.id??null;
}
