export const REWARD_EXPIRY_DAYS=30;
export const MAX_ACTIVE_REWARDS=3;
export const MAX_DISCOUNT_COP=10000;
export const INDIVIDUAL_REWARDS=[
  {points:10,percent:2},{points:15,percent:4},{points:20,percent:6},{points:25,percent:8},{points:30,percent:10}
] as const;
export const FRIENDS_REWARDS=[
  {points:10,percent:2},{points:15,percent:3},{points:20,percent:4},{points:25,percent:5},{points:30,percent:6}
] as const;
export type RewardDefinition={key:string,scope:'customer'|'table',title:string,description:string,days:number,discountPercent:number,maxDiscountCop:number};

function definition(mode:'individual'|'friends',percent:number):RewardDefinition{
  const scope=mode==='individual'?'customer':'table';
  return{key:`${mode}-${percent}`,scope,title:`${percent}% de descuento${scope==='table'?' para la mesa':''}`,
    description:'En un próximo pedido de café, máximo $10.000 COP. No acumulable.',days:REWARD_EXPIRY_DAYS,
    discountPercent:percent,maxDiscountCop:MAX_DISCOUNT_COP};
}

export function earnedReward(mode:string,score:number,players:number):RewardDefinition|null{
  if(mode==='individual'){
    const tier=[...INDIVIDUAL_REWARDS].reverse().find(item=>score>=item.points);
    return tier?definition('individual',tier.percent):null;
  }else{
    const average=Math.floor(score/players);
    const tier=[...FRIENDS_REWARDS].reverse().find(item=>average>=item.points);
    return tier?definition('friends',tier.percent):null;
  }
  return null;
}

export const earnsRecordBonus=(oldBest:number,newScore:number)=>oldBest>=10&&newScore>oldBest;

export function applyRecordBonus(reward:RewardDefinition|null,earned:boolean){
  if(!reward||!earned)return reward;
  const percent=Math.min(10,reward.discountPercent+1);
  return{...reward,key:`${reward.key}-record`,title:`${percent}% de descuento`,discountPercent:percent};
}
