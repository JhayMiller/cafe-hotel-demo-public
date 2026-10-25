import {createHmac,randomInt,timingSafeEqual} from 'node:crypto';

export const REWARD_PIN_TTL_MINUTES=10;
export const REWARD_PIN_MAX_ATTEMPTS=5;
export const createRewardPin=()=>String(randomInt(0,1_000_000)).padStart(6,'0');
export const hashRewardPin=(challengeId:string,rewardId:string,pin:string)=>createHmac('sha256',process.env.PIN_PEPPER!).update(`reward:${challengeId}:${rewardId}:${pin}`).digest('hex');
export function validRewardPin(challengeId:string,rewardId:string,pin:string,expected:string){
  const actual=Buffer.from(hashRewardPin(challengeId,rewardId,pin)),stored=Buffer.from(expected);
  return actual.length===stored.length&&timingSafeEqual(actual,stored);
}
export const maskPhone=(phone:string)=>`${phone.slice(0,3)} ••• ••• ${phone.slice(-2)}`;
