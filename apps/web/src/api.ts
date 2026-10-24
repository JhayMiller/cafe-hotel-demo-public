import {demoMode,demoResponse} from './demo';
export async function api<T>(path:string,opts?:RequestInit):Promise<T> {
  if(demoMode)return demoResponse(path) as T;
  const response=await fetch(`/api${path}`,{credentials:'same-origin',...opts,
    headers:{'Content-Type':'application/json',...opts?.headers}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.error??`HTTP ${response.status}`);
  return body as T;
}
export type ModifierOption={id:string,name:string,type:'add'|'remove'|'preference',priceDeltaCop:number|string};
export type ModifierGroup={id:string,name:string,minSelected:number,maxSelected:number,options:ModifierOption[]};
export type Product={id:string,name:string,description:string,category:string,area:'cafe'|'hotel',visibility:'standard'|'guest',priceCop:number|string,imageUrl:string|null,isAvailable:boolean,groups:ModifierGroup[]};
export const cop=(n:number|string)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n));
