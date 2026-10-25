export const MAX_GAMES_PER_ORDER=3;
export const remainingGames=(used:number)=>Math.max(0,MAX_GAMES_PER_ORDER-used);
export const canStartGame=(used:number)=>remainingGames(used)>0;
