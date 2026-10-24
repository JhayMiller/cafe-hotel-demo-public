import {useEffect,useState,type FormEvent} from 'react';
import {api,type Product,cop} from '../api';

type OptionForm={name:string,type:'add'|'remove'|'preference',priceDeltaCop:number};
type GroupForm={mode:'new'|'existing',existingGroupId:string,name:string,minSelected:number,maxSelected:number,options:OptionForm[]};
type ProductFormState={name:string,description:string,category:string,area:'cafe'|'hotel',visibility:'standard'|'guest',priceCop:number,imageUrl:string,isAvailable:boolean,groups:GroupForm[]};
const emptyGroup=():GroupForm=>({mode:'new',existingGroupId:'',name:'',minSelected:0,maxSelected:1,options:[{name:'',type:'add',priceDeltaCop:0}]});
const emptyForm=():ProductFormState=>({name:'',description:'',category:'Alimentos',area:'cafe',visibility:'standard',priceCop:0,imageUrl:'',isAvailable:true,groups:[]});
type ExistingGroup={id:string,name:string,options:OptionForm[]};
export default function ProductForm({onSaved,editing}:{onSaved:()=>void,editing?:Product|null}) {
  const [form,setForm]=useState<ProductFormState>(emptyForm);
  const [existingGroups,setExistingGroups]=useState<ExistingGroup[]>([]);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{api<ExistingGroup[]>('/admin/modifier-groups').then(setExistingGroups).catch(e=>setMessage(e.message));},[]);
  useEffect(()=>{
    if (!editing) {setForm(emptyForm());return;}
    setForm({name:editing.name,description:editing.description,category:editing.category,area:editing.area,
      visibility:editing.visibility,priceCop:Number(editing.priceCop),imageUrl:editing.imageUrl??'',
      isAvailable:editing.isAvailable,groups:editing.groups.map(g=>({mode:'existing',existingGroupId:g.id,
        name:g.name,minSelected:g.minSelected,maxSelected:g.maxSelected,options:[]}))});
  },[editing]);
  const set=<K extends keyof ProductFormState>(k:K,value:ProductFormState[K])=>setForm(old=>({...old,[k]:value}));
  const groupUpdate=(i:number,patch:Partial<GroupForm>)=>setForm(old=>({...old,groups:old.groups.map((g,j)=>i===j?{...g,...patch}:g)}));
  const optionUpdate=(i:number,j:number,patch:Partial<OptionForm>)=>setForm(old=>({...old,groups:old.groups.map((g,x)=>x!==i?g:{...g,options:g.options.map((o,y)=>y===j?{...o,...patch}:o)})}));
  async function uploadImage(file:File) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024) throw Error('Imagen JPG/PNG/WebP hasta 5 MB');
    const signed=await api<{uploadUrl:string,imageUrl:string}>('/admin/uploads/product-image',
      {method:'POST',body:JSON.stringify({contentType:file.type})});
    const response=await fetch(signed.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type},body:file});
    if(!response.ok) throw Error('No se pudo subir la imagen');
    set('imageUrl',signed.imageUrl);
  }
  async function submit(e:FormEvent) {
    e.preventDefault();setSaving(true);setMessage('');
    try {
      if (form.groups.some(g=>g.mode==='existing'&&!g.existingGroupId)) throw Error('Selecciona un grupo existente');
      const payload={...form,imageUrl:form.imageUrl||null,groups:form.groups.map(g=>g.mode==='existing'
        ?{existingGroupId:g.existingGroupId}
        :{name:g.name,minSelected:g.minSelected,maxSelected:g.maxSelected,options:g.options})};
      await api(editing?`/admin/products/${editing.id}`:'/admin/products',
        {method:editing?'PUT':'POST',body:JSON.stringify(payload)});
      setMessage('Producto guardado');if(!editing)setForm(emptyForm());onSaved();
    } catch(error) {setMessage((error as Error).message);}finally{setSaving(false);}
  }
  return <form onSubmit={submit} className="stack form-admin">
    <h3>{editing?'Editar producto':'Nuevo producto'}</h3>
    <label>Nombre<input required maxLength={130} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
    <label>Descripción<textarea maxLength={500} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
    <div className="columns"><label>Categoría<input required value={form.category} onChange={e=>set('category',e.target.value)}/></label>
    <label>Precio en COP<input type="number" min={0} step={1} required value={form.priceCop} onChange={e=>set('priceCop',Number(e.target.value))}/></label></div>
    <div className="columns"><label>Área<select value={form.area} onChange={e=>{
      const area=e.target.value as 'cafe'|'hotel';setForm(v=>({...v,area,visibility:area==='hotel'?'guest':v.visibility}));}}>
      <option value="cafe">Café</option><option value="hotel">Hotel</option></select></label>
    <label>Visibilidad<select value={form.visibility} disabled={form.area==='hotel'} onChange={e=>set('visibility',e.target.value as 'standard'|'guest')}>
      <option value="standard">Todo público</option><option value="guest">Solo huéspedes</option></select></label></div>
    <label className="check"><input type="checkbox" checked={form.isAvailable} onChange={e=>set('isAvailable',e.target.checked)}/> Disponible para pedidos</label>
    <label>Imagen del producto <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{
      const f=e.target.files?.[0];if(f)uploadImage(f).catch(err=>setMessage(err.message));}}/></label>
    {form.imageUrl&&<img src={form.imageUrl} alt="Vista previa del producto" className="preview"/>}
    <label>URL de imagen<input type="url" value={form.imageUrl} placeholder="https://..." onChange={e=>set('imageUrl',e.target.value)}/></label>
    <section className="stack"><div className="inline"><h4>Modificadores</h4><button type="button" className="secondary" onClick={()=>set('groups',[...form.groups,emptyGroup()])}>Agregar grupo</button></div>
      {form.groups.map((g,i)=><div className="group-editor" key={i}>
        <div className="inline"><strong>Grupo {i+1}</strong><button type="button" className="text-button" onClick={()=>set('groups',form.groups.filter((_,j)=>j!==i))}>Quitar grupo</button></div>
        <label>Tipo<select value={g.mode} onChange={e=>groupUpdate(i,{mode:e.target.value as 'new'|'existing'})}>
          <option value="new">Crear grupo con opciones</option><option value="existing">Reutilizar grupo existente</option></select></label>
        {g.mode==='existing'?<label>Grupo<select value={g.existingGroupId} onChange={e=>groupUpdate(i,{existingGroupId:e.target.value})}>
          <option value="">Seleccionar...</option>{existingGroups.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
        :<><label>Nombre del grupo<input required value={g.name} onChange={e=>groupUpdate(i,{name:e.target.value})}/></label>
          <div className="columns"><label>Mínimo<input type="number" min="0" max="20" value={g.minSelected} onChange={e=>groupUpdate(i,{minSelected:Number(e.target.value)})}/></label>
          <label>Máximo<input type="number" min="1" max="20" value={g.maxSelected} onChange={e=>groupUpdate(i,{maxSelected:Number(e.target.value)})}/></label></div>
          {g.options.map((o,j)=><div className="option-editor" key={j}>
            <label>Opción<input required value={o.name} onChange={e=>optionUpdate(i,j,{name:e.target.value})}/></label>
            <div className="columns"><label>Tipo<select value={o.type} onChange={e=>{
              const type=e.target.value as OptionForm['type'];optionUpdate(i,j,{type,priceDeltaCop:type==='add'?o.priceDeltaCop:0});}}>
              <option value="add">Adición</option><option value="remove">Excluir ingrediente</option><option value="preference">Preferencia</option></select></label>
              <label>Recargo (COP)<input type="number" min="0" step="1" disabled={o.type!=='add'} value={o.priceDeltaCop} onChange={e=>optionUpdate(i,j,{priceDeltaCop:Number(e.target.value)})}/></label></div>
            <button type="button" className="text-button" disabled={g.options.length<=1} onClick={()=>groupUpdate(i,{options:g.options.filter((_,n)=>n!==j)})}>Quitar opción</button>
          </div>)}
          <button type="button" className="secondary" onClick={()=>groupUpdate(i,{options:[...g.options,{name:'',type:'add',priceDeltaCop:0}]})}>Añadir opción</button>
        </>}
      </div>)}
    </section>
    <button disabled={saving}>{saving?'Guardando…':editing?'Guardar cambios':`Crear producto (${cop(form.priceCop)})`}</button>
    {message&&<p role="status" className="status">{message}</p>}
  </form>;
}
