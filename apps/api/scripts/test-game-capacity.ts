import assert from 'node:assert/strict';
import {assessParty,type ConsumptionCounts} from '../src/lib/game-capacity.js';

const counts=(values:Partial<ConsumptionCounts>):ConsumptionCounts=>({beverage:0,pastry:0,meal:0,packaged:0,other:0,...values});

const fivePeople=assessParty(counts({beverage:3,pastry:4,packaged:1}),5);
assert.equal(fivePeople.allowed,true);
assert.equal(fivePeople.confidence,'high');
assert.equal(fivePeople.supportedPlayers,5);

const falseFive=assessParty(counts({beverage:2,pastry:2}),5);
assert.equal(falseFive.allowed,false);
assert.match(falseFive.reason,/no coincide/i);
assert.equal(falseFive.supportedPlayers,2);

const exactTwo=assessParty(counts({beverage:2,pastry:2}),2);
assert.equal(exactTwo.allowed,true);
assert.equal(exactTwo.confidence,'exact');

const eightPeople=assessParty(counts({beverage:4,meal:8}),8);
assert.equal(eightPeople.allowed,true);
assert.equal(eightPeople.supportedPlayers,8);

const capped=assessParty(counts({packaged:30}),21);
assert.equal(capped.allowed,false);
assert.equal(capped.supportedPlayers,20);

console.log('Validación de consumo: 5 escenarios correctos.');
