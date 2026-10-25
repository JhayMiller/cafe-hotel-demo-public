export const ENGINE_VERSION=3;
export const TICK_MS=1000/60;

function nextRandom(flight){
  let value=flight.randomState|0;
  value^=value<<13;value^=value>>>17;value^=value<<5;
  flight.randomState=value|0;
  return(value>>>0)/4294967296;
}

export function createFlight(seed){
  return{engineVersion:ENGINE_VERSION,seed:seed|0,randomState:seed|0,tick:0,y:285,vy:0,score:0,
    nextSpawnTick:99,finished:false,finishReason:null,obstacles:[]};
}

export function advanceFlight(flight,flap=false){
  if(flight.finished)return flight;
  flight.tick++;
  if(flap)flight.vy=-390;
  flight.vy+=1120/60;
  flight.y+=flight.vy/60;
  while(flight.tick>=flight.nextSpawnTick){
    flight.obstacles.push({x:405,gapY:160+nextRandom(flight)*270,passed:false});
    flight.nextSpawnTick+=99;
  }
  for(const palm of flight.obstacles){
    palm.x-=138/60;
    if(!palm.passed&&palm.x+58<82){palm.passed=true;flight.score++;}
    // La zona física cubre el tronco y la cabeza. Las alas y la cola son visuales.
    const inX=108>palm.x&&68<palm.x+58;
    const safe=flight.y-15>palm.gapY-82&&flight.y+15<palm.gapY+82;
    if(inX&&!safe){flight.finished=true;flight.finishReason='obstacle';return flight;}
  }
  if(flight.y<15||flight.y>591){flight.finished=true;flight.finishReason='boundary';}
  return flight;
}

export function replayFlight(seed,flapTicks,terminalTick){
  const flight=createFlight(seed),flaps=new Set(flapTicks);
  while(!flight.finished&&flight.tick<terminalTick)advanceFlight(flight,flaps.has(flight.tick+1));
  return{score:flight.score,terminalTick:flight.tick,durationMs:Math.round(flight.tick*TICK_MS),
    finished:flight.finished,finishReason:flight.finishReason};
}
