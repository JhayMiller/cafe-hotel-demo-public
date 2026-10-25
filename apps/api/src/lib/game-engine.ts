export type FlightResult={score:number,durationMs:number};

export function replayFlight(seed:number,flaps:number[],claimedDuration:number):FlightResult{
  let state=seed|0,y=285,vy=0,score=0,spawnAt=1650,flapIndex=0;
  const palms:{x:number,gapY:number,passed:boolean}[]=[];
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
  const stepMs=1000/60,totalSteps=Math.ceil(claimedDuration/stepMs);
  for(let step=1;step<=totalSteps;step++){
    const now=step*stepMs;
    while(flapIndex<flaps.length&&flaps[flapIndex]!<=now){vy=-390;flapIndex++;}
    vy+=1120/60;y+=vy/60;
    while(now>=spawnAt){palms.push({x:405,gapY:160+random()*270,passed:false});spawnAt+=1650;}
    for(const palm of palms){
      palm.x-=138/60;
      if(!palm.passed&&palm.x+58<82){palm.passed=true;score++;}
      const inX=106>palm.x&&58<palm.x+58;
      const safe=y-18>palm.gapY-82&&y+18<palm.gapY+82;
      if(inX&&!safe)return{score,durationMs:Math.round(now)};
    }
    if(y<12||y>592)return{score,durationMs:Math.round(now)};
  }
  return{score,durationMs:Math.round(totalSteps*stepMs)};
}
