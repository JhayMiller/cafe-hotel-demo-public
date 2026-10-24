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
  const supportedPlayers=Math.min(maxPlayers,totalUnits);
  if(totalUnits<1)return {allowed:false,confidence:'none' as const,totalUnits,supportedPlayers,reason:'Este pedido no contiene porciones que habiliten la partida'};
  if(players>supportedPlayers)return {allowed:false,confidence:'none' as const,totalUnits,supportedPlayers,
    reason:`La cantidad de jugadores no coincide con el consumo. El pedido pagado respalda hasta ${supportedPlayers} jugador(es). Ingresa el número correcto.`};

  const largestGroup=Math.max(...Object.values(counts));
  // Cada jugador recibe al menos una porción. Si además ningún grupo necesita repetirse
  // en una misma persona, la distribución entre bebida/comida es especialmente natural.
  const confidence=totalUnits===players?'exact' as const:largestGroup<=players?'high' as const:'supported' as const;
  return {allowed:true,confidence,totalUnits,supportedPlayers,reason:confidence==='exact'
    ?'La cantidad coincide exactamente con las porciones del pedido.'
    :'La combinación del pedido respalda esa cantidad de jugadores.'};
}
