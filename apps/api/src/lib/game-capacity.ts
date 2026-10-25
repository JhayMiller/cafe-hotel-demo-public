export const GAME_GROUPS=['beverage','pastry','meal','packaged','other'] as const;
export type GameGroup=typeof GAME_GROUPS[number];
export type ConsumptionCounts=Record<GameGroup,number>;

export const emptyConsumption=():ConsumptionCounts=>({beverage:0,pastry:0,meal:0,packaged:0,other:0});

export function consumptionFromRows(rows:Array<{game_group_snapshot:string,units:number|string}>):ConsumptionCounts{
  const counts=emptyConsumption();
  for(const row of rows){
    if(GAME_GROUPS.includes(row.game_group_snapshot as GameGroup))counts[row.game_group_snapshot as GameGroup]+=Number(row.units);
  }
  return counts;
}

export function assessParty(counts:ConsumptionCounts,players:number,maxPlayers=20){
  const totalUnits=Object.values(counts).reduce((sum,value)=>sum+value,0);
  const beverageUnits=counts.beverage;
  const foodUnits=counts.pastry+counts.meal+counts.packaged+counts.other;
  // Una bebida y un alimento suelen pertenecer a la misma persona. Los distintos
  // alimentos sí se suman porque cada porción puede representar a un comensal.
  const supportedPlayers=Math.min(maxPlayers,Math.max(beverageUnits,foodUnits));
  if(totalUnits<1)return {allowed:false,confidence:'none' as const,totalUnits,supportedPlayers,reason:'Este pedido no contiene porciones que habiliten la partida'};
  if(players>supportedPlayers)return {allowed:false,confidence:'none' as const,totalUnits,supportedPlayers,
    reason:`La cantidad de jugadores no coincide con el consumo. El pedido pagado respalda hasta ${supportedPlayers} jugador(es). Ingresa el número correcto.`};

  const confidence=beverageUnits===players&&foodUnits===players?'exact' as const:players===supportedPlayers?'high' as const:'supported' as const;
  return {allowed:true,confidence,totalUnits,supportedPlayers,reason:confidence==='exact'
    ?'La cantidad coincide con las bebidas y los alimentos del pedido.'
    :'La combinación del pedido respalda esa cantidad de jugadores.'};
}
