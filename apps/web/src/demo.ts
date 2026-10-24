import type {Product} from './api';

export const demoMode = new URLSearchParams(location.search).get('demo') === '1';
const products: Product[] = [
  {id:'demo-cafe',name:'Café de la casa',description:'Café colombiano recién preparado.',category:'Bebidas',area:'cafe',visibility:'standard',priceCop:5000,imageUrl:null,isAvailable:true,gameGroup:'beverage',gameUnits:1,groups:[]},
  {id:'demo-capuchino',name:'Capuchino',description:'Espresso con leche cremosa.',category:'Bebidas',area:'cafe',visibility:'standard',priceCop:8500,imageUrl:null,isAvailable:true,gameGroup:'beverage',gameUnits:1,groups:[]},
  {id:'demo-hamburguesa',name:'Hamburguesa artesanal',description:'Producto de ejemplo para explorar las opciones del carrito.',category:'Alimentos',area:'cafe',visibility:'standard',priceCop:25000,imageUrl:null,isAvailable:true,gameGroup:'meal',gameUnits:1,groups:[{id:'demo-extras',name:'Extras',minSelected:0,maxSelected:2,options:[{id:'demo-tocineta',name:'Tocineta',type:'add',priceDeltaCop:4000},{id:'demo-queso',name:'Queso',type:'add',priceDeltaCop:3000}]}]},
  {id:'demo-postre',name:'Torta del día',description:'Una porción para acompañar tu café.',category:'Postres',area:'cafe',visibility:'standard',priceCop:10000,imageUrl:null,isAvailable:true,gameGroup:'pastry',gameUnits:1,groups:[]}
];

export function demoResponse(path:string):unknown {
  if(path==='/auth/session')return {role:'standard'};
  if(path==='/brand')return {name:'Posada del Puerto | café hotel',shortName:'Posada del Puerto',tagline:'Café, descanso y hospitalidad junto al puerto.',description:'Sabores honestos, madera cálida y una estadía atendida con cercanía.',logoUrl:null,heroImageUrl:null,primaryColor:'#9B1C1F',secondaryColor:'#604536',accentColor:'#D09A52',surfaceColor:'#F4EDE3',guestTitle:'Tu habitación, más cerca de todo',guestDescription:'Pide a la habitación, solicita amenidades y sigue cada servicio desde aquí.',address:'',phone:''};
  if(path==='/catalog')return products;
  throw new Error('Demostración local: pedidos, pagos y accesos reales desactivados.');
}
