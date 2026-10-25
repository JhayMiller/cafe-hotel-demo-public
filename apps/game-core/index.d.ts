export const ENGINE_VERSION:3;
export const TICK_MS:number;
export type FlightObstacle={x:number;gapY:number;passed:boolean};
export type FlightState={engineVersion:number;seed:number;randomState:number;tick:number;y:number;vy:number;score:number;nextSpawnTick:number;finished:boolean;finishReason:'obstacle'|'boundary'|null;obstacles:FlightObstacle[]};
export type FlightResult={score:number;terminalTick:number;durationMs:number;finished:boolean;finishReason:'obstacle'|'boundary'|null};
export function createFlight(seed:number):FlightState;
export function advanceFlight(flight:FlightState,flap?:boolean):FlightState;
export function replayFlight(seed:number,flapTicks:number[],terminalTick:number):FlightResult;
