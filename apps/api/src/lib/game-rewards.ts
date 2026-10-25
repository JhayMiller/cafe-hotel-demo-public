export type RewardDefinition={key:string,scope:'customer'|'table',title:string,description:string,days:number};

export function earnedReward(mode:string,score:number,players:number):RewardDefinition|null{
  if(mode==='individual'){
    if(score>=35)return{key:'individual-coffee',scope:'customer',title:'Café de la casa gratis',description:'Válido en una visita futura. No canjeable por dinero.',days:30};
    if(score>=20)return{key:'individual-15',scope:'customer',title:'15% de descuento',description:'En una compra futura, máximo $15.000 COP. No acumulable.',days:30};
    if(score>=10)return{key:'individual-10',scope:'customer',title:'10% de descuento',description:'En una compra futura, máximo $10.000 COP. No acumulable.',days:21};
  }else{
    const average=Math.floor(score/players);
    if(average>=25)return{key:'friends-10',scope:'table',title:'10% para toda la mesa',description:'En una visita futura, máximo $20.000 COP. No acumulable.',days:21};
    if(average>=15)return{key:'friends-5',scope:'table',title:'5% para toda la mesa',description:'En una visita futura, máximo $10.000 COP. No acumulable.',days:21};
    if(average>=10)return{key:'friends-tasting',scope:'table',title:'Detalle para compartir',description:'Pregunta por el detalle disponible en una próxima visita.',days:14};
  }
  return null;
}

export const earnsRecordBonus=(oldBest:number,newScore:number)=>oldBest>=10&&newScore>oldBest;
