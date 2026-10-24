import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {io} from 'socket.io-client';
import {api,cop,type Product,type ModifierGroup} from './api';
import ProductForm from './components/ProductForm';

type Role='standard'|'guest'|'admin'|'kitchen'|'cashier'|'reception'|'housekeeping';
type CartItem={productId:string,quantity:number,optionIds:string[],note:string};
type KanbanItem={name:string,quantity:number,options:{name:string}[],note:string};
type KanbanOrder={id:string,orderId:string,area:'cafe'|'hotel',status:string,paymentStatus:string,totalCop:string,tableCode:string|null,roomNumber:string|null,items:KanbanItem[]};
type CheckoutResult={orderId:string,trackingToken:string,suborders:{area:string,status:string,totalCop:string}[],onlineCheckout:null|{url:string,publicKey:string,currency:string,amountInCents:number,reference:string,signature:string}};

const readCart=():CartItem[]=>{try{return JSON.parse(localStorage.getItem('cafe-hotel-cart')||'[]');}catch{return [];}};
function ProductSelector({product,add,cancel}:{product:Product,add:(item:CartItem)=>void,cancel:()=>void}) {
  const [selected,setSelected]=useState<string[]>([]);
  const [note,setNote]=useState('');
  const groups=product.groups;
  const valid=groups.every(g=>{
    const n=g.options.filter(o=>selected.includes(o.id)).length;
    return n>=g.minSelected&&n<=g.maxSelected;
  });
  const toggle=(group:ModifierGroup,id:string)=>{
    const groupIds=new Set(group.options.map(o=>o.id));
    setSelected(ids=>{
      if (ids.includes(id)) return ids.filter(v=>v!==id);
      const previous=ids.filter(v=>groupIds.has(v));
      const retain=previous.length>=group.maxSelected?previous.slice(1):previous;
      return [...ids.filter(v=>!groupIds.has(v)),...retain,id];
    });
  };
  const total=Number(product.priceCop)+groups.flatMap(g=>g.options).filter(o=>selected.includes(o.id)).reduce((sum,o)=>sum+Number(o.priceDeltaCop),0);
  return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)cancel();}}>
    <section className="dialog" role="dialog" aria-modal="true" aria-label={`Personalizar ${product.name}`}>
      <div className="inline"><h2>{product.name}</h2><button className="text-button" onClick={cancel}>Cerrar</button></div>
      {groups.map(group=><fieldset key={group.id} className="modifier-fieldset">
        <legend>{group.name} <small>({group.minSelected===group.maxSelected?`Elige ${group.minSelected}`:`${group.minSelected}–${group.maxSelected}`})</small></legend>
        {group.options.map(option=><label className="check" key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={()=>toggle(group,option.id)}/>
          <span>{option.name} {Number(option.priceDeltaCop)>0?`(+${cop(option.priceDeltaCop)})`:''}</span></label>)}
      </fieldset>)}
      <label>Indicaciones de preparación<textarea value={note} maxLength={350} onChange={e=>setNote(e.target.value)} placeholder="Ej. sin hielo"/></label>
      <button disabled={!valid} onClick={()=>add({productId:product.id,quantity:1,optionIds:selected,note})}>Agregar · {cop(total)}</button>
    </section>
  </div>;
}
function Menu({role,products,cart,onCartChange}:{role:Role,products:Product[],cart:CartItem[],onCartChange:(v:CartItem[])=>void}) {
  const [configuring,setConfiguring]=useState<Product|null>(null);
  const [customer,setCustomer]=useState({name:'',phone:'+57',whatsappOptIn:false});
  const [cafePayment,setCafePayment]=useState<'cash'|'online'>('cash');
  const [hotelPayment,setHotelPayment]=useState<'none'|'room_charge'>('none');
  const [room,setRoom]=useState('');const [pin,setPin]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [lastOrder,setLastOrder]=useState<CheckoutResult|null>(null);
  const [attemptKey,setAttemptKey]=useState(()=>crypto.randomUUID());
  const update=(next:CartItem[])=>{onCartChange(next);setAttemptKey(crypto.randomUUID());};
  const add=(item:CartItem)=>{update([...cart,item]);setConfiguring(null);};
  const estimate=cart.reduce((sum,item)=>{
    const p=products.find(x=>x.id===item.productId);
    if(!p)return sum;
    const delta=p.groups.flatMap(g=>g.options).filter(o=>item.optionIds.includes(o.id)).reduce((n,o)=>n+Number(o.priceDeltaCop),0);
    return sum+(Number(p.priceCop)+delta)*item.quantity;
  },0);
  const containsCafe=cart.some(item=>products.find(p=>p.id===item.productId)?.area==='cafe');
  const containsPaidHotel=cart.some(item=>{const p=products.find(p=>p.id===item.productId);if(p?.area!=='hotel')return false;
    const extras=p.groups.flatMap(g=>g.options).filter(o=>item.optionIds.includes(o.id)).reduce((n,o)=>n+Number(o.priceDeltaCop),0);
    return Number(p.priceCop)+extras>0;});
  async function guestLogin(e:FormEvent){e.preventDefault();try{
    await api('/guest/access',{method:'POST',body:JSON.stringify({roomNumber:room,pin})});
    location.reload();
  }catch(error){setNotice((error as Error).message);}}
  async function checkout(e:FormEvent){e.preventDefault();setBusy(true);setNotice('');
    try {
      const result=await api<CheckoutResult>('/orders/checkout',{method:'POST',body:JSON.stringify({
        idempotencyKey:attemptKey,items:cart,cafePayment,hotelPayment,
        ...((role!=='guest'||customer.whatsappOptIn)?{customer}:{}),
        tableCode:new URLSearchParams(location.search).get('mesa')??undefined
      })});
      setLastOrder(result);update([]);
      setNotice('Pedido recibido. Conserva tu número de pedido.');
    }catch(error){setNotice((error as Error).message);}finally{setBusy(false);}
  }
  function goPay(details:NonNullable<CheckoutResult['onlineCheckout']>) {
    const url=new URL(details.url);
    url.searchParams.set('public-key',details.publicKey);
    url.searchParams.set('currency',details.currency);
    url.searchParams.set('amount-in-cents',String(details.amountInCents));
    url.searchParams.set('reference',details.reference);
    url.searchParams.set('signature:integrity',details.signature);
    location.assign(url.href);
  }
  return <div className="stack">
    <section className="intro"><p className="eyebrow">PEDIDOS SIN ESPERAS</p><h1>Tu café, a tu ritmo.</h1><p>Explora el menú, personaliza tus favoritos y solicita lo que necesitas.</p>
      {role==='guest'&&<span className="pill">Acceso de huésped activo</span>}
    </section>
    {role!=='guest'&&<form className="guest-box" onSubmit={guestLogin}>
      <strong>¿Te hospedas aquí?</strong><p>Activa las solicitudes de habitación con tu PIN de recepción.</p>
      <div className="columns"><label>N.º habitación<input required value={room} onChange={e=>setRoom(e.target.value)}/></label>
        <label>PIN de 4 dígitos<input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} type="password" value={pin} onChange={e=>setPin(e.target.value)}/></label></div>
      <button className="secondary">Acceso huéspedes</button>
    </form>}
    <section><div className="inline"><h2>Menú</h2><span className="subtle">{products.length} opciones</span></div>
      <div className="product-grid">{products.map(p=><article className="product" key={p.id}>
        {p.imageUrl?<img src={p.imageUrl} alt=""/>:<div className="image-fallback">{p.area==='hotel'?'Habitación':'Café'}</div>}
        <div className="product-info"><span className="eyebrow">{p.category}</span><h3>{p.name}</h3><p>{p.description}</p>
          <div className="inline"><strong>{Number(p.priceCop)===0?'Sin cargo':cop(p.priceCop)}</strong><button onClick={()=>setConfiguring(p)}>Agregar</button></div>
        </div></article>)}</div>
    </section>
    <section className="cart-panel"><h2>Tu pedido · {cart.length} productos</h2>
      {!cart.length?<p className="subtle">Agrega algo del menú para comenzar.</p>:<form onSubmit={checkout} className="stack">
        {cart.map((item,i)=>{const p=products.find(x=>x.id===item.productId);return <div className="cart-line" key={i}>
          <span><strong>{p?.name??'Producto'}</strong><small> · {item.quantity} ud.</small></span>
          <button type="button" className="text-button" onClick={()=>update(cart.filter((_,j)=>j!==i))}>Quitar</button></div>;})}
        {<div className="columns"><label>{role==='guest'?'Nombre para avisos (opcional)':'Nombre'}<input required={role!=='guest'||customer.whatsappOptIn} value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
          <label>Teléfono WhatsApp (+57...)<input required={role!=='guest'||customer.whatsappOptIn} type="tel" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label>
          <label className="check"><input type="checkbox" checked={customer.whatsappOptIn} onChange={e=>setCustomer({...customer,whatsappOptIn:e.target.checked})}/> Acepto recibir notificaciones del pedido por WhatsApp</label>
        </div>}
        {containsCafe&&<label>Pago del café<select value={cafePayment} onChange={e=>setCafePayment(e.target.value as 'cash'|'online')}><option value="cash">Efectivo en caja</option><option value="online">PSE / tarjeta en línea</option></select></label>}
        {containsPaidHotel&&<label>Servicios del hotel<select value={hotelPayment} onChange={e=>setHotelPayment(e.target.value as 'none'|'room_charge')}><option value="none">Selecciona un método</option><option value="room_charge">Cargar a la habitación</option></select></label>}
        <div className="inline"><strong>Total estimado</strong><strong>{cop(estimate)}</strong></div>
        <button disabled={busy}>{busy?'Confirmando…':'Confirmar pedido'}</button>
      </form>}
      {notice&&<p className="status" role="status">{notice}</p>}
      {lastOrder&&<div className="receipt"><strong>Pedido {lastOrder.orderId.slice(0,8).toUpperCase()}</strong>
        {lastOrder.suborders.map(s=><p key={s.area}>{s.area==='cafe'?'Café':'Hotel'}: {s.status==='pending_payment'?'Paga en caja para iniciar':s.status==='waiting_gateway'?'Esperando pago':'Recibido'}</p>)}
        {lastOrder.onlineCheckout&&<button onClick={()=>goPay(lastOrder.onlineCheckout!)}>Pagar en Wompi</button>}
        <a href={`/seguimiento?pedido=${lastOrder.orderId}&token=${lastOrder.trackingToken}`}>Seguir pedido</a>
      </div>}
    </section>
    {configuring&&<ProductSelector product={configuring} add={add} cancel={()=>setConfiguring(null)}/>}
  </div>;
}
function FollowOrder() {
  const qs=new URLSearchParams(location.search),id=qs.get('pedido'),token=qs.get('token');
  const [states,setStates]=useState<{area:string,status:string,paymentStatus:string}[]>([]);const [error,setError]=useState('');
  useEffect(()=>{
    if(!id||!token)return;
    let stopped=false;
    const poll=()=>api<{suborders:typeof states}>(`/orders/${encodeURIComponent(id)}/status?token=${encodeURIComponent(token)}`)
      .then(r=>{if(!stopped)setStates(r.suborders);}).catch(e=>{if(!stopped)setError(e.message);});
    poll();const timer=setInterval(poll,7000);
    return()=>{stopped=true;clearInterval(timer);};
  },[id,token]);
  return <section className="stack"><h1>Seguimiento del pedido</h1>
    {states.map(s=><article className="cart-panel" key={s.area}><h3>{s.area==='cafe'?'Café':'Hotel'}</h3><p>Estado: <strong>{s.status}</strong></p><p>Pago: {s.paymentStatus}</p></article>)}
    {error&&<p role="alert">{error}</p>}<a href="/">Volver al menú</a></section>;
}
function StaffBoard({role}:{role:Role}) {
  const areas:('cafe'|'hotel')[]=role==='admin'?['cafe','hotel']:['kitchen','cashier'].includes(role)?['cafe']:['hotel'];
  const [area,setArea]=useState<'cafe'|'hotel'>(areas[0]!);
  const [orders,setOrders]=useState<KanbanOrder[]>([]);
  const [error,setError]=useState('');
  const reload=useCallback(()=>api<KanbanOrder[]>(`/staff/kanban/${area}`).then(setOrders).catch(e=>setError(e.message)),[area]);
  useEffect(()=>{reload();const socket=io('/staff');socket.on('suborder:update',(event:{area:string})=>{if(event.area===area)reload();});return()=>{socket.disconnect();};},[area,reload]);
  const transition=async(id:string,status:string)=>{try{await api(`/staff/suborders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});reload();}catch(e){setError((e as Error).message);}};
  const next=(o:KanbanOrder)=>o.area==='hotel' ?({queued:'dispatched',dispatched:'completed'} as Record<string,string>)[o.status]
    :({pending_payment:'queued',queued:'preparing',preparing:'ready',ready:'completed'} as Record<string,string>)[o.status];
  const authorized=(o:KanbanOrder)=>role==='admin'||o.area==='hotel'?['admin','reception','housekeeping'].includes(role)
    :o.status==='pending_payment'?role==='cashier':o.status==='ready'?['kitchen','cashier'].includes(role):role==='kitchen';
  return <section className="stack"><div className="inline"><h1>Panel operativo</h1><button className="secondary" onClick={()=>reload()}>Actualizar</button></div>
    {areas.length>1&&<div className="inline">{areas.map(a=><button key={a} className={area===a?'':'secondary'} onClick={()=>setArea(a)}>{a==='cafe'?'Cocina y caja':'Recepción'}</button>)}</div>}
    <div className="kanban">{['pending_payment','waiting_gateway','queued','preparing','ready','dispatched'].map(status=>{
      const matches=orders.filter(o=>o.status===status);if(!matches.length)return null;
      return <section className="kanban-column" key={status}><h3>{status.replaceAll('_',' ')} ({matches.length})</h3>
        {matches.map(o=><article key={o.id} className="ticket"><strong>#{o.orderId.slice(0,8).toUpperCase()}</strong>
          <p>{o.roomNumber?`Habitación ${o.roomNumber}`:o.tableCode?`Mesa ${o.tableCode}`:'Mostrador'} · {cop(o.totalCop)}</p>
          <ul>{o.items.map((item,i)=><li key={i}>{item.quantity} × {item.name} {item.options.map(x=>x.name).join(', ')} {item.note&&`— ${item.note}`}</li>)}</ul>
          {next(o)&&authorized(o)&&<button onClick={()=>transition(o.id,next(o)!)}>{o.status==='pending_payment'?'Confirmar efectivo':`Pasar a ${next(o)}`}</button>}
        </article>)}
      </section>;})}</div>{error&&<p role="alert">{error}</p>}</section>;
}
function Admin() {
  const [products,setProducts]=useState<Product[]>([]),[editing,setEditing]=useState<Product|null>(null);
  const [customers,setCustomers]=useState<{id:string,name:string,phone:string,visits:number,averageTicketCop:string}[]>([]);
  const [roomNumber,setRoomNumber]=useState(''),[roomMessage,setRoomMessage]=useState('');
  const [error,setError]=useState('');
  const reload=()=>{api<Product[]>('/admin/products').then(setProducts).catch(e=>setError(e.message));
    api<typeof customers>('/admin/customers').then(setCustomers).catch(e=>setError(e.message));};
  useEffect(reload,[]);
  const disabled=async(p:Product)=>{try{await api(`/admin/products/${p.id}/availability`,{method:'PATCH',body:JSON.stringify({isAvailable:!p.isAvailable})});reload();}catch(e){setError((e as Error).message);}};
  const remove=async(p:Product)=>{if(!confirm(`¿Eliminar ${p.name}? Dejará de verse en el catálogo. El historial de pedidos se conserva.`))return;
    try{await api(`/admin/products/${p.id}`,{method:'DELETE'});reload();}catch(e){setError((e as Error).message);}};
  const createRoom=async(e:FormEvent)=>{e.preventDefault();try{await api('/admin/rooms',{method:'POST',body:JSON.stringify({roomNumber})});setRoomMessage('Habitación registrada');setRoomNumber('');}catch(e){setRoomMessage((e as Error).message);}};
  return <div className="stack"><h1>Administración</h1><div className="admin-layout"><ProductForm editing={editing} onSaved={()=>{setEditing(null);reload();}}/>
    <section className="stack"><h2>Catálogo</h2>{products.filter(p=>!('deletedAt' in p && p.deletedAt)).map(p=><article className="list-card" key={p.id}>
      <strong>{p.name}</strong><span>{p.area} · {cop(p.priceCop)} · {p.isAvailable?'Disponible':'Agotado'}</span>
      <div className="inline"><button className="secondary" onClick={()=>setEditing(p)}>Editar</button><button className="secondary" onClick={()=>disabled(p)}>{p.isAvailable?'Agotar':'Habilitar'}</button>
        <button className="text-button" onClick={()=>remove(p)}>Eliminar</button></div>
    </article>)}</section></div>
    <form onSubmit={createRoom} className="cart-panel stack"><h2>Habitaciones</h2><label>Registrar habitación<input required value={roomNumber} onChange={e=>setRoomNumber(e.target.value)}/></label><button>Guardar habitación</button>{roomMessage&&<p role="status">{roomMessage}</p>}</form>
    <section className="cart-panel"><h2>Clientes (pedidos completados)</h2><div className="table-scroll"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Visitas</th><th>Ticket promedio</th></tr></thead><tbody>
      {customers.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.visits}</td><td>{cop(c.averageTicketCop)}</td></tr>)}
    </tbody></table></div></section>{error&&<p role="alert">{error}</p>}</div>;
}
function Reception() {
  const [roomNumber,setRoomNumber]=useState(''),[checkoutAt,setCheckoutAt]=useState('');
  const [created,setCreated]=useState<{pin:string,stayId:string}|null>(null),[revokeId,setRevokeId]=useState(''),[message,setMessage]=useState('');
  async function generate(e:FormEvent){e.preventDefault();try{
    const stay=await api<{pin:string,stayId:string}>('/reception/stays',{method:'POST',body:JSON.stringify({roomNumber,checkoutAt:new Date(checkoutAt).toISOString()})});
    setCreated(stay);setMessage('PIN generado. Entrégalo de forma privada.');
  }catch(e){setMessage((e as Error).message);}}
  async function revoke(){try{await api(`/reception/stays/${revokeId}/revoke`,{method:'POST'});setCreated(null);setRevokeId('');setMessage('Acceso revocado');}catch(e){setMessage((e as Error).message);}}
  return <section className="stack"><h1>Recepción · Accesos</h1><form onSubmit={generate} className="cart-panel stack">
    <h2>Check-in y PIN temporal</h2><label>Número de habitación<input required value={roomNumber} onChange={e=>setRoomNumber(e.target.value)}/></label>
    <label>Fecha y hora de checkout<input type="datetime-local" required value={checkoutAt} onChange={e=>setCheckoutAt(e.target.value)}/></label><button>Generar PIN</button></form>
    {created&&<div className="receipt"><p>PIN de acceso</p><strong className="pin">{created.pin}</strong><p>Estancia: {created.stayId}</p></div>}
    <section className="cart-panel stack"><h2>Revocar acceso</h2><label>ID de estancia<input value={revokeId} onChange={e=>setRevokeId(e.target.value)} placeholder="UUID de estancia"/></label>
      <button className="danger" disabled={!revokeId} onClick={revoke}>Revocar acceso anticipadamente</button></section>
    {message&&<p role="status">{message}</p>}
  </section>;
}
function Login({onSuccess}:{onSuccess:()=>void}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState('');
  async function login(e:FormEvent){e.preventDefault();try{await api('/staff/login',{method:'POST',body:JSON.stringify({email,password})});onSuccess();}catch(e){setMessage((e as Error).message);}}
  return <form onSubmit={login} className="cart-panel stack" style={{maxWidth:450,margin:'5rem auto'}}><h1>Acceso personal</h1>
    <label>Correo electrónico<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Contraseña<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button>Ingresar</button>
    {message&&<p role="alert">{message}</p>}</form>;
}
export default function App() {
  const [role,setRole]=useState<Role>('standard'),[loading,setLoading]=useState(true);
  const [products,setProducts]=useState<Product[]>([]),[cart,setCart]=useState<CartItem[]>(readCart);
  const [error,setError]=useState('');
  const refresh=()=>api<{role:Role}>('/auth/session').then(({role})=>setRole(role)).catch(()=>setRole('standard')).finally(()=>setLoading(false));
  useEffect(()=>{refresh();},[]);
  useEffect(()=>{api<Product[]>('/catalog').then(setProducts).catch(e=>setError(e.message));},[role]);
  useEffect(()=>{localStorage.setItem('cafe-hotel-cart',JSON.stringify(cart));},[cart]);
  const staff=!['standard','guest'].includes(role);
  if(location.pathname==='/seguimiento')return <main className="shell"><FollowOrder/></main>;
  return <><header className="topbar"><a className="wordmark" href="/">CAFÉ <span>+</span> HOTEL</a><div className="inline">
    {staff?<><span className="pill">{role}</span><button className="text-button" onClick={async()=>{await api('/auth/logout',{method:'POST'});location.reload();}}>Salir</button></>
      :<a className="nav-link" href="/personal">Personal</a>}
  </div></header><main className="shell">
    {loading?<p>Cargando…</p>:location.pathname==='/personal'&&!staff?<Login onSuccess={refresh}/>
      :staff? <div className="stack">{role==='admin'&&<Admin/>}
        {['admin','kitchen','cashier','reception','housekeeping'].includes(role)&&<StaffBoard role={role}/>}
        {['admin','reception'].includes(role)&&<Reception/>}</div>
      :<Menu role={role} products={products} cart={cart} onCartChange={setCart}/>}
    {error&&<p role="alert">{error}</p>}
  </main><footer>Pedidos seguros · Café + Hotel</footer></>;
}
