export const MAX_GAMES_PER_ORDER=3;
export const GAME_COOLDOWN_MS=6*60*60*1000;

export type GameAllowance={canStart:boolean,gamesUsed:number,gamesRemaining:number,nextAvailableAt:string|null};

export function gameAllowance(totalGames:number,lastGameAt:string|Date|null,now=new Date()):GameAllowance{
  if(totalGames===0)return{canStart:true,gamesUsed:0,gamesRemaining:MAX_GAMES_PER_ORDER,nextAvailableAt:null};
  const gamesUsed=totalGames%MAX_GAMES_PER_ORDER;
  if(gamesUsed>0)return{canStart:true,gamesUsed,gamesRemaining:MAX_GAMES_PER_ORDER-gamesUsed,nextAvailableAt:null};
  const unlockAt=new Date(new Date(lastGameAt??now).getTime()+GAME_COOLDOWN_MS);
  if(now<unlockAt)return{canStart:false,gamesUsed:MAX_GAMES_PER_ORDER,gamesRemaining:0,nextAvailableAt:unlockAt.toISOString()};
  return{canStart:true,gamesUsed:0,gamesRemaining:MAX_GAMES_PER_ORDER,nextAvailableAt:null};
}
